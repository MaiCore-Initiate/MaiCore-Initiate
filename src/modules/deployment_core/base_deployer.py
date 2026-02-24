# -*- coding: utf-8 -*-
"""
基础部署器类
提供通用的部署方法和工具函数
"""
import os
import platform
import shutil
import subprocess
import tempfile
import time
import venv
import zipfile
from pathlib import Path
from typing import Tuple, Optional, List, Dict
import requests
import structlog
from tqdm import tqdm

from ...ui.interface import ui
from ...core.p_config import p_config_manager

logger = structlog.get_logger(__name__)


class BaseDeployer:
    """基础部署器类，提供通用的部署方法"""
    
    def __init__(self):
        self.github_api_base = "https://api.github.com"
    
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
            else:
                python_exe = os.path.join(venv_path, "bin", "python")
            
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
        在虚拟环境中安装依赖，优先使用uv
        
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
        
        def is_uv_available() -> bool:
            """检查是否可用uv"""
            try:
                subprocess.run(["uv", "--version"], capture_output=True, check=True)
                return True
            except (subprocess.CalledProcessError, FileNotFoundError):
                return False
        
        def install_uv() -> bool:
            """尝试安装uv包管理器"""
            try:
                ui.print_info("正在尝试安装uv包管理器...")
                
                # 获取系统Python路径
                if platform.system() == "Windows":
                    python_exe = os.path.join(venv_path, "Scripts", "python.exe")
                else:
                    python_exe = os.path.join(venv_path, "bin", "python")
                
                # 使用pip安装uv
                install_cmd = [python_exe, "-m", "pip", "install", "uv"]
                
                process = subprocess.Popen(
                    install_cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    bufsize=1,
                    universal_newlines=True
                )
                
                if process.stdout:
                    for line in process.stdout:
                        line = line.strip()
                        if line:
                            print(f"  {line}")
                
                process.wait()
                
                if process.returncode == 0:
                    ui.print_success("uv安装成功！")
                    return True
                else:
                    ui.print_warning("uv安装失败")
                    return False
                    
            except Exception as e:
                ui.print_warning(f"安装uv时发生错误: {str(e)}")
                return False
        
        def run_command_with_output(cmd: List[str], description: str) -> bool:
            """运行命令并实时显示输出"""
            try:
                ui.print_info(f"{description}...")
                logger.info(f"执行命令: {' '.join(cmd)}")
                
                process = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    bufsize=1,
                    universal_newlines=True
                )
                
                if process.stdout:
                    for line in process.stdout:
                        line = line.strip()
                        if line:
                            print(f"  {line}")
                
                process.wait()
                
                if process.returncode == 0:
                    ui.print_success(f"{description}完成")
                    return True
                else:
                    ui.print_error(f"{description}失败，返回码: {process.returncode}")
                    return False
                    
            except Exception as e:
                ui.print_error(f"{description}时发生错误: {str(e)}")
                logger.error(f"{description}异常", error=str(e))
                return False
        
        try:
            if not os.path.exists(requirements_path):
                ui.print_error(f"requirements.txt 不存在: {requirements_path}")
                return False
            
            # 获取虚拟环境中的pip路径
            if platform.system() == "Windows":
                pip_exe = os.path.join(venv_path, "Scripts", "pip.exe")
                python_exe = os.path.join(venv_path, "Scripts", "python.exe")
            else:
                pip_exe = os.path.join(venv_path, "bin", "pip")
                python_exe = os.path.join(venv_path, "bin", "python")
            
            # 检查pip是否存在
            if not os.path.exists(pip_exe):
                ui.print_error(f"虚拟环境pip未找到: {pip_exe}")
                return False
            
            ui.print_info(f"使用虚拟环境: {venv_path}")
            ui.print_info(f"安装依赖文件: {requirements_path}")
            
            # 检查是否可用uv
            use_uv = is_uv_available()
            
            if not use_uv:
                ui.print_info("未检测到uv包管理器，尝试自动安装...")
                if install_uv():
                    use_uv = True
                else:
                    ui.print_warning("uv安装失败，将使用pip安装")
            
            if use_uv:
                ui.print_info("使用uv包管理器加速安装依赖")
                success = False
                
                # 尝试使用不同镜像源
                for i, mirror in enumerate(pypi_mirrors, 1):
                    ui.print_info(f"尝试使用镜像源 {i}/{len(pypi_mirrors)}: {mirror}")
                    cmd = [
                        "uv", "pip", "install",
                        "-r", requirements_path,
                        "--python", python_exe,
                        "-i", mirror
                    ]
                    
                    if run_command_with_output(cmd, f"使用uv从镜像源{i}安装依赖"):
                        success = True
                        break
                    
                    if i < len(pypi_mirrors):
                        ui.print_warning(f"镜像源{i}安装失败，尝试下一个...")
                
                if success:
                    ui.print_success("依赖安装完成！")
                    logger.info("依赖安装成功", method="uv")
                    return True
                else:
                    ui.print_warning("所有镜像源均失败，将尝试使用pip安装")
            
            # 使用pip安装
            ui.print_info("使用pip安装依赖...")
            
            # 先升级pip
            upgrade_cmd = [python_exe, "-m", "pip", "install", "--upgrade", "pip"]
            run_command_with_output(upgrade_cmd, "升级pip")
            
            # 尝试使用不同镜像源
            for i, mirror in enumerate(pypi_mirrors, 1):
                ui.print_info(f"尝试使用镜像源 {i}/{len(pypi_mirrors)}: {mirror}")
                cmd = [
                    pip_exe, "install",
                    "-r", requirements_path,
                    "-i", mirror
                ]
                
                if run_command_with_output(cmd, f"使用pip从镜像源{i}安装依赖"):
                    ui.print_success("依赖安装完成！")
                    logger.info("依赖安装成功", method="pip")
                    return True
                
                if i < len(pypi_mirrors):
                    ui.print_warning(f"镜像源{i}安装失败，尝试下一个...")
            
            ui.print_error("所有镜像源均失败")
            logger.error("依赖安装失败，所有镜像源均不可用")
            return False
            
        except subprocess.CalledProcessError as e:
            ui.print_error(f"依赖安装失败: {str(e)}")
            logger.error("依赖安装命令执行失败", error=str(e), returncode=e.returncode)
            return False
        except Exception as e:
            ui.print_error(f"依赖安装时发生错误: {str(e)}")
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
                response = requests.get(url, timeout=5)
                if response.status_code in [200, 301, 302]:
                    logger.info(f"网络连接正常: {name}")
                    return True, ""
            except Exception:
                continue
        
        # 尝试ping一下常见DNS
        try:
            if platform.system() == "Windows":
                result = subprocess.run(["ping", "-n", "1", "8.8.8.8"], 
                                      capture_output=True, timeout=5)
            else:
                result = subprocess.run(["ping", "-c", "1", "8.8.8.8"], 
                                      capture_output=True, timeout=5)
            if result.returncode == 0:
                return True, ""
        except Exception:
            pass
            
        return False, "无法连接到GitHub和PyPI镜像站点"
    
    def download_file(self, url: str, filename: str, max_retries: int = 3) -> bool:
        """
        下载文件
        
        Args:
            url: 下载链接
            filename: 保存文件名
            max_retries: 最大重试次数
            
        Returns:
            是否下载成功
        """
        import os
        
        for attempt in range(max_retries):
            try:
                if attempt > 0:
                    ui.print_info(f"重试下载 ({attempt + 1}/{max_retries})...")
                    time.sleep(2)
                
                # 获取文件名用于显示
                file_basename = os.path.basename(filename)
                
                response = requests.get(url, stream=True, timeout=30)
                response.raise_for_status()
                
                total_size = int(response.headers.get('content-length', 0))
                
                # 显示文件大小信息
                if total_size > 0:
                    size_mb = total_size / (1024 * 1024)
                    ui.print_info(f"文件大小: {size_mb:.2f} MB")
                
                with open(filename, 'wb') as f:
                    if total_size > 0:
                        # 使用Rich的进度条显示下载进度
                        from rich.progress import Progress, BarColumn, TextColumn, TimeRemainingColumn, TransferSpeedColumn, SpinnerColumn
                        
                        with Progress(
                            SpinnerColumn(),
                            TextColumn("[bold blue]{task.description}"),
                            BarColumn(),
                            TextColumn("[progress.percentage]{task.percentage:>3.0f}%"),
                            TextColumn("•"),
                            TextColumn("[bold green]{task.completed}/{task.total}"),
                            TextColumn("•"),
                            TimeRemainingColumn(),
                            TextColumn("•"),
                            TransferSpeedColumn(),
                            console=ui.console,
                            transient=True,
                            refresh_per_second=10
                        ) as progress:
                            task = progress.add_task(f"下载 {file_basename}", total=total_size)
                            
                            downloaded = 0
                            for chunk in response.iter_content(chunk_size=8192):
                                if chunk:
                                    f.write(chunk)
                                    downloaded += len(chunk)
                                    progress.update(task, advance=len(chunk))
                            
                            # 确保进度条显示100%
                            progress.update(task, completed=total_size)
                    else:
                        # 如果没有文件大小信息，使用简单的进度显示
                        downloaded = 0
                        last_reported = 0
                        for chunk in response.iter_content(chunk_size=8192):
                            if chunk:
                                f.write(chunk)
                                downloaded += len(chunk)
                                # 每下载1MB显示一次进度
                                if downloaded - last_reported >= (1024 * 1024):
                                    size_mb = downloaded / (1024 * 1024)
                                    ui.print_info(f"已下载: {size_mb:.1f} MB")
                                    last_reported = downloaded
                
                ui.print_success(f"下载完成: {file_basename}")
                logger.info("文件下载成功", url=url, filename=filename)
                return True
                
            except requests.RequestException as e:
                error_msg = str(e)
                if attempt < max_retries - 1:
                    ui.print_warning(f"下载失败: {error_msg}，准备重试...")
                    logger.warning("下载失败，准备重试", error=error_msg, attempt=attempt + 1)
                else:
                    ui.print_error(f"下载失败（已重试{max_retries}次）: {error_msg}")
                    logger.error("下载失败，重试耗尽", error=error_msg, url=url)
                    return False
            except Exception as e:
                ui.print_error(f"下载时发生未知错误: {str(e)}")
                logger.error("下载异常", error=str(e), url=url)
                return False
        
        return False
    
    def extract_archive(self, archive_path: str, extract_to: str) -> bool:
        """
        解压归档文件
        
        Args:
            archive_path: 归档文件路径
            extract_to: 解压目标路径
            
        Returns:
            是否解压成功
        """
        try:
            ui.print_info(f"正在解压文件...")
            with zipfile.ZipFile(archive_path, 'r') as zip_ref:
                zip_ref.extractall(extract_to)
            ui.print_success("解压完成")
            logger.info("文件解压成功", archive=archive_path, target=extract_to)
            return True
        except Exception as e:
            ui.print_error(f"解压失败: {str(e)}")
            logger.error("文件解压失败", error=str(e), archive=archive_path)
            return False
    
    def get_git_executable_path(self) -> Optional[str]:
        """
        获取Git可执行文件路径
        
        Returns:
            Git可执行文件路径，如果未找到则返回None
        """
        # 1. 优先检查系统PATH中的Git
        try:
            # 使用 shell=True 兼容 Windows cmd/bat 别名
            startupinfo = None
            if platform.system() == "Windows":
                startupinfo = subprocess.STARTUPINFO()
                startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            
            result = subprocess.run(
                "git --version", 
                shell=True,
                capture_output=True, 
                text=True, 
                timeout=10,
                startupinfo=startupinfo
            )
            
            if result.returncode == 0:
                ui.print_info("使用系统Git")
                return "git"
        except (FileNotFoundError, subprocess.TimeoutExpired, Exception):
            pass
        
        # 2. 如果系统是Windows，尝试通过注册表或常见路径查找
        if platform.system() == "Windows":
            # 2.1 注册表查找
            try:
                import winreg
                registry_paths = [
                    (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Git_is1"),
                    (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\Git_is1"),
                    (winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Uninstall\Git_is1")
                ]
                
                for hkey, path in registry_paths:
                    try:
                        with winreg.OpenKey(hkey, path) as key:
                            install_location, _ = winreg.QueryValueEx(key, "InstallLocation")
                            git_exe = os.path.join(install_location, "cmd", "git.exe")
                            if os.path.exists(git_exe):
                                ui.print_info(f"通过注册表发现Git: {git_exe}")
                                return git_exe
                    except:
                        continue
            except:
                pass

            # 2.2 常见路径查找
            common_paths = [
                r"C:\Program Files\Git\cmd\git.exe",
                r"C:\Program Files (x86)\Git\cmd\git.exe",
                os.path.join(os.environ.get('LOCALAPPDATA', ''), r'Programs\Git\cmd\git.exe')
            ]
            
            for path in common_paths:
                if os.path.exists(path):
                    ui.print_info(f"通过路径发现Git: {path}")
                    return path
        
        ui.print_warning("未找到可用的Git可执行文件")
        return None
    
    def test_mirror_speed(self, mirror_url: str, timeout: int = 10) -> Tuple[bool, float]:
        """
        测试镜像站速度
        
        Args:
            mirror_url: 镜像站URL
            timeout: 超时时间（秒）
            
        Returns:
            (是否成功, 响应时间)
        """
        try:
            start_time = time.time()
            test_url = f"{mirror_url.rstrip('/')}/MaiM-with-u/MaiBot"
            
            response = requests.get(test_url, timeout=timeout)
            response.raise_for_status()
            
            response_time = time.time() - start_time
            logger.info("镜像站测速成功", mirror=mirror_url, time=response_time)
            return True, response_time
            
        except Exception as e:
            logger.warning("镜像站测速失败", mirror=mirror_url, error=str(e))
            return False, float('inf')
    
    def get_best_mirror(self) -> str:
        """
        获取最快的Git镜像站
        
        Returns:
            最佳镜像站URL
        """
        git_config = p_config_manager.get("git", {})
        mirrors = git_config.get("mirrors", ["https://github.com"])
        auto_select = git_config.get("auto_select_mirror", True)
        selected_mirror = git_config.get("selected_mirror", "")
        
        # 如果用户已指定镜像站且不是自动选择
        if selected_mirror and not auto_select:
            return selected_mirror
        
        # 如果只有一个镜像站，直接返回
        if len(mirrors) == 1:
            return mirrors[0]
        
        ui.print_info("正在测试Git镜像站速度...")
        
        # 测试所有镜像站
        mirror_speeds = []
        for mirror in mirrors:
            ui.print_info(f"测试镜像站: {mirror}")
            success, response_time = self.test_mirror_speed(mirror)
            if success:
                mirror_speeds.append((mirror, response_time))
                ui.print_success(f"SUCCESS {mirror}: {response_time:.2f}秒")
            else:
                ui.print_warning(f"FAILED {mirror}: 连接失败")
        
        if not mirror_speeds:
            ui.print_warning("所有镜像站均无法连接，使用默认GitHub")
            return "https://github.com"
        
        # 按速度排序，选择最快的
        mirror_speeds.sort(key=lambda x: x[1])
        best_mirror = mirror_speeds[0][0]
        
        ui.print_success(f"选择最快镜像站: {best_mirror} ({mirror_speeds[0][1]:.2f}秒)")
        return best_mirror
    
    def clone_repository(self, repo_url: str, target_dir: str, branch: str = "main", depth: int = 1) -> bool:
        """
        使用git clone克隆仓库
        
        Args:
            repo_url: 仓库URL
            target_dir: 目标目录
            branch: 分支名称
            depth: 克隆深度（浅层克隆）
            
        Returns:
            是否克隆成功
        """
        git_exe = self.get_git_executable_path()
        if not git_exe:
            ui.print_error("未找到Git可执行文件")
            return False
        
        try:
            # 确保目标目录不存在或为空
            if os.path.exists(target_dir):
                if os.listdir(target_dir):
                    ui.print_warning(f"目标目录已存在且不为空: {target_dir}")
                    return False
            else:
                os.makedirs(target_dir, exist_ok=True)
            
            # 构建git clone命令
            cmd = [
                git_exe, "clone",
                "--depth", str(depth),
                "--branch", branch,
                "--quiet",  # 减少输出
                repo_url,
                target_dir
            ]
            
            ui.print_info(f"正在克隆仓库: {repo_url}")
            ui.print_info(f"分支: {branch}, 深度: {depth}")
            
            # 设置超时时间（5分钟）
            timeout = 300
            
            # 执行克隆命令
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
                universal_newlines=True
            )
            
            try:
                # 等待进程完成，设置超时
                stdout, stderr = process.communicate(timeout=timeout)
                
                if process.returncode == 0:
                    ui.print_success("仓库克隆成功")
                    logger.info("Git clone成功", repo=repo_url, target=target_dir, branch=branch)
                    return True
                else:
                    error_msg = stderr.strip() if stderr else "未知错误"
                    ui.print_error(f"克隆失败: {error_msg}")
                    logger.error("Git clone失败", repo=repo_url, error=error_msg, returncode=process.returncode)
                    return False
                    
            except subprocess.TimeoutExpired:
                ui.print_error(f"克隆超时（{timeout}秒）")
                process.kill()
                process.wait()
                logger.error("Git clone超时", repo=repo_url, timeout=timeout)
                return False
                
        except Exception as e:
            ui.print_error(f"克隆过程中发生错误: {str(e)}")
            logger.error("Git clone异常", repo=repo_url, error=str(e))
            return False
    
    def get_git_clone_url(self, repo: str, mirror: Optional[str] = None) -> str:
        """
        获取Git clone URL
        
        Args:
            repo: 仓库名称，格式为 "owner/repo"
            mirror: 镜像站URL，如果为None则自动选择
            
        Returns:
            完整的Git clone URL
        """
        if not mirror:
            mirror = self.get_best_mirror()
        
        # 处理不同的镜像站格式
        if mirror == "https://github.com":
            return f"https://github.com/{repo}.git"
        elif "ghproxy.com" in mirror:
            return f"{mirror.rstrip('/')}/https://github.com/{repo}.git"
        else:
            # 其他镜像站可能需要特殊处理
            return f"{mirror.rstrip('/')}/{repo}.git"
    
    def download_with_git_fallback(self, repo: str, target_dir: str, branch: str = "main", 
                                 fallback_url: Optional[str] = None) -> bool:
        """
        优先使用Git clone，失败时回退到下载压缩包
        
        Args:
            repo: 仓库名称
            target_dir: 目标目录
            branch: 分支名称
            fallback_url: 回退下载URL
            
        Returns:
            是否成功
        """
        # 首先尝试Git clone
        git_config = p_config_manager.get("git", {})
        depth = git_config.get("depth", 1)
        
        clone_url = self.get_git_clone_url(repo)
        ui.print_info("优先使用Git clone方式部署...")
        
        if self.clone_repository(clone_url, target_dir, branch, depth):
            return True
        
        # Git clone失败，回退到下载压缩包
        if fallback_url:
            ui.print_warning("Git clone失败，回退到下载压缩包方式...")
            
            # 使用临时目录进行下载和解压
            with tempfile.TemporaryDirectory() as temp_dir:
                archive_path = os.path.join(temp_dir, f"{repo.replace('/', '_')}.zip")
                
                if self.download_file(fallback_url, archive_path):
                    if self.extract_archive(archive_path, temp_dir):
                        # 检测并处理GitHub归档的嵌套根目录层级
                        # GitHub的归档zip总是只包含一个根目录（格式：{repo_name}-{branch}）
                        extracted_items = os.listdir(temp_dir)
                        extracted_dirs = [d for d in extracted_items
                                         if os.path.isdir(os.path.join(temp_dir, d))]
                        extracted_files = [f for f in extracted_items
                                          if os.path.isfile(os.path.join(temp_dir, f)) and not f.endswith('.zip')]
                        
                        # 只有一个目录且没有其他非zip文件 → GitHub归档嵌套层，需要展开
                        if len(extracted_dirs) == 1 and len(extracted_files) == 0:
                            source_dir = os.path.join(temp_dir, extracted_dirs[0])
                            ui.print_info(f"检测到GitHub归档嵌套目录: {extracted_dirs[0]}")
                            os.makedirs(target_dir, exist_ok=True)
                            for item in os.listdir(source_dir):
                                src_path = os.path.join(source_dir, item)
                                dst_path = os.path.join(target_dir, item)
                                if os.path.exists(dst_path):
                                    if os.path.isdir(dst_path):
                                        shutil.rmtree(dst_path)
                                    else:
                                        os.remove(dst_path)
                                shutil.move(src_path, dst_path)
                            ui.print_success(f"已展开嵌套目录到 {target_dir}")
                        else:
                            # 没有嵌套层，直接解压到目标目录
                            if not self.extract_archive(archive_path, target_dir):
                                ui.print_error("解压失败")
                                return False
                        
                        # 验证目标目录是否有效
                        if os.path.exists(target_dir) and os.listdir(target_dir):
                            ui.print_success("压缩包部署完成")
                            return True
                        else:
                            ui.print_error("部署后验证失败，目标目录为空或不存在")
                            return False
        
        return False
