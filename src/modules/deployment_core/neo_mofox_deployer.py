# -*- coding: utf-8 -*-
"""
Neo-MoFox部署器
负责Neo-MoFox的部署逻辑
"""
import os
import shutil
import subprocess
from typing import Dict, Optional, Tuple
import structlog

from .base_deployer import BaseDeployer
from .version_manager import VersionManager
from ...ui.interface import ui

logger = structlog.get_logger(__name__)


class NeoMoFoxDeployer(BaseDeployer):
    """Neo-MoFox部署器"""

    def __init__(self):
        super().__init__()
        self.repo = "MoFox-Studio/Neo-MoFox"
        self.version_manager = VersionManager(self.repo)

    def install_bot(self, deploy_config: Dict) -> Optional[str]:
        """
        安装Neo-MoFox主体

        Args:
            deploy_config: 部署配置

        Returns:
            Neo-MoFox安装路径，失败返回None
        """
        ui.console.print("\n[📦 第一步：安装Neo-MoFox]", style=ui.colors["primary"])

        selected_version = deploy_config["selected_version"]
        install_dir = deploy_config["install_dir"]

        # 使用实例名称作为父目录
        nickname = deploy_config.get("nickname", "Neo-MoFox_instance")
        instance_dir = os.path.join(install_dir, nickname)
        target_dir = os.path.join(instance_dir, "Neo-MoFox")

        # 创建实例目录
        os.makedirs(instance_dir, exist_ok=True)

        # 检查目标目录是否已存在
        if os.path.exists(target_dir):
            ui.print_warning(f"目标目录已存在，将先删除: {target_dir}")
            try:
                shutil.rmtree(target_dir)
            except Exception as e:
                ui.print_error(f"删除旧目录失败: {str(e)}")
                return None

        # 确定分支名称
        version_name = selected_version.get("name", "main")
        version_type = selected_version.get("type", "release")

        if version_type == "branch":
            branch = version_name
        else:
            # 对于release版本，使用main分支
            branch = "main"

        # 优先使用Git clone，失败时回退到下载压缩包
        fallback_url = selected_version.get("download_url")

        if self.download_with_git_fallback(self.repo, target_dir, branch, fallback_url):
            ui.print_success("✅ Neo-MoFox安装完成")
            logger.info("Neo-MoFox安装成功", path=target_dir, method="git_or_download")
            return target_dir
        else:
            ui.print_error("Neo-MoFox安装失败")
            logger.error("Neo-MoFox安装失败")
            return None

    def create_virtual_environment(self, instance_dir: str) -> Tuple[bool, str]:
        """
        使用uv创建虚拟环境

        Args:
            instance_dir: 实例目录

        Returns:
            (是否成功, 虚拟环境路径)
        """
        ui.print_info("正在使用 uv 创建虚拟环境...")

        # Neo-MoFox目录
        neo_dir = os.path.join(instance_dir, "Neo-MoFox")
        venv_path = os.path.join(neo_dir, ".venv")

        try:
            # 检查uv是否安装
            result = subprocess.run(
                ["uv", "--version"],
                capture_output=True,
                text=True,
                shell=True
            )

            if result.returncode != 0:
                ui.print_error("未检测到 uv，请先安装 uv")
                ui.print_info("安装命令: pip install uv")
                return False, ""

            ui.print_success(f"✅ 检测到 uv: {result.stdout.strip()}")

            # 使用uv创建虚拟环境
            ui.print_info(f"正在创建虚拟环境: {venv_path}")
            result = subprocess.run(
                ["uv", "venv", ".venv"],
                cwd=neo_dir,
                capture_output=True,
                text=True,
                shell=True
            )

            if result.returncode == 0:
                ui.print_success("✅ 虚拟环境创建成功")
                logger.info("uv虚拟环境创建成功", path=venv_path)
                return True, venv_path
            else:
                ui.print_error(f"虚拟环境创建失败: {result.stderr}")
                logger.error("uv虚拟环境创建失败", error=result.stderr)
                return False, ""

        except FileNotFoundError:
            ui.print_error("未找到 uv 命令，请确保 uv 已正确安装")
            return False, ""
        except Exception as e:
            ui.print_error(f"创建虚拟环境时发生错误: {str(e)}")
            logger.error("创建虚拟环境失败", error=str(e))
            return False, ""

    def install_dependencies(self, instance_dir: str, progress_callback=None) -> bool:
        """
        使用uv sync安装依赖

        Args:
            instance_dir: 实例目录
            progress_callback: 进度回调函数

        Returns:
            是否成功
        """
        neo_dir = os.path.join(instance_dir, "Neo-MoFox")

        ui.print_info("正在使用 uv sync 安装依赖...")
        if progress_callback:
            progress_callback(step=5, total_steps=6, step_name="Python环境", status="running",
                            message="正在使用 uv sync 安装依赖（这可能需要几分钟）...")

        try:
            # 使用uv sync安装依赖
            process = subprocess.Popen(
                ["uv", "sync"],
                cwd=neo_dir,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                shell=True,
                encoding='utf-8',
                errors='replace'
            )

            # 实时输出安装进度
            for line in process.stdout:
                line = line.strip()
                if line:
                    ui.console.print(f"  {line}", style="dim")
                    if progress_callback and any(keyword in line.lower() for keyword in ['installing', 'downloading', 'building']):
                        progress_callback(step=5, total_steps=6, step_name="Python环境",
                                        status="running", message=f"安装中: {line[:50]}...")

            process.wait()

            if process.returncode == 0:
                ui.print_success("✅ 依赖安装完成")
                logger.info("uv sync 依赖安装成功", path=neo_dir)
                return True
            else:
                ui.print_error("❌ 依赖安装失败")
                logger.error("uv sync 依赖安装失败", returncode=process.returncode)
                return False

        except Exception as e:
            ui.print_error(f"安装依赖时发生错误: {str(e)}")
            logger.error("安装依赖失败", error=str(e))
            return False

    def setup_config_files(
        self,
        deploy_config: Dict,
        bot_path: str,
        adapter_path: str = "",
        napcat_path: str = "",
        mongodb_path: str = "",
        webui_path: str = ""
    ) -> bool:
        """
        设置Neo-MoFox配置文件

        Args:
            deploy_config: 部署配置
            bot_path: Neo-MoFox路径
            adapter_path: 适配器路径（内置，用于记录）
            napcat_path: NapCat路径
            mongodb_path: MongoDB路径（Neo不使用）
            webui_path: WebUI路径（Neo不使用）

        Returns:
            是否成功
        """
        ui.console.print("\n[⚙️ 第六步：配置Neo-MoFox]", style=ui.colors["primary"])

        try:
            config_dir = os.path.join(bot_path, "config")

            # 检查config目录是否存在
            if not os.path.exists(config_dir):
                ui.print_info("config 目录尚未生成，将在首次启动时自动创建")
                ui.print_info("配置文件位置：")
                ui.console.print(f"  • {os.path.join(config_dir, 'core.toml')} - 机器人人格配置", style="cyan")
                ui.console.print(f"  • {os.path.join(config_dir, 'model.toml')} - LLM配置", style="cyan")

                if napcat_path:
                    adapter_config = os.path.join(config_dir, "plugins", "napcat_adapter", "config.toml")
                    ui.console.print(f"  • {adapter_config} - 适配器配置", style="cyan")

                return True

            # 如果config目录已存在，显示配置文件信息
            ui.print_success("✅ 检测到 config 目录")

            core_config = os.path.join(config_dir, "core.toml")
            model_config = os.path.join(config_dir, "model.toml")

            if os.path.exists(core_config):
                ui.print_info(f"找到配置文件: core.toml")
            if os.path.exists(model_config):
                ui.print_info(f"找到配置文件: model.toml")

            # 检查适配器配置
            if napcat_path:
                adapter_config_path = os.path.join(config_dir, "plugins", "napcat_adapter", "config.toml")
                if os.path.exists(adapter_config_path):
                    ui.print_info(f"找到适配器配置: napcat_adapter/config.toml")
                else:
                    ui.print_info("适配器配置将在首次启动时生成")

            ui.print_success("✅ 配置文件检查完成")
            logger.info("Neo-MoFox配置文件设置完成", bot_path=bot_path)
            return True

        except Exception as e:
            ui.print_error(f"配置文件设置失败: {str(e)}")
            logger.error("配置文件设置失败", error=str(e))
            return False

    def initialize_first_run(self, bot_path: str, venv_path: str, auto_confirm: bool = True) -> bool:
        """
        首次运行初始化，生成配置文件

        Args:
            bot_path: Neo-MoFox路径
            venv_path: 虚拟环境路径

        Returns:
            是否成功
        """
        try:
            config_dir = os.path.join(bot_path, "config")

            # 如果config目录已存在，跳过初始化
            if os.path.exists(config_dir):
                ui.print_info("config 目录已存在，跳过初始化")
                return True

            ui.print_info("检测到首次启动，正在初始化配置文件...")
            ui.print_info("这将运行一次 Neo-MoFox 以生成必要的配置文件")

            # 使用 uv run 运行初始化，并在 WebUI 模式下自动确认首启提示。
            ui.print_info("正在运行初始化命令...")
            process = subprocess.Popen(
                ["uv", "run", "main.py"],
                cwd=bot_path,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding='utf-8',
                errors='replace'
            )

            import time

            if auto_confirm and process.stdin:
                try:
                    process.stdin.write("y\n")
                    process.stdin.flush()
                    ui.print_info("已自动确认首启初始化")
                except Exception:
                    pass

            deadline = time.time() + 20
            while time.time() < deadline:
                if os.path.exists(config_dir):
                    break
                if process.poll() is not None:
                    break
                time.sleep(1)

            # 终止进程
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()

            # 检查config目录是否生成
            if os.path.exists(config_dir):
                ui.print_success("✅ 配置文件初始化完成")
                ui.print_info("请在正式启动前配置以下文件：")
                ui.console.print(f"  • {os.path.join(config_dir, 'core.toml')} - 机器人人格配置", style="cyan")
                ui.console.print(f"  • {os.path.join(config_dir, 'model.toml')} - LLM配置", style="cyan")
                return True
            else:
                ui.print_warning("⚠️ 配置文件未能自动生成，请手动创建")
                return False

        except Exception as e:
            ui.print_error(f"初始化失败: {str(e)}")
            logger.error("首次运行初始化失败", error=str(e))
            return False
