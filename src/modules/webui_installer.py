"""
WebUI安装模块
负责MaiMbot WebUI的下载、安装和配置
支持分支选择和Node.js环境检测
"""
import os
import subprocess
import tempfile
import shutil
import platform
import requests
import zipfile
import time
import warnings
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import structlog
from tqdm import tqdm
from ..ui.interface import ui
from ..utils.common import validate_path

# 忽略SSL警告（用于GitHub API访问）
warnings.filterwarnings('ignore', message='Unverified HTTPS request')

logger = structlog.get_logger(__name__)


class WebUIInstaller:
    """WebUI安装器类"""
    
    def __init__(self):
        self.webui_repo = "minecraft1024a/MaiMbot-WEBui-adapter"
        self.webui_cache_dir = Path.home() / ".maibot" / "webui_cache"
        self.webui_cache_dir.mkdir(parents=True, exist_ok=True)
        self._offline_mode = False
    
    def check_nodejs_installed(self) -> Tuple[bool, str]:
        """检查Node.js是否已安装"""
        try:
            # 在Windows上，尝试不同的node命令路径
            node_commands = ["node", "node.exe"]
            
            for node_cmd in node_commands:
                try:
                    result = subprocess.run(
                        [node_cmd, "--version"], 
                        capture_output=True, 
                        text=True, 
                        timeout=10,
                        shell=True  # 在Windows上使用shell
                    )
                    if result.returncode == 0:
                        version = result.stdout.strip()
                        logger.info("Node.js已安装", version=version, command=node_cmd)
                        return True, version
                except (subprocess.TimeoutExpired, FileNotFoundError, subprocess.SubprocessError):
                    continue
            
            logger.info("Node.js未安装或不可用")
            return False, ""
        except Exception as e:
            logger.info("Node.js检查异常", error=str(e))
            return False, ""
    
    def check_npm_installed(self) -> Tuple[bool, str]:
        """检查npm是否已安装"""
        try:
            # 在Windows上，尝试不同的npm命令路径
            npm_commands = ["npm", "npm.cmd"]
            
            for npm_cmd in npm_commands:
                try:
                    result = subprocess.run(
                        [npm_cmd, "--version"], 
                        capture_output=True, 
                        text=True, 
                        timeout=10,
                        shell=True  # 在Windows上使用shell
                    )
                    if result.returncode == 0:
                        version = result.stdout.strip()
                        logger.info("npm已安装", version=version, command=npm_cmd)
                        return True, version
                except (subprocess.TimeoutExpired, FileNotFoundError, subprocess.SubprocessError):
                    continue
            
            logger.info("npm未安装或不可用")
            return False, ""
        except Exception as e:
            logger.info("npm检查异常", error=str(e))
            return False, ""
    
    def install_nodejs(self) -> bool:
        """安装Node.js"""
        try:
            ui.print_info("正在安装Node.js...")
            
            if platform.system() == "Windows":
                return self._install_nodejs_windows()
            elif platform.system() == "Darwin":
                return self._install_nodejs_macos()
            elif platform.system() == "Linux":
                return self._install_nodejs_linux()
            else:
                ui.print_error("不支持的操作系统")
                return False
                
        except Exception as e:
            ui.print_error(f"Node.js安装失败：{str(e)}")
            logger.error("Node.js安装失败", error=str(e))
            return False
    
    def _install_nodejs_windows(self) -> bool:
        """在Windows上安装Node.js"""
        try:
            ui.print_info("正在下载Node.js Windows安装包...")
            
            # 下载Node.js LTS版本
            nodejs_url = "https://nodejs.org/dist/v18.19.1/node-v18.19.1-x64.msi"
            
            with tempfile.TemporaryDirectory() as temp_dir:
                installer_path = os.path.join(temp_dir, "nodejs_installer.msi")
                
                response = requests.get(nodejs_url, stream=True, timeout=60, verify=False)
                response.raise_for_status()
                
                with open(installer_path, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        f.write(chunk)
                
                ui.print_info("正在安装Node.js...")
                ui.print_warning("请在弹出的安装程序中完成Node.js安装")
                
                # 启动安装程序
                subprocess.run([installer_path], check=True)
                
                # 等待用户完成安装
                ui.pause("安装完成后按回车继续...")
                
                # 验证安装
                return self._verify_nodejs_installation()
                
        except Exception as e:
            ui.print_error(f"Windows Node.js安装失败：{str(e)}")
            return False
    
    def _install_nodejs_macos(self) -> bool:
        """在macOS上安装Node.js"""
        try:
            # 尝试使用Homebrew安装
            ui.print_info("尝试使用Homebrew安装Node.js...")
            
            try:
                subprocess.run(["brew", "install", "node"], check=True)
                ui.print_success("Node.js安装完成")
                return True
            except subprocess.CalledProcessError:
                ui.print_warning("Homebrew安装失败，请手动安装Node.js")
                ui.print_info("请访问 https://nodejs.org/ 下载并安装Node.js")
                return False
                
        except Exception as e:
            ui.print_error(f"macOS Node.js安装失败：{str(e)}")
            return False
    
    def _install_nodejs_linux(self) -> bool:
        """在Linux上安装Node.js"""
        try:
            ui.print_info("正在安装Node.js...")
            
            # 尝试使用包管理器安装
            try:
                # 尝试apt-get (Ubuntu/Debian)
                subprocess.run(["sudo", "apt-get", "update"], check=True)
                subprocess.run(["sudo", "apt-get", "install", "-y", "nodejs", "npm"], check=True)
                ui.print_success("Node.js安装完成")
                return True
            except subprocess.CalledProcessError:
                try:
                    # 尝试yum (CentOS/RHEL)
                    subprocess.run(["sudo", "yum", "install", "-y", "nodejs", "npm"], check=True)
                    ui.print_success("Node.js安装完成")
                    return True
                except subprocess.CalledProcessError:
                    ui.print_warning("自动安装失败，请手动安装Node.js")
                    ui.print_info("请访问 https://nodejs.org/ 下载并安装Node.js")
                    return False
                    
        except Exception as e:
            ui.print_error(f"Linux Node.js安装失败：{str(e)}")
            return False
    
    def _verify_nodejs_installation(self) -> bool:
        """验证Node.js安装"""
        try:
            ui.print_info("验证Node.js安装...")
            
            # 检查Node.js
            node_installed, node_version = self.check_nodejs_installed()
            if not node_installed:
                return False
            
            # 检查npm
            npm_installed, npm_version = self.check_npm_installed()
            if not npm_installed:
                return False
            
            ui.print_success(f"Node.js验证成功: {node_version}")
            ui.print_success(f"npm验证成功: {npm_version}")
            return True
            
        except Exception as e:
            ui.print_error(f"Node.js验证失败：{str(e)}")
            return False
    
    def get_webui_branches(self) -> List[Dict]:
        """获取WebUI分支列表"""
        try:
            ui.print_info("正在获取WebUI分支列表...")
            
            url = f"https://api.github.com/repos/{self.webui_repo}/branches"
            response = requests.get(url, timeout=30, verify=False)  # 跳过SSL验证
            response.raise_for_status()
            
            branches_data = response.json()
            branches = []
            
            for branch in branches_data:
                branch_info = {
                    "name": branch["name"],
                    "display_name": branch["name"],
                    "commit_sha": branch["commit"]["sha"][:7],
                    "download_url": f"https://github.com/{self.webui_repo}/archive/refs/heads/{branch['name']}.zip"
                }
                branches.append(branch_info)
            
            logger.info("获取WebUI分支列表成功", count=len(branches))
            return branches
            
        except Exception as e:
            ui.print_error(f"获取WebUI分支列表失败：{str(e)}")
            logger.error("获取WebUI分支列表失败", error=str(e))
            return []
    
    def show_webui_branch_menu(self) -> Optional[Dict]:
        """显示WebUI分支选择菜单"""
        try:
            ui.clear_screen()
            ui.console.print("[🌐 选择WebUI分支]", style=ui.colors["primary"])
            ui.console.print("="*40)
            
            branches = self.get_webui_branches()
            if not branches:
                ui.print_error("无法获取WebUI分支信息")
                return None
            
            # 创建分支表格
            from rich.table import Table
            table = Table(show_header=True, header_style="bold magenta")
            table.add_column("选项", style="cyan", width=6)
            table.add_column("分支名", style="white", width=20)
            table.add_column("提交SHA", style="yellow", width=10)
            table.add_column("说明", style="green")
            
            for i, branch in enumerate(branches, 1):
                description = "主分支" if branch["name"] == "main" else f"{branch['name']}分支"
                table.add_row(
                    f"[{i}]",
                    branch["display_name"],
                    branch["commit_sha"],
                    description
                )
            
            ui.console.print(table)
            ui.console.print("\n[Q] 跳过WebUI安装", style="#7E1DE4")
            
            while True:
                choice = ui.get_input("请选择WebUI分支：").strip()
                
                if choice.upper() == 'Q':
                    return None
                
                try:
                    choice_idx = int(choice) - 1
                    if 0 <= choice_idx < len(branches):
                        selected_branch = branches[choice_idx]
                        ui.print_success(f"已选择：{selected_branch['display_name']}")
                        return selected_branch
                    else:
                        ui.print_error("选项超出范围")
                except ValueError:
                    ui.print_error("请输入有效的数字")
                    
        except Exception as e:
            ui.print_error(f"显示WebUI分支菜单失败：{str(e)}")
            logger.error("显示WebUI分支菜单失败", error=str(e))
            return None
    
    def download_webui(self, branch_info: Dict, install_dir: str) -> Optional[str]:
        """下载WebUI"""
        try:
            ui.print_info(f"正在下载WebUI {branch_info['display_name']}...")
            
            with tempfile.TemporaryDirectory() as temp_dir:
                # 下载WebUI源码
                download_url = branch_info["download_url"]
                archive_path = os.path.join(temp_dir, f"webui_{branch_info['name']}.zip")
                
                response = requests.get(download_url, stream=True, timeout=60, verify=False)
                response.raise_for_status()
                
                total_size = int(response.headers.get('content-length', 0))
                
                with open(archive_path, 'wb') as f, tqdm(
                    desc=f"webui_{branch_info['name']}.zip",
                    total=total_size,
                    unit='iB',
                    unit_scale=True,
                    unit_divisor=1024,
                ) as progress_bar:
                    for chunk in response.iter_content(chunk_size=8192):
                        if chunk:
                            f.write(chunk)
                            progress_bar.update(len(chunk))
                
                # 解压WebUI
                ui.print_info("正在解压WebUI...")
                extract_dir = os.path.join(temp_dir, "webui_extract")
                
                with zipfile.ZipFile(archive_path, 'r') as zip_ref:
                    zip_ref.extractall(extract_dir)
                
                # 查找解压后的目录
                extracted_dirs = [d for d in os.listdir(extract_dir) 
                                if os.path.isdir(os.path.join(extract_dir, d)) and d != "__MACOSX"]
                
                if not extracted_dirs:
                    ui.print_error("解压后未找到WebUI目录")
                    return None
                
                source_dir = os.path.join(extract_dir, extracted_dirs[0])
                
                # 创建WebUI目录
                webui_dir = os.path.join(install_dir, "WebUI")
                os.makedirs(webui_dir, exist_ok=True)
                
                # 复制WebUI文件
                ui.print_info("正在安装WebUI文件...")
                for item in os.listdir(source_dir):
                    src_path = os.path.join(source_dir, item)
                    dst_path = os.path.join(webui_dir, item)
                    
                    if os.path.isfile(src_path):
                        shutil.copy2(src_path, dst_path)
                    elif os.path.isdir(src_path):
                        if os.path.exists(dst_path):
                            shutil.rmtree(dst_path)
                        shutil.copytree(src_path, dst_path)
                
                ui.print_success("WebUI下载完成")
                logger.info("WebUI下载成功", path=webui_dir)
                return webui_dir
                
        except Exception as e:
            ui.print_error(f"WebUI下载失败：{str(e)}")
            logger.error("WebUI下载失败", error=str(e))
            return None
    
    def install_webui_dependencies(self, webui_dir: str, venv_path: str = "") -> bool:
        """安装WebUI前端依赖"""
        try:
            ui.print_info("正在安装WebUI前端依赖...")
            
            # 检查前端依赖文件
            package_json_path = os.path.join(webui_dir, "http_server", "package.json")
            if not os.path.exists(package_json_path):
                ui.print_warning("未找到 http_server/package.json，跳过前端依赖安装")
                return True
            
            # 安装前端依赖
            ui.print_info("正在安装前端依赖 (npm)...")
            original_cwd = os.getcwd()
            try:
                os.chdir(os.path.join(webui_dir, "http_server"))
                result = subprocess.run(
                    ["npm", "install"],
                    capture_output=True,
                    text=True,
                    timeout=300,
                    shell=True
                )
                if result.returncode == 0:
                    ui.print_success("✅ 前端依赖安装完成")
                    logger.info("前端依赖安装成功")
                    return True
                else:
                    ui.print_error(f"❌ 前端依赖安装失败：{result.stderr}")
                    logger.error("前端依赖安装失败", error=result.stderr)
                    return False
            except Exception as e:
                ui.print_error(f"安装前端依赖时发生异常：{str(e)}")
                logger.error("安装前端依赖异常", error=str(e))
                return False
            finally:
                os.chdir(original_cwd)
        except Exception as e:
            ui.print_error(f"安装WebUI依赖时发生异常：{str(e)}")
            logger.error("安装WebUI依赖异常", error=str(e))
            return False
    
    def install_webui_backend_dependencies(self, webui_dir: str, venv_path: str = "") -> bool:
        """安装WebUI后端依赖"""
        try:
            ui.print_info("正在安装WebUI后端依赖...")
            
            # 检查后端依赖文件
            requirements_path = os.path.join(webui_dir, "requirements.txt")
            if not os.path.exists(requirements_path):
                ui.print_warning("未找到 requirements.txt，跳过后端依赖安装")
                return True
            
            # 构建pip安装命令
            pip_cmd = ["pip", "install", "-r", requirements_path]
            
            # 如果提供了虚拟环境路径，使用虚拟环境的pip
            if venv_path:
                if platform.system() == "Windows":
                    venv_pip = os.path.join(venv_path, "Scripts", "pip.exe")
                else:
                    venv_pip = os.path.join(venv_path, "bin", "pip")
                
                if os.path.exists(venv_pip):
                    pip_cmd[0] = venv_pip
                    ui.print_info(f"使用虚拟环境pip: {venv_pip}")
            
            ui.print_info("正在安装后端Python依赖...")
            result = subprocess.run(
                pip_cmd,
                capture_output=True,
                text=True,
                timeout=600,
                shell=True  # 在Windows上使用shell
            )
            
            if result.returncode == 0:
                ui.print_success("✅ 后端依赖安装完成")
                logger.info("后端依赖安装成功")
                return True
            else:
                ui.print_error(f"❌ 后端依赖安装失败：{result.stderr}")
                logger.error("后端依赖安装失败", error=result.stderr)
                return False
                
        except subprocess.TimeoutExpired:
            ui.print_error("❌ 后端依赖安装超时")
            logger.error("后端依赖安装超时")
            return False
        except Exception as e:
            ui.print_error(f"安装WebUI后端依赖时发生异常：{str(e)}")
            logger.error("安装WebUI后端依赖异常", error=str(e))
            return False

    def check_and_install_webui(self, install_dir: str, venv_path: str = "") -> Tuple[bool, str]:
        """检查并安装WebUI"""
        try:
            ui.console.print("\n[🌐 WebUI安装选项]", style=ui.colors["primary"])
            
            # 询问是否安装WebUI
            if not ui.confirm("是否安装MaiMbot WebUI？"):
                ui.print_info("已跳过WebUI安装")
                return True, ""
            
            # 检查Node.js环境
            ui.print_info("检查Node.js环境...")
            node_installed, node_version = self.check_nodejs_installed()
            npm_installed, npm_version = self.check_npm_installed()
            
            if not node_installed or not npm_installed:
                ui.print_warning("未检测到Node.js或npm")
                ui.print_info("WebUI需要Node.js环境支持")
                
                if ui.confirm("是否自动安装Node.js？"):
                    if not self.install_nodejs():
                        ui.print_error("Node.js安装失败，跳过WebUI安装")
                        return False, ""
                else:
                    ui.print_info("已跳过WebUI安装")
                    return True, ""
            else:
                ui.print_success(f"Node.js环境检测通过: {node_version}")
                ui.print_success(f"npm环境检测通过: {npm_version}")
            
            # 选择WebUI分支
            branch_info = self.show_webui_branch_menu()
            if not branch_info:
                ui.print_info("已跳过WebUI安装")
                return True, ""
            
            # 下载WebUI
            webui_dir = self.download_webui(branch_info, install_dir)
            if not webui_dir:
                ui.print_error("WebUI下载失败")
                return False, ""
            
            # 安装WebUI前端依赖
            if not self.install_webui_dependencies(webui_dir, venv_path):
                ui.print_warning("WebUI前端依赖安装失败，但WebUI文件已下载")
                ui.print_info("可以稍后手动在WebUI目录中执行 npm install")
            
            # 安装WebUI后端依赖
            if not self.install_webui_backend_dependencies(webui_dir, venv_path):
                ui.print_warning("WebUI后端依赖安装失败，但WebUI文件已下载")
                ui.print_info("可以稍后手动在WebUI目录中执行 pip install -r requirements.txt")
            
            ui.print_success("✅ WebUI安装完成")
            logger.info("WebUI安装完成", path=webui_dir)
            return True, webui_dir
            
        except Exception as e:
            ui.print_error(f"WebUI安装失败：{str(e)}")
            logger.error("WebUI安装失败", error=str(e))
            return False, ""
    
    def install_webui_directly(self, install_dir: str, venv_path: str = "") -> Tuple[bool, str]:
        """直接安装WebUI，不询问用户"""
        try:
            ui.console.print("\n[🌐 WebUI安装]", style=ui.colors["primary"])
            
            # 检查Node.js环境
            ui.print_info("检查Node.js环境...")
            node_installed, node_version = self.check_nodejs_installed()
            npm_installed, npm_version = self.check_npm_installed()
            
            if not node_installed or not npm_installed:
                ui.print_warning("未检测到Node.js或npm")
                ui.print_info("WebUI需要Node.js环境支持")
                
                if ui.confirm("是否自动安装Node.js？"):
                    if not self.install_nodejs():
                        ui.print_error("Node.js安装失败，跳过WebUI安装")
                        return False, ""
                else:
                    ui.print_info("已跳过WebUI安装")
                    return False, ""
            else:
                ui.print_success(f"Node.js环境检测通过: {node_version}")
                ui.print_success(f"npm环境检测通过: {npm_version}")
            
            # 选择WebUI分支
            branch_info = self.show_webui_branch_menu()
            if not branch_info:
                ui.print_info("已跳过WebUI安装")
                return False, ""
            
            # 下载WebUI
            webui_dir = self.download_webui(branch_info, install_dir)
            if not webui_dir:
                ui.print_error("WebUI下载失败")
                return False, ""
            
            # 安装WebUI依赖
            if not self.install_webui_dependencies(webui_dir, venv_path):
                ui.print_warning("WebUI依赖安装失败，但WebUI文件已下载")
                ui.print_info("可以稍后手动在WebUI目录中执行 npm install")
            
            # 安装WebUI后端依赖
            if not self.install_webui_backend_dependencies(webui_dir, venv_path):
                ui.print_warning("WebUI后端依赖安装失败，但WebUI文件已下载")
                ui.print_info("可以稍后手动在WebUI目录中执行 pip install -r requirements.txt")
            
            ui.print_success("✅ WebUI安装完成")
            logger.info("WebUI安装完成", path=webui_dir)
            return True, webui_dir
            
        except Exception as e:
            ui.print_error(f"WebUI安装失败：{str(e)}")
            logger.error("WebUI安装失败", error=str(e))
            return False, ""


# 全局WebUI安装器实例
webui_installer = WebUIInstaller()
