# -*- coding: utf-8 -*-
"""
组件下载管理器
统一管理所有组件的下载和安装
"""

import os
import tempfile
import shutil
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import structlog

from ...ui.interface import ui
from .nodejs_downloader import NodeJSDownloader
from .vscode_downloader import VSCODEDownloader
from .git_downloader import GitDownloader
from .go_downloader import GoDownloader
from .python_downloader import PythonDownloader
from .mongodb_downloader import MongoDBDownloader
from .sqlitestudio_downloader import SQLiteStudioDownloader
from .napcat_downloader import NapCatDownloader
from .webui_downloader import WebUIDownloader
from .desktop_pet_downloader import DesktopPetDownloader

logger = structlog.get_logger(__name__)


class ComponentManager:
    """组件下载管理器"""
    
    def __init__(self):
        # 组件下载器映射
        self.downloaders = {
            'nodejs': NodeJSDownloader(),
            'vscode': VSCODEDownloader(),
            'git': GitDownloader(),
            'go': GoDownloader(),
            'python': PythonDownloader(),
            'mongodb': MongoDBDownloader(),
            'sqlitestudio': SQLiteStudioDownloader(),
            'napcat': NapCatDownloader(),
            'webui': WebUIDownloader(),
            'desktop_pet': DesktopPetDownloader()
        }
        
        # 组件信息
        self.components_info = {
            'nodejs': {
                'name': 'Node.js',
                'description': 'JavaScript运行时环境',
                'icon': '🟢'
            },
            'vscode': {
                'name': 'Visual Studio Code',
                'description': '轻量级代码编辑器',
                'icon': '🔵'
            },
            'git': {
                'name': 'Git',
                'description': '分布式版本控制系统',
                'icon': '🟠'
            },
            'go': {
                'name': 'Go',
                'description': 'Go编程语言',
                'icon': '💙'
            },
            'python': {
                'name': 'Python',
                'description': 'Python编程语言',
                'icon': '🐍'
            },
            'mongodb': {
                'name': 'MongoDB',
                'description': 'NoSQL数据库',
                'icon': '🟢'
            },
            'sqlitestudio': {
                'name': 'SQLiteStudio',
                'description': 'SQLite数据库管理工具',
                'icon': '🗄️'
            },
            'napcat': {
                'name': 'NapCat',
                'description': 'QQ机器人适配器（下载在用户下载目录）',
                'icon': '🐱'
            },
            'webui': {
                'name': 'MaiBot WebUI',
                'description': 'MaiBot控制面板Web界面',
                'icon': '🌐'
            },
            'desktop_pet': {
                'name': 'MCStart Desktop Pet',
                'description': 'MCStart桌面宠物（AI助手、日程管理、待办事项）',
                'icon': '🐾'
            }
        }
    
    def get_temporary_directory(self) -> Path:
        """获取或创建临时目录"""
        temp_dir = Path.cwd() / "Temporary"
        temp_dir.mkdir(exist_ok=True)
        return temp_dir
    
    def show_component_download_menu(self):
        """显示组件下载菜单"""
        ui.clear_screen()
        ui.components.show_title("组件下载中心", symbol="📦")
        
        # 显示组件列表
        from rich.table import Table
        table = Table(
            show_header=True,
            header_style=ui.colors["table_header"],
            title="[bold]可下载组件[/bold]",
            title_style=ui.colors["primary"],
            border_style=ui.colors["border"]
        )
        table.add_column("选项", style="cyan", width=6, justify="center")
        table.add_column("组件", style=ui.colors["primary"], width=20)
        table.add_column("描述", style="green")
        table.add_column("状态", style="yellow", width=10, justify="center")
        
        for i, (key, info) in enumerate(self.components_info.items(), 1):
            status = "✅ 可下载" if key in self.downloaders else "❌ 暂不支持"
            table.add_row(
                f"[{i}]",
                f"{info['icon']} {info['name']}",
                info['description'],
                status
            )
        
        ui.console.print(table)
        ui.console.print("\n[Q] 返回上级菜单", style=ui.colors["info"])
        
        return self._get_component_choice()
    
    def _get_component_choice(self) -> Optional[str]:
        """获取用户选择的组件"""
        while True:
            choice = ui.get_input("请选择要下载的组件：").strip().upper()
            
            if choice == 'Q':
                return None
            
            try:
                choice_num = int(choice)
                if 1 <= choice_num <= len(self.components_info):
                    component_key = list(self.components_info.keys())[choice_num - 1]
                    return component_key
                else:
                    ui.print_error("无效选项，请重新选择")
            except ValueError:
                ui.print_error("请输入有效的数字")
    
    def download_component(self, component_key: str, non_interactive: bool = False, task_id: str | None = None, progress_cb=None, install_path: str | None = None) -> bool:
        """下载指定组件
        non_interactive=True 时用于 WebUI/API，自动选择默认版本以避免交互阻塞
        progress_cb: 可选进度回调，签名为 callback(dict)
        install_path: 可选安装路径（用于 SQLiteStudio 等绿色软件）
        """
        if component_key not in self.downloaders:
            ui.print_error(f"组件 '{component_key}' 不受支持")
            if progress_cb:
                progress_cb({"status": "failed", "phase": "failed", "message": "组件不受支持"})
            return False

        info = self.components_info[component_key]
        ui.print_info(f"开始下载 {info['name']}...")

        # 创建取消检查回调
        def is_canceled():
            if task_id:
                try:
                    from src.webui_api.components_api import _is_canceled
                    return _is_canceled(task_id)
                except Exception:
                    return False
            return False

        try:
            # 获取临时目录
            temp_dir = self.get_temporary_directory()

            # 执行下载（通过 inspect 检查签名，兼容新旧下载器）
            import inspect
            downloader = self.downloaders[component_key]
            auto_latest = non_interactive and component_key != 'python'
            params = inspect.signature(downloader.download_and_install).parameters
            kwargs: dict = {}
            if 'auto_select_latest' in params:
                kwargs['auto_select_latest'] = auto_latest
            if 'task_id' in params:
                kwargs['task_id'] = task_id
            if 'progress_cb' in params:
                kwargs['progress_cb'] = progress_cb
            if 'non_interactive' in params:
                kwargs['non_interactive'] = non_interactive
            if 'is_canceled_callback' in params:
                kwargs['is_canceled_callback'] = is_canceled
            if 'install_path' in params:
                kwargs['install_path'] = install_path
            success = downloader.download_and_install(temp_dir, **kwargs)

            # 检查是否被取消
            if is_canceled():
                ui.print_warning("下载已取消")
                if progress_cb:
                    progress_cb({"status": "canceled", "phase": "canceled", "message": "已取消"})
                return False

            if success:
                ui.print_success(f"✅ {info['name']} 下载并安装完成")
                logger.info("组件下载成功", component=component_key)

                if progress_cb:
                    progress_cb({"status": "done", "phase": "done", "percent": 100, "message": "完成"})

                # NapCat和SQLiteStudio不删除安装包（文件已在用户指定位置或需要保留）
                if component_key not in ('napcat', 'sqlitestudio'):
                    # WebUI 模式延迟删除安装包（等待安装程序完成）
                    if non_interactive:
                        import threading
                        import time
                        def delayed_cleanup():
                            time.sleep(5)  # 等待5秒让安装程序启动完成
                            self._cleanup_installer(component_key, temp_dir)
                        threading.Thread(target=delayed_cleanup, daemon=True).start()
                    elif ui.confirm("是否删除安装包以节省空间？"):
                        self._cleanup_installer(component_key, temp_dir)

                return True
            else:
                ui.print_error(f"❌ {info['name']} 下载或安装失败")
                logger.error("组件下载失败", component=component_key)
                if progress_cb:
                    progress_cb({"status": "failed", "phase": "failed", "message": "下载或安装失败"})
                return False

        except Exception as e:
            ui.print_error(f"下载 {info['name']} 时发生错误：{str(e)}")
            logger.error("组件下载异常", component=component_key, error=str(e))
            if progress_cb:
                progress_cb({"status": "failed", "phase": "failed", "message": str(e), "error": str(e)})
            return False
    
    def _cleanup_installer(self, component_key: str, temp_dir: Path):
        """清理安装包"""
        try:
            # 根据组件类型清理相关文件
            patterns = {
                'nodejs': ['nodejs*.exe', 'nodejs*.msi'],
                'vscode': ['VSCode*.exe', 'VSCode*.zip'],
                'git': ['Git*.exe', 'Git*.msi'],
                'go': ['go*.msi', 'go*.tar.gz'],  # 修正Go的清理模式
                'python': ['python*.exe', 'python*.msi'],
                'mongodb': ['mongodb*.exe', 'mongodb*.msi'],
                'sqlitestudio': ['SQLiteStudio*.exe', 'SQLiteStudio*.zip'],
                'napcat': ['NapCat*.zip'],
                'webui': ['webui*.zip']
            }
            
            if component_key in patterns:
                for pattern in patterns[component_key]:
                    for file in temp_dir.glob(pattern):
                        if file.is_file():
                            self._safe_delete_file(file)
            
            ui.print_success("安装包清理完成")
            
        except Exception as e:
            ui.print_warning(f"清理安装包时发生错误：{str(e)}")
    
    def _safe_delete_file(self, file_path: Path, max_retries: int = 5, retry_delay: float = 1.0):
        """安全删除文件，支持重试和强制删除"""
        import time
        import os
        import stat
        import subprocess
        
        for attempt in range(max_retries):
            try:
                # 检查文件是否存在
                if not file_path.exists():
                    return
                
                # 尝试修改文件权限（Windows）
                if os.name == 'nt':
                    try:
                        os.chmod(str(file_path), stat.S_IWRITE)
                    except:
                        pass
                
                # 尝试普通删除
                file_path.unlink()
                ui.print_info(f"已删除：{file_path.name}")
                return
                
            except PermissionError:
                # 文件被占用，尝试强制删除
                if attempt < max_retries - 1:
                    ui.print_info(f"文件被占用，尝试强制删除 ({attempt + 1}/{max_retries}): {file_path.name}")
                    
                    try:
                        time.sleep(retry_delay)
                        
                        # Windows下使用PowerShell强制删除
                        if os.name == 'nt':
                            # 使用PowerShell的Remove-Item -Force
                            cmd = f'Remove-Item -Path "{file_path}" -Force -ErrorAction SilentlyContinue'
                            result = subprocess.run(
                                ['powershell', '-Command', cmd],
                                capture_output=True,
                                text=True,
                                timeout=10
                            )
                        else:
                            # Linux/macOS下使用rm命令强制删除
                            try:
                                os.chmod(str(file_path), 0o777)
                            except:
                                pass
                            subprocess.run(['rm', '-f', str(file_path)],
                                         capture_output=True,
                                         timeout=10)
                        
                        # 等待一下再检查
                        time.sleep(retry_delay * 0.5)
                        
                        # 检查是否删除成功
                        if not file_path.exists():
                            ui.print_info(f"已强制删除：{file_path.name}")
                            return
                        
                    except subprocess.TimeoutExpired:
                        ui.print_warning(f"删除命令超时 ({attempt + 1}/{max_retries})")
                    except Exception as force_error:
                        ui.print_warning(f"强制删除失败 ({attempt + 1}/{max_retries}): {str(force_error)}")
                    
                    time.sleep(retry_delay)
                else:
                    ui.print_warning(f"无法删除文件（文件可能正在使用中）：{file_path.name}")
                    ui.print_info("建议稍后手动删除该文件")
                    
            except Exception as e:
                if attempt < max_retries - 1:
                    ui.print_warning(f"删除文件失败，重试中 ({attempt + 1}/{max_retries}): {str(e)}")
                    time.sleep(retry_delay)
                else:
                    ui.print_warning(f"无法删除文件：{file_path.name}")
                    ui.print_info("建议稍后手动删除该文件")
    
    def download_multiple_components(self, component_keys: List[str]) -> Dict[str, bool]:
        """批量下载组件"""
        results = {}
        
        for key in component_keys:
            ui.print_info(f"正在下载组件 {key} ({len(results) + 1}/{len(component_keys)})")
            results[key] = self.download_component(key)
        
        return results
    
    def get_component_info(self, component_key: str) -> Optional[Dict]:
        """获取组件信息"""
        return self.components_info.get(component_key)
    
    def list_available_components(self) -> List[str]:
        """获取所有可用的组件键"""
        return list(self.components_info.keys())
    
    def check_component_status(self, component_key: str) -> Dict:
        """检查组件状态"""
        info = self.get_component_info(component_key)
        if not info:
            return {'status': 'unknown', 'message': '组件信息不存在'}
        
        # 检查下载器是否存在
        if component_key in self.downloaders:
            return {
                'status': 'available',
                'message': '组件可下载',
                'info': info
            }
        else:
            return {
                'status': 'unavailable',
                'message': '暂不支持此组件',
                'info': info
            }


# 全局组件管理器实例
component_manager = ComponentManager()