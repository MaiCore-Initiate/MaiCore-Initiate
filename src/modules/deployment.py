# -*- coding: utf-8 -*-
"""
部署系统模块 - 重构版
负责实例的部署、更新和删除操作
使用模块化的部署器来处理不同Bot类型的部署
"""
import logging
import os
import shutil
import stat
import subprocess
import tempfile
import time
from typing import Any, Callable, Dict, Optional, Tuple
import structlog

from ..core.config import config_manager
from ..core.logging import set_console_log_level, reset_console_log_level
from ..ui.interface import ui
from ..utils.common import validate_path, open_files_in_editor
from ..utils.version_detector import compare_versions
from ..utils.notifier import windows_notifier, NotificationLogHandler
from .mongodb_installer import mongodb_installer
from .webui_installer import webui_installer

# 导入模块化的部署器
from .deployment_core import (
    MaiBotDeployer,
    MoFoxBotDeployer,
    NapCatDeployer,
    InstanceUpdater
)

logger = structlog.get_logger(__name__)


class DeploymentManager:
    """部署管理器类 - 协调各个部署器完成部署任务"""
    
    def __init__(self):
        # 初始化各个部署器
        self.maibot_deployer = MaiBotDeployer()
        self.mofox_deployer = MoFoxBotDeployer()
        self.napcat_deployer = NapCatDeployer()
        self.instance_updater = InstanceUpdater()
        
        # 离线模式标志
        self._offline_mode = False

    def _on_rm_error(self, func, path, exc_info):
        """删除失败回调：尽量去掉只读属性后重试（Windows兼容）"""
        try:
            os.chmod(path, stat.S_IRWXU | stat.S_IRWXG | stat.S_IRWXO)
        except Exception:
            pass
        func(path)

    def _safe_rmtree(self, target_path: str, retries: int = 3, base_delay: float = 0.2):
        """带重试和只读容错的目录删除"""
        if not target_path or not os.path.exists(target_path):
            return

        last_error = None
        for attempt in range(retries):
            try:
                shutil.rmtree(target_path, onerror=self._on_rm_error)
                return
            except Exception as e:
                last_error = e
                # 文件被短暂占用时等待后重试
                if attempt < retries - 1:
                    time.sleep(base_delay * (attempt + 1))
                    continue
                raise last_error
        
    def deploy_instance(self) -> bool:
        """部署新实例 - 重构版本"""
        set_console_log_level("WARNING")
        notification_handler = None
        root_logger = None
        should_notify = windows_notifier.is_enabled()
        logger.info("Windows通知开关状态", enabled=should_notify)
        if should_notify:
            notification_handler = NotificationLogHandler(windows_notifier, title="部署告警")
            notification_handler.setLevel(logging.WARNING)
            notification_handler.setFormatter(logging.Formatter("%(name)s: %(message)s"))
            root_logger = logging.getLogger()
            root_logger.addHandler(notification_handler)
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
            if should_notify:
                windows_notifier.send("部署已开始", "部署时间可能较长，我们会在部署完成或出现意外情况时通知您。")

            # 部署流程
            paths = self._run_deployment_steps(deploy_config)

            # 完成部署
            if not self._finalize_deployment(deploy_config, **paths):
                return False

            ui.print_success(f"🎉 实例 '{deploy_config['nickname']}' 部署完成！")
            
            # 定义bot_path_key以传递给后续函数
            bot_type = deploy_config.get("bot_type", "MaiBot")
            bot_path_key = "mai_path" if bot_type == "MaiBot" else "mofox_path"
            self._show_post_deployment_info(paths.get(bot_path_key, ""), deploy_config, paths.get("adapter_path", ""))

            logger.info("实例部署完成", serial=deploy_config['serial_number'])
            if should_notify:
                windows_notifier.send("部署完成", f"实例 {deploy_config['nickname']} 已成功部署。")
            return True

        except Exception as e:
            ui.print_error(f"部署失败：{str(e)}")
            logger.error("实例部署失败", error=str(e))
            if should_notify:
                windows_notifier.send("部署失败", f"实例部署失败：{str(e)}")
            return False
        finally:
            if root_logger and notification_handler:
                root_logger.removeHandler(notification_handler)
            reset_console_log_level()
    
    def _check_network_for_deployment(self) -> bool:
        """检查网络连接用于部署"""
        ui.print_info("检查网络连接...")
        network_status, message = self.maibot_deployer.check_network_connection()
        if not network_status:
            ui.print_error(f"网络连接失败: {message}")
            ui.print_info("您可以选择继续部署，但可能无法从GitHub获取版本信息")
            if not ui.confirm("是否继续部署（将使用本地缓存或默认版本）？"):
                ui.pause()
                return False
            self._offline_mode = True
            # 设置各个部署器的离线模式
            self.maibot_deployer.version_manager.set_offline_mode(True)
            self.mofox_deployer.version_manager.set_offline_mode(True)
        else:
            ui.print_success("网络连接正常")
            self._offline_mode = False
        return True
    
    def _get_deployment_config(self) -> Optional[Dict]:
        """获取部署配置信息"""
        # 询问用户要部署的Bot类型
        ui.console.print("\n[🤖 Bot类型选择]", style=ui.colors["primary"])
        ui.console.print("请选择要部署的Bot类型：")
        ui.console.print(" [1] MaiBot (默认)")
        ui.console.print(" [2] MoFox_bot")

        bot_type_choice = ui.get_input("请选择Bot类型 (1/2): ").strip()
        bot_type = "MaiBot" if bot_type_choice != "2" else "MoFox_bot"

        # 根据Bot类型选择版本管理器
        if bot_type == "MaiBot":
            version_manager = self.maibot_deployer.version_manager
        else:
            version_manager = self.mofox_deployer.version_manager

        # 选择版本
        selected_version = version_manager.show_version_menu(bot_type)
        if not selected_version:
            return None

        # 组件安装选项
        if bot_type == "MoFox_bot":
            # MoFox_bot的适配器已经内置，无需下载
            ui.console.print("\n[🔌 适配器配置]", style=ui.colors["info"])
            ui.console.print("MoFox_bot的适配器已经内置，无需下载", style="green")
            install_adapter = False
        else:
            install_adapter = ui.confirm("是否需要安装适配器？")
        
        install_napcat = ui.confirm("是否需要安装NapCat？")
        napcat_version = None
        if install_napcat:
            napcat_version = self.napcat_deployer.select_napcat_version()
        
        # 根据Bot类型和版本条件决定是否询问MongoDB
        install_mongodb = False
        if bot_type == "MaiBot":
            # MaiBot: 版本号大于等于0.7.0，或版本号为分支且不为classical时不要询问
            version_name = selected_version.get("name", "")
            version_type = selected_version.get("type", "release")
            
            # 检查是否需要询问MongoDB
            should_ask_mongodb = True
            if version_type == "branch" and version_name != "classical":
                # 分支且不为classical，不询问
                should_ask_mongodb = False
            elif compare_versions(version_name, "0.7.0") >= 0:
                # 版本>=0.7.0，不询问
                should_ask_mongodb = False
            
            if should_ask_mongodb:
                install_mongodb = ui.confirm("是否需要安装MongoDB？")
        else:
            # MoFox_bot: 永远不要询问是否安装MongoDB
            install_mongodb = False
        
        # 根据Bot类型和版本决定WebUI处理
        if bot_type == "MaiBot":
            # 检查版本是否内置WebUI
            version_name = selected_version.get("name", "")
            from ..utils.version_detector import has_builtin_webui
            
            if has_builtin_webui(version_name):
                # 版本内置WebUI，不询问安装，但记录信息
                ui.console.print("\n[🌐 WebUI配置]", style=ui.colors["info"])
                ui.console.print(f"当前版本 {version_name} 已内置WebUI，无需单独安装", style="green")
                ui.console.print("启动时主程序将自动代理WebUI，默认访问地址：http://localhost:8001", style="cyan")
                install_webui = False  # 不需要单独安装
            else:
                # 版本未内置WebUI，引导到组件下载页
                ui.console.print("\n[🌐 WebUI配置]", style=ui.colors["info"])
                ui.console.print(f"当前版本 {version_name} 未内置WebUI", style="yellow")
                ui.console.print("如需WebUI功能，请前往'杂项菜单 -> 组件下载中心'下载WebUI组件，请注意适配的版本", style="cyan")
                install_webui = False  # 改为从组件下载页获取
            
            install_mofox_admin_ui = False
            install_mofox_webui = False
        else:
            # MoFox_bot: 永远不要询问是否安装麦麦的webui
            install_webui = False
            install_mofox_admin_ui = False
            install_mofox_webui = ui.confirm("是否需要安装MoFox WebUI？")

        # 安装目录
        default_install_dir = os.path.join(os.getcwd(), "instances")
        ui.print_info(f"默认安装目录: {default_install_dir}")
        while True:
            install_dir_input = ui.get_input("请输入安装目录）: ").strip()
            install_dir = install_dir_input if install_dir_input else default_install_dir
            is_valid, message = validate_path(install_dir)
            if is_valid:
                try:
                    os.makedirs(install_dir, exist_ok=True)
                    ui.print_success(f"安装目录: {install_dir}")
                    break
                except Exception as e:
                    ui.print_error(f"创建目录失败: {str(e)}")
            else:
                ui.print_error(f"路径无效: {message}")

        # 实例名称（带冲突检测）
        while True:
            nickname_input = ui.get_input("请输入实例名称）: ").strip()
            
            # 如果输入为空，自动生成不冲突的默认名称
            if not nickname_input:
                base_nickname = f"{bot_type}_instance"
                nickname = base_nickname
                counter = 1
                # 自动寻找不冲突的名称
                while os.path.exists(os.path.join(install_dir, nickname)):
                    nickname = f"{base_nickname}_{counter}"
                    counter += 1
                ui.print_info(f"使用默认实例名称: {nickname}")
                break
            else:
                nickname = nickname_input
            
            # 检查昵称目录是否已存在
            nickname_dir = os.path.join(install_dir, nickname)
            if os.path.exists(nickname_dir):
                # 检查目录是否为空
                if os.listdir(nickname_dir):
                    ui.print_warning(f"⚠️ 目录 '{nickname_dir}' 已存在且不为空")
                    ui.console.print("该目录包含以下内容：", style="yellow")
                    for item in os.listdir(nickname_dir)[:5]:  # 只显示前5个
                        ui.console.print(f"  • {item}", style="yellow")
                    if len(os.listdir(nickname_dir)) > 5:
                        ui.console.print(f"  ... 还有 {len(os.listdir(nickname_dir)) - 5} 个项目", style="yellow")
                    
                    if ui.confirm("是否清空该目录并继续？"):
                        try:
                            shutil.rmtree(nickname_dir)
                            ui.print_success("已清空目录")
                            break
                        except Exception as e:
                            ui.print_error(f"清空目录失败: {str(e)}")
                            ui.print_info("请输入其他实例名称")
                            continue
                    else:
                        ui.print_info("请输入其他实例名称")
                        continue
                else:
                    # 目录存在但为空，可以使用
                    ui.print_info(f"将使用现有空目录: {nickname_dir}")
                    break
            else:
                # 目录不存在，可以使用
                break

        # 用户序列号（用于识别实例）
        existing_configs = config_manager.get_all_configurations()
        existing_serials = {cfg.get("serial_number") for cfg in existing_configs.values() if cfg.get("serial_number")}
        
        while True:
            serial_number = ui.get_input("请输入实例序列号（用于识别和管理实例）: ").strip()
            if not serial_number:
                ui.print_error("序列号不能为空，请重新输入。")
                continue
            if serial_number in existing_serials:
                ui.print_error(f"序列号 '{serial_number}' 已存在，请使用其他序列号。")
                continue
            break

        # QQ账号（可选）
        qq_account = ui.get_input("请输入QQ账号（可选，留空跳过）: ").strip()

        # 生成绝对序列号（用于内部唯一标识）
        absolute_serial_number = config_manager.generate_unique_serial()

        # 返回部署配置
        return {
            "bot_type": bot_type,
            "selected_version": selected_version,
            "install_adapter": install_adapter,
            "install_napcat": install_napcat,
            "napcat_version": napcat_version,
            "install_mongodb": install_mongodb,
            "mongodb_path": "",
            "install_webui": install_webui,
            "install_mofox_admin_ui": install_mofox_admin_ui,
            "install_mofox_webui": install_mofox_webui,
            "install_dir": install_dir,
            "nickname": nickname,
            "qq_account": qq_account,
            "serial_number": serial_number,
            "absolute_serial_number": absolute_serial_number
        }
    
    def _confirm_deployment(self, deploy_config: Dict) -> bool:
        """确认部署配置"""
        ui.clear_screen()
        ui.components.show_title("确认部署配置", symbol="✅")
        
        bot_type = deploy_config.get("bot_type", "MaiBot")
        
        # 显示配置摘要
        from rich.table import Table
        table = Table(
            show_header=True,
            header_style=ui.colors["table_header"],
            title="[bold]部署配置摘要[/bold]",
            title_style=ui.colors["primary"],
            border_style=ui.colors["border"],
            show_lines=True
        )
        table.add_column("配置项", style="cyan", width=20)
        table.add_column("值", style="green", width=50)
        
        table.add_row("Bot类型", bot_type)
        table.add_row("版本", deploy_config["selected_version"]["display_name"])
        table.add_row("实例名称", deploy_config["nickname"])
        table.add_row("安装目录", deploy_config["install_dir"])
        
        if deploy_config.get("qq_account"):
            table.add_row("QQ账号", deploy_config["qq_account"])
        
        table.add_row("安装适配器", "✅" if deploy_config.get("install_adapter") else "❌")
        table.add_row("安装NapCat", "✅" if deploy_config.get("install_napcat") else "❌")
        table.add_row("安装MongoDB", "✅" if deploy_config.get("install_mongodb") else "❌")
        
        webui_text = ""
        if bot_type == "MaiBot":
            webui_text = "✅" if deploy_config.get("install_webui") else "❌"
        else:
            # MoFox_bot显示不同的WebUI选项
            if deploy_config.get("install_mofox_admin_ui"):
                webui_text = "✅ (后台管理WebUI)"
            elif deploy_config.get("install_mofox_webui"):
                webui_text = "✅ (MoFox WebUI)"
            else:
                webui_text = "❌"
        table.add_row("安装WebUI", webui_text)
        
        ui.console.print(table)
        
        return ui.confirm("\n确认以上配置并开始部署？")
    
    def _run_deployment_steps(self, deploy_config: Dict, progress_callback: Optional[Callable] = None) -> Dict[str, str]:
        """执行所有部署步骤，可选进度回调"""
        bot_type = deploy_config.get("bot_type", "MaiBot")
        bot_path_key = "mai_path" if bot_type == "MaiBot" else "mofox_path"
        total_steps = 6
        selected_version = deploy_config.get("selected_version", {})

        def _notify(step: int, name: str, status: str, msg: str = ""):
            if progress_callback:
                progress_callback(step=step, total_steps=total_steps, step_name=name, status=status, message=msg)

        paths = {
            bot_path_key: "",
            "adapter_path": "",
            "napcat_path": "",
            "venv_path": "",
            "webui_path": "",
            "mongodb_path": deploy_config.get("mongodb_path", ""),
        }

        # 步骤1：安装Bot
        _notify(1, f"安装{bot_type}本体", "running", f"正在准备部署 {bot_type}，实例昵称: {deploy_config.get('nickname', '-')}")
        _notify(1, f"安装{bot_type}本体", "running", f"目标版本: {selected_version.get('display_name') or selected_version.get('name', '未知')}")
        _notify(1, f"安装{bot_type}本体", "running", f"安装目录: {deploy_config.get('install_dir', '-')}")
        _notify(1, f"安装{bot_type}本体", "running", f"正在从仓库克隆 {bot_type}...")
        if bot_type == "MaiBot":
            paths[bot_path_key] = self.maibot_deployer.install_bot(deploy_config)
        else:
            paths[bot_path_key] = self.mofox_deployer.install_bot(deploy_config)

        if not paths[bot_path_key]:
            _notify(1, f"安装{bot_type}本体", "failed", f"{bot_type}安装失败，请检查网络连接或仓库地址")
            raise Exception(f"{bot_type}安装失败")
        _notify(1, f"安装{bot_type}本体", "completed", f"{bot_type}安装完成，路径: {paths[bot_path_key]}")

        # 步骤2：处理适配器路径
        if deploy_config.get("install_adapter"):
            _notify(2, "安装适配器", "running", f"正在为 {bot_type} 安装适配器...")
        else:
            _notify(2, "安装适配器", "running", "跳过适配器安装（未勾选）")
        if deploy_config.get("install_adapter"):
            if bot_type == "MaiBot":
                paths["adapter_path"] = self.maibot_deployer.install_adapter(deploy_config, paths[bot_path_key])
                _notify(2, "安装适配器", "completed", f"适配器安装完成，路径: {paths['adapter_path']}")
            else:
                ui.console.print("\n[🔌 第二步：适配器配置]", style=ui.colors["primary"])
                ui.print_info("MoFox_bot已内置适配器，跳过外置适配器安装")
                paths["adapter_path"] = "内置适配器"
                _notify(2, "安装适配器", "running", "MoFox_bot 使用内置适配器，无需额外下载")
        elif bot_type == "MoFox_bot":
            ui.print_info("检测到MoFox_bot，将记录内置适配器路径")
            nickname = deploy_config.get("nickname", "MoFox_bot_instance")
            instance_dir = os.path.join(deploy_config["install_dir"], nickname)
            paths["adapter_path"] = os.path.join(instance_dir, "MoFox_bot-Adapter")
        _notify(2, "安装适配器", "completed", "适配器处理完成")

        # 步骤3：安装NapCat
        if deploy_config.get("install_napcat") and deploy_config.get("napcat_version"):
            napcat_ver = deploy_config["napcat_version"].get("display_name", "未知版本")
            _notify(3, "安装NapCat", "running", f"正在下载并安装 NapCat {napcat_ver}...")
            _notify(3, "安装NapCat", "running", f"安装目标目录: {os.path.dirname(paths[bot_path_key])}")
            paths["napcat_path"] = self.napcat_deployer.install_napcat(deploy_config, paths[bot_path_key])
            if paths["napcat_path"]:
                _notify(3, "安装NapCat", "completed", f"NapCat安装完成，路径: {paths['napcat_path']}")
            else:
                _notify(3, "安装NapCat", "completed", "NapCat安装未成功，可稍后手动配置")
        else:
            _notify(3, "安装NapCat", "completed", "跳过NapCat安装（未勾选）")

        # 步骤4：WebUI处理
        _notify(4, "WebUI配置", "running", f"正在处理 {bot_type} 的WebUI配置...")
        if bot_type == "MaiBot":
            version_name = deploy_config["selected_version"].get("name", "")
            from ..utils.version_detector import has_builtin_webui

            if has_builtin_webui(version_name):
                ui.console.print("\n[🌐 第四步：WebUI配置]", style=ui.colors["primary"])
                ui.print_info(f"版本 {version_name} 内置WebUI，启动时将自动代理")
                paths["webui_path"] = "builtin"
                _notify(4, "WebUI配置", "completed", f"版本 {version_name} 内置WebUI，无需单独安装")
            else:
                ui.console.print("\n[🌐 第四步：WebUI配置]", style=ui.colors["primary"])
                ui.print_info("当前版本未内置WebUI，如需WebUI功能请从组件下载页获取")
                paths["webui_path"] = ""
                _notify(4, "WebUI配置", "completed", "当前版本未内置WebUI，跳过")
        elif bot_type == "MoFox_bot" and deploy_config.get("install_mofox_admin_ui"):
            success, paths["webui_path"] = self._install_mofox_admin_ui(deploy_config)
            if not success:
                ui.print_warning("MoFox_bot后台管理WebUI安装失败，但部署将继续...")
            _notify(4, "WebUI配置", "completed", f"MoFox后台WebUI: {'安装成功' if success else '安装失败，已跳过'}")
        elif bot_type == "MoFox_bot" and deploy_config.get("install_mofox_webui"):
            success, paths["webui_path"] = self.mofox_deployer.install_webui(deploy_config, paths[bot_path_key])
            if not success:
                ui.print_warning("MoFox WebUI安装失败，但部署将继续...")
            _notify(4, "WebUI配置", "completed", f"MoFox WebUI: {'安装成功' if success else '安装失败，已跳过'}")
        else:
            _notify(4, "WebUI配置", "completed", "跳过WebUI安装")

        # 步骤5：设置Python环境
        _notify(5, "Python环境", "running", f"正在为 {bot_type} 创建Python虚拟环境...")
        ui.console.print("\n[🐍 第五步：设置Python环境]", style=ui.colors["primary"])
        ui.print_info("正在创建Python虚拟环境...")
        _notify(5, "Python环境", "running", f"虚拟环境计划创建位置: {os.path.dirname(paths[bot_path_key])}")
        venv_success, venv_path = self.maibot_deployer.create_virtual_environment(os.path.dirname(paths[bot_path_key]))

        if venv_success:
            _notify(5, "Python环境", "running", f"虚拟环境创建成功: {venv_path}，正在安装Bot本体依赖...")
            requirements_path = os.path.join(paths[bot_path_key], "requirements.txt")
            _notify(5, "Python环境", "running", f"依赖清单路径: {requirements_path}")

            ui.print_info("正在安装Bot本体依赖...")
            deps_success = self.maibot_deployer.install_dependencies_in_venv(venv_path, requirements_path)

            adapter_deps_success = True
            adapter_path = paths.get("adapter_path", "")
            if adapter_path and adapter_path not in ["无需适配器", "内置适配器", "跳过适配器安装", ""] and not ("失败" in adapter_path):
                adapter_requirements_path = os.path.join(adapter_path, "requirements.txt")
                if os.path.exists(adapter_requirements_path):
                    _notify(5, "Python环境", "running", "正在安装适配器依赖...")
                    _notify(5, "Python环境", "running", f"适配器依赖清单路径: {adapter_requirements_path}")
                    ui.print_info("正在安装napcat适配器依赖...")
                    adapter_deps_success = self.maibot_deployer.install_dependencies_in_venv(venv_path, adapter_requirements_path)
                else:
                    ui.print_info("适配器无requirements.txt文件，跳过适配器依赖安装")
                    _notify(5, "Python环境", "running", "适配器未提供 requirements.txt，跳过适配器依赖安装")

            if deps_success and adapter_deps_success:
                ui.print_success("✅ Python环境设置完成")
                _notify(5, "Python环境", "completed", "Python虚拟环境创建成功，所有依赖安装完成")
            else:
                ui.print_warning("⚠️ 依赖安装失败，但继续部署过程")
                _notify(5, "Python环境", "completed", "虚拟环境已创建，但部分依赖安装失败")

            paths["venv_path"] = venv_path
        else:
            ui.print_warning("⚠️ 虚拟环境创建失败，将使用系统Python")
            paths["venv_path"] = ""
            _notify(5, "Python环境", "completed", "虚拟环境创建失败，将使用系统Python")

        if bot_type == "MaiBot" and paths.get("webui_path") and paths.get("venv_path"):
            _notify(5, "Python环境", "running", "正在安装WebUI后端依赖...")
            ui.console.print("\n[🔄 在虚拟环境中安装WebUI后端依赖]", style=ui.colors["primary"])
            webui_installer.install_webui_backend_dependencies(paths["webui_path"], paths["venv_path"])
            _notify(5, "Python环境", "running", f"WebUI后端依赖安装路径: {paths['webui_path']}")
        _notify(5, "Python环境", "completed", "Python环境设置完成")

        # 步骤6：配置文件设置
        _notify(6, "配置文件", "running", f"正在为 {bot_type} 设置配置文件...")
        _notify(6, "配置文件", "running", f"Bot路径: {paths[bot_path_key]}")
        if paths.get("adapter_path"):
            _notify(6, "配置文件", "running", f"适配器路径: {paths['adapter_path']}")
        if paths.get("napcat_path"):
            _notify(6, "配置文件", "running", f"NapCat路径: {paths['napcat_path']}")
        if bot_type == "MaiBot":
            if not self.maibot_deployer.setup_config_files(
                deploy_config,
                paths[bot_path_key],
                paths.get("adapter_path", ""),
                paths.get("napcat_path", ""),
                paths.get("mongodb_path", ""),
                paths.get("webui_path", "")
            ):
                _notify(6, "配置文件", "running", "⚠️ 配置文件设置失败，但部署将继续")
                ui.print_warning("配置文件设置失败，但部署将继续...")
        else:
            if not self.mofox_deployer.setup_config_files(
                deploy_config,
                paths[bot_path_key],
                paths.get("adapter_path", ""),
                paths.get("napcat_path", ""),
                paths.get("mongodb_path", ""),
                paths.get("webui_path", "")
            ):
                _notify(6, "配置文件", "running", "⚠️ 配置文件设置失败，但部署将继续")
                ui.print_warning("配置文件设置失败，但部署将继续...")
        _notify(6, "配置文件", "completed", f"{bot_type} 配置文件设置完成")

        return paths

    def _finalize_deployment(self, deploy_config: Dict, **paths: str) -> bool:
        """第七步：完成部署配置"""
        bot_type = deploy_config.get("bot_type", "MaiBot")
        bot_path_key = "mai_path" if bot_type == "MaiBot" else "mofox_path"
        bot_path = paths.get(bot_path_key, "")
        
        ui.console.print("\n[⚙️ 第七步：完成部署配置]", style=ui.colors["primary"])
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
            "install_webui": deploy_config.get("install_webui", False),
            "install_mofox_admin_ui": deploy_config.get("install_mofox_admin_ui", False),
            "install_mofox_webui": deploy_config.get("install_mofox_webui", False)
        }
        
        new_config = {
            "serial_number": deploy_config["serial_number"],
            "absolute_serial_number": config_manager.generate_unique_serial(),
            "version_path": deploy_config["selected_version"]["name"],
            "nickname_path": deploy_config["nickname"],
            "bot_type": bot_type,  # 添加bot类型
            "qq_account": deploy_config.get("qq_account", ""),
            bot_path_key: bot_path,
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
        ui.console.print(f"Bot类型：{bot_type}")
        ui.console.print(f"版本：{deploy_config['selected_version']['name']}")
        ui.console.print(f"安装路径：{bot_path}")
        
        ui.console.print("\n[🔧 已安装组件]", style=ui.colors["success"])
        ui.console.print(f"  • {bot_type}主体：✅")
        ui.console.print(f"  • 适配器：{'✅' if install_options['install_adapter'] else '❌'}")
        ui.console.print(f"  • NapCat：{'✅' if install_options['install_napcat'] else '❌'}")
        ui.console.print(f"  • MongoDB：{'✅' if install_options['install_mongodb'] else '❌'}")
        
        # 根据bot类型显示不同的WebUI
        if bot_type == "MaiBot":
            webui_name = "WebUI"
            webui_installed = install_options.get('install_webui', False)
        elif bot_type == "MoFox_bot":
            if install_options.get('install_mofox_admin_ui', False):
                webui_name = "MoFox_bot后台管理WebUI"
                webui_installed = True
            elif install_options.get('install_mofox_webui', False):
                webui_name = "MoFox WebUI"
                webui_installed = True
            else:
                webui_name = "WebUI"
                webui_installed = False
        else:
            webui_name = "WebUI"
            webui_installed = False
            
        ui.console.print(f"  • {webui_name}：{'✅' if webui_installed else '❌'}")
        
        ui.print_success("✅ 部署配置完成")
        logger.info("配置创建成功", config=new_config)
        return True
    
    def _show_post_deployment_info(self, bot_path: str, bot_config: Dict, adapter_path: str = ""):
        """显示部署后的信息并提供打开配置文件的选项"""
        version_info = bot_config.get("selected_version", {})
        version_name = version_info.get("name", "")
        bot_type = bot_config.get("bot_type", "MaiBot")

        is_modern_config = compare_versions(version_name, "0.10.0") >= 0
        is_maibot_branch_not_classical = (bot_type == "MaiBot" and
                                      version_info.get("type") == "branch" and
                                      version_info.get("name") != "classical")

        ui.console.print("\n[📝 后续配置提醒]", style=ui.colors["info"])
        if is_modern_config or bot_type == "MoFox_bot" or is_maibot_branch_not_classical:
            ui.console.print("1. 在 'config/model_config.toml' 文件中配置您的API密钥。", style=ui.colors["attention"])
        else:
            ui.console.print("1. 在根目录的 '.env' 文件中配置您的APIKey（MaiCore的0.10.0及以上版本已经转移至model_config.toml文件中，LPMM知识库构建所需模型亦在此文件中配置）。", style=ui.colors["attention"])

        ui.console.print("2. 修改 'config/bot_config.toml' 中的机器人配置。", style=ui.colors["attention"])

        # 检查是否有 lpmm_config.toml
        if os.path.exists(os.path.join(bot_path, 'config', 'lpmm_config.toml')):
            ui.console.print("3. 如需使用LPMM知识库，请在 'config/lpmm_config.toml'中添加用于LPMM知识库构建所需的APIKey。", style=ui.colors["attention"])

        ui.console.print("4. 如安装了NapCat，请配置QQ登录和WebSocket连接参数。", style=ui.colors["attention"])
        ui.console.print("\n您现在可以通过主菜单的启动选项来运行该实例。", style=ui.colors["success"])

        # 询问是否打开配置文件 - 在询问前发送通知
        if windows_notifier.is_enabled():
            windows_notifier.send("部署即将完成", "是否在文本编辑器中打开配置文件？")
        
        if ui.confirm("\n是否立即在文本编辑器中打开主要配置文件？"):
            files_to_open = []
            
            # 始终打开.env文件（墨狐和麦麦都要打开）
            env_file = os.path.join(bot_path, ".env")
            if os.path.exists(env_file):
                files_to_open.append(env_file)
            
            # 确定要打开的配置文件
            if is_modern_config or bot_type == "MoFox_bot" or is_maibot_branch_not_classical:
                model_config = os.path.join(bot_path, "config", "model_config.toml")
                if os.path.exists(model_config):
                    files_to_open.append(model_config)
            
            bot_config_file = os.path.join(bot_path, "config", "bot_config.toml")
            if os.path.exists(bot_config_file):
                files_to_open.append(bot_config_file)

            # 处理适配器配置文件
            is_mofox_internal_adapter = (bot_type == "MoFox_bot" and not bot_config.get("install_adapter"))

            if adapter_path and adapter_path not in ["无需适配器", "内置适配器"]:
                adapter_config_file = os.path.join(adapter_path, "config.toml")
                if os.path.exists(adapter_config_file):
                    files_to_open.append(adapter_config_file)
                elif is_mofox_internal_adapter:
                    # 如果MoFox_bot的内置适配器配置不存在，检查plugins文件夹
                    plugins_folder = os.path.join(bot_path, "config", "plugins")
                    if not os.path.exists(plugins_folder):
                        ui.print_warning("内置适配器配置文件尚未生成，请先启动一次主程序以自动创建，然后再使用本功能打开。")

            if files_to_open:
                open_files_in_editor(files_to_open)
        
        # 询问是否在Windows资源管理器中打开实例文件夹
        if ui.confirm("\n是否在Windows资源管理器中打开实例所在文件夹？"):
            try:
                # 获取实例文件夹路径（bot_path的父目录）
                instance_folder = os.path.dirname(bot_path)
                if os.path.exists(instance_folder):
                    # 使用Windows的explorer命令打开文件夹
                    # 注意：explorer命令在某些情况下会返回非零状态码，但文件夹确实被打开了
                    result = subprocess.run(["explorer", instance_folder], capture_output=True)
                    ui.print_success(f"已在Windows资源管理器中打开文件夹: {instance_folder}")
                else:
                    ui.print_error(f"实例文件夹不存在: {instance_folder}")
            except Exception as e:
                ui.print_error(f"打开文件夹时发生错误: {str(e)}")
    
    def _check_and_install_webui(self, deploy_config: Dict, bot_path: str, venv_path: str = "") -> Tuple[bool, str]:
        """检查并安装WebUI（如果需要）"""
        try:
            ui.console.print("\n[🌐 WebUI安装检查]", style=ui.colors["primary"])
            
            # 获取实例目录 - bot_path 是 Bot 主程序路径 (例如: D:/instances/test_instance/MaiBot)
            # 实例目录应该是其父目录 (例如: D:/instances/test_instance)
            instance_dir = os.path.dirname(bot_path)
            
            logger.info("开始WebUI安装检查", instance_dir=instance_dir, bot_path=bot_path)
            
            # 调用WebUI安装器进行直接安装，传入Bot主程序路径
            # WebUI安装器内部会使用 os.path.dirname(bot_path) 来获取实例目录
            success, webui_path = webui_installer.install_webui_directly(bot_path, venv_path)
            
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
    
    def _install_mofox_admin_ui(self, deploy_config: Dict) -> Tuple[bool, str]:
        """安装MoFox_bot后台管理WebUI"""
        ui.console.print("\n[🦊 安装MoFox_bot后台管理WebUI]", style=ui.colors["primary"])
        
        try:
            # First, check for NodeJS
            ui.print_info("检查Node.js环境...")
            node_installed, _ = webui_installer.check_nodejs_installed()
            npm_installed, _ = webui_installer.check_npm_installed()

            if not node_installed or not npm_installed:
                ui.print_warning("未检测到Node.js或npm")
                ui.print_info("WebUI需要Node.js环境支持")
                if ui.confirm("是否自动安装Node.js？"):
                    if not webui_installer.install_nodejs():
                        ui.print_error("Node.js安装失败，跳过WebUI安装")
                        return False, ""
                else:
                    ui.print_info("已跳过WebUI安装")
                    return True, ""  # Not a failure, just skipped.

            install_dir = deploy_config["install_dir"]
            
            ui.print_info("正在下载MoFox_bot后台管理WebUI...")
            
            download_url = "https://github.com/MoFox-Studio/MoFox-UI/archive/refs/heads/main.zip"
            
            with tempfile.TemporaryDirectory() as temp_dir:
                archive_path = os.path.join(temp_dir, "mofox_ui.zip")
                
                if not self.maibot_deployer.download_file(download_url, archive_path):
                    ui.print_error("MoFox_bot WebUI下载失败")
                    return False, ""

                # 解压
                if not self.maibot_deployer.extract_archive(archive_path, temp_dir):
                    ui.print_error("MoFox_bot WebUI解压失败")
                    return False, ""
                
                # 查找解压后的目录
                extracted_dirs = [d for d in os.listdir(temp_dir) if os.path.isdir(os.path.join(temp_dir, d)) and "MoFox-UI" in d]
                if not extracted_dirs:
                    ui.print_error("解压后未找到MoFox-UI目录")
                    return False, ""
                
                source_dir = os.path.join(temp_dir, extracted_dirs[0])
                
                # 重命名为 'webui' 并移动
                webui_path = os.path.join(install_dir, "webui")
                if os.path.exists(webui_path):
                    ui.print_warning(f"目录 '{webui_path}' 已存在，将覆盖。")
                    shutil.rmtree(webui_path)
                
                shutil.move(source_dir, webui_path)
                ui.print_success(f"WebUI源码已移动到: {webui_path}")

                # 安装依赖
                ui.print_info("正在安装WebUI依赖 (npm install)...")
                
                result = subprocess.run(
                    ["npm", "install"],
                    cwd=webui_path,
                    shell=True,
                    capture_output=True,
                    text=True,
                    encoding='utf-8'
                )

                if result.returncode == 0:
                    ui.print_success("✅ WebUI依赖安装完成")
                    logger.info("MoFox WebUI依赖安装成功", path=webui_path)
                    return True, webui_path
                else:
                    ui.print_error("❌ WebUI依赖安装失败")
                    ui.console.print(result.stdout)
                    ui.console.print(result.stderr)
                    logger.error("MoFox WebUI依赖安装失败", error=result.stderr)
                    return True, webui_path

        except Exception as e:
            ui.print_error(f"MoFox_bot WebUI安装失败：{str(e)}")
            logger.error("MoFox_bot WebUI安装失败", error=str(e))
            return False, ""
    
    def update_instance(self) -> bool:
        """更新实例 - 使用InstanceUpdater进行安全更新"""
        try:
            # 获取所有实例配置
            configs = config_manager.get_all_configurations()
            if not configs:
                ui.print_error("当前没有可更新的实例配置！")
                return False

            # 显示所有实例
            from rich.table import Table
            table = Table(
                show_header=True,
                header_style=ui.colors["table_header"],
                title="[bold]可更新实例列表[/bold]",
                title_style=ui.colors["primary"],
                border_style=ui.colors["border"]
            )
            table.add_column("实例昵称", style="green", width=20)
            table.add_column("序列号", style="yellow", width=20)
            table.add_column("当前版本", style="blue", width=15)
            table.add_column("Bot类型", style="magenta", width=12)

            config_keys = list(configs.keys())
            for key in config_keys:
                cfg = configs[key]
                bot_type = str(cfg.get("bot_type", "MaiBot"))
                bot_path = cfg.get("mai_path") if bot_type == "MaiBot" else cfg.get("mofox_path")
                bot_path = str(bot_path) if bot_path else "-"
                nickname = str(cfg.get("nickname_path", "-"))
                version = str(cfg.get("version_path", "-"))
                serial = str(cfg.get("serial_number", "-"))
                table.add_row(nickname, serial, version, bot_type)

            ui.console.print(table)
            ui.console.print("\n[Q] 取消更新", style=ui.colors["exit"])
            ui.console.print(f"提示：共有 {len(config_keys)} 个实例可更新", style=ui.colors["info"])

            # 输入序列号进行匹配
            while True:
                serial_input = ui.get_input("请输入要更新实例的序列号: ").strip()
                if serial_input.upper() == "Q":
                    ui.print_info("已取消更新操作。")
                    return False
                
                # 匹配实例
                matched_key = None
                matched_cfg = None
                for key in config_keys:
                    cfg = configs[key]
                    if str(cfg.get("serial_number", "")) == serial_input:
                        matched_key = key
                        matched_cfg = cfg
                        break
                
                if matched_cfg:
                    break
                else:
                    ui.print_error(f"未找到序列号为 '{serial_input}' 的实例，请重新输入。")

            # 显示匹配实例详情
            bot_type = matched_cfg.get("bot_type", "MaiBot")
            nickname = matched_cfg.get("nickname_path", "-")
            current_version = matched_cfg.get("version_path", "-")
            
            ui.console.print(f"\n[📋 找到匹配实例]", style=ui.colors["info"])
            ui.console.print(f"实例昵称: {nickname}", style=ui.colors["info"])
            ui.console.print(f"序列号: {serial_input}", style=ui.colors["info"])
            ui.console.print(f"Bot类型: {bot_type}", style=ui.colors["info"])
            ui.console.print(f"当前版本: {current_version}", style=ui.colors["info"])
            
            # 根据Bot类型选择版本管理器
            if bot_type == "MaiBot":
                version_manager = self.maibot_deployer.version_manager
            else:
                version_manager = self.mofox_deployer.version_manager
            
            # 选择新版本
            new_version = version_manager.show_version_menu(bot_type)
            if not new_version:
                ui.print_info("已取消版本选择。")
                return False
            
            # 使用InstanceUpdater进行安全更新
            return self.instance_updater.update_instance(serial_input, new_version)
            
        except Exception as e:
            ui.print_error(f"实例更新失败: {str(e)}")
            logger.error("实例更新失败", error=str(e))
            return False
    
    def delete_instance(self) -> bool:
        """删除实例并提供备份选项 - 支持通过序列号直接匹配"""
        set_console_log_level("WARNING")
        try:
            ui.clear_screen()
            ui.components.show_title("实例删除助手", symbol="🗑️")

            # 获取所有实例配置
            configs = config_manager.get_all_configurations()
            if not configs:
                ui.print_error("当前没有可删除的实例配置！")
                return False

            # 显示所有实例
            from rich.table import Table
            table = Table(show_header=True, header_style=ui.colors["table_header"], title="[bold]可删除实例列表[/bold]", title_style=ui.colors["primary"], border_style=ui.colors["border"])
            table.add_column("实例昵称", style="green", width=20)
            table.add_column("序列号", style="yellow", width=20)
            table.add_column("安装路径", style="blue", width=40)
            table.add_column("Bot类型", style="magenta", width=12)

            config_keys = list(configs.keys())
            for key in config_keys:
                cfg = configs[key]
                bot_type = str(cfg.get("bot_type", "MaiBot"))
                bot_path = cfg.get("mai_path") if bot_type == "MaiBot" else cfg.get("mofox_path")
                bot_path = str(bot_path) if bot_path else "-"
                nickname = str(cfg.get("nickname_path", "-"))
                serial = str(cfg.get("serial_number", "-"))
                table.add_row(
                    nickname, 
                    serial, 
                    bot_path, 
                    bot_type
                )

            ui.console.print(table)
            ui.console.print("\n[Q] 取消删除", style=ui.colors["exit"])
            ui.console.print(f"提示：共有 {len(config_keys)} 个实例可删除", style=ui.colors["info"])

            # 输入序列号进行匹配
            while True:
                serial_input = ui.get_input("请输入要删除实例的序列号: ").strip()
                if serial_input.upper() == "Q":
                    ui.print_info("已取消删除操作。")
                    return False
                
                # 匹配实例
                matched_key = None
                matched_cfg = None
                for key in config_keys:
                    cfg = configs[key]
                    if str(cfg.get("serial_number", "")) == serial_input:
                        matched_key = key
                        matched_cfg = cfg
                        break
                
                if matched_cfg:
                    break
                else:
                    ui.print_error(f"未找到序列号为 '{serial_input}' 的实例，请重新输入。")

            # 显示匹配实例详情
            bot_type = matched_cfg.get("bot_type", "MaiBot")
            bot_path = matched_cfg.get("mai_path") if bot_type == "MaiBot" else matched_cfg.get("mofox_path")
            nickname = matched_cfg.get("nickname_path", "-")
            
            ui.console.print(f"\n[⚠️ 找到匹配实例]", style=ui.colors["warning"])
            ui.console.print(f"实例昵称: {nickname}", style=ui.colors["info"])
            ui.console.print(f"序列号: {serial_input}", style=ui.colors["info"])
            ui.console.print(f"Bot类型: {bot_type}", style=ui.colors["info"])
            ui.console.print(f"安装路径: {bot_path or '-'}", style=ui.colors["info"])
            
            # 严格的确认逻辑 - 第一次确认
            ui.console.print(f"\n[❗] 警告：此操作将永久删除该实例的所有文件和配置！", style="bold red")
            first_confirm = ui.get_input("请输入实例昵称以确认删除: ").strip()
            if first_confirm != nickname:
                ui.print_error(f"输入的昵称不匹配，已取消删除操作。")
                return False
            
            # 第二次确认
            second_confirm = ui.get_input(f"再次确认：请输入 'DELETE' 以继续删除操作: ").strip()
            if second_confirm != "DELETE":
                ui.print_error(f"确认失败，已取消删除操作。")
                return False

            # 获取昵称目录（父目录）
            bot_instance_dir = bot_path  # Bot实例目录 (如: D:\test\mofox\MaiBot)
            nickname_dir = os.path.dirname(bot_instance_dir) if bot_instance_dir else None  # 昵称目录 (如: D:\test\mofox)
            
            if not nickname_dir or not os.path.exists(nickname_dir):
                ui.print_error("未找到实例目录，无法继续删除操作。")
                return False
            
            # 检查昵称目录下是否存在其他组件
            other_components = []
            if nickname_dir and os.path.exists(nickname_dir):
                for item in os.listdir(nickname_dir):
                    item_path = os.path.join(nickname_dir, item)
                    if os.path.isdir(item_path):
                        # 排除Bot本体目录
                        if item_path != bot_instance_dir:
                            other_components.append((item, item_path))
            
            # 询问是否一起删除其他组件
            backup_components = False
            if other_components:
                ui.console.print(f"\n[ℹ️] 发现昵称目录下存在其他组件:", style=ui.colors["info"])
                for comp_name, _ in other_components:
                    ui.console.print(f"  - {comp_name}", style="cyan")
                backup_components = ui.confirm("是否备份这些组件？")
            
            # 备份与删除逻辑
            if ui.confirm("是否在删除前备份实例数据？"):
                try:
                    parent_dir = os.path.dirname(nickname_dir)
                    delete_target = os.path.join(parent_dir, f"{os.path.basename(nickname_dir)}-delete")
                    
                    # 如果目标已存在，先删除
                    if os.path.exists(delete_target):
                        ui.print_warning(f"目标目录已存在，将先删除: {delete_target}")
                        self._safe_rmtree(delete_target)
                    
                    # 创建删除目录
                    os.makedirs(delete_target, exist_ok=True)
                    ui.print_info(f"备份将保存到: {delete_target}")
                    
                    # 备份 Bot 本体的 data 和 config 文件夹
                    bot_data_dir = os.path.join(bot_instance_dir, "data")
                    bot_config_dir = os.path.join(bot_instance_dir, "config")
                    
                    if os.path.exists(bot_data_dir):
                        target_path = os.path.join(delete_target, "data")
                        shutil.copytree(bot_data_dir, target_path, dirs_exist_ok=True)
                        ui.print_success(f"✅ 已备份: data")
                    
                    if os.path.exists(bot_config_dir):
                        target_path = os.path.join(delete_target, "config")
                        shutil.copytree(bot_config_dir, target_path, dirs_exist_ok=True)
                        ui.print_success(f"✅ 已备份: config")
                    
                    # 如果用户选择备份其他组件，复制整个组件目录
                    if backup_components and other_components:
                        for comp_name, comp_path in other_components:
                            target_comp_path = os.path.join(delete_target, comp_name)
                            shutil.copytree(comp_path, target_comp_path, dirs_exist_ok=True)
                            ui.print_success(f"✅ 已备份组件: {comp_name}")
                    
                    ui.print_success(f"备份完成: {delete_target}")
                    
                    # 删除原始昵称目录
                    ui.print_info(f"正在删除原目录: {nickname_dir}")
                    self._safe_rmtree(nickname_dir)
                    ui.print_success(f"✅ 已删除原目录")
                    
                except Exception as e:
                    ui.print_error(f"备份或删除失败: {str(e)}")
                    if not ui.confirm("操作失败，是否继续尝试直接删除？"):
                        ui.print_info("已取消删除操作。")
                        return False
                    # 尝试直接删除
                    try:
                        self._safe_rmtree(nickname_dir)
                        ui.print_success(f"已直接删除目录: {nickname_dir}")
                    except Exception as e2:
                        ui.print_error(f"直接删除也失败: {str(e2)}")
                        return False
            else:
                # 不备份，直接删除
                try:
                    ui.print_warning(f"将直接删除目录（不备份）: {nickname_dir}")
                    self._safe_rmtree(nickname_dir)
                    ui.print_success(f"✅ 已删除目录: {nickname_dir}")
                except Exception as e:
                    ui.print_error(f"删除失败: {str(e)}")
                    return False

            # 删除配置
            if matched_key is not None and config_manager.delete_configuration(matched_key):
                ui.print_success("已删除实例配置。")
            else:
                ui.print_warning("实例配置删除失败，请手动检查。")

            config_manager.save()
            ui.print_success("实例删除操作完成！")
            logger.info("实例删除完成", serial=cfg.get("serial_number", "-"), nickname=cfg.get("nickname_path", "-"))
            return True
        except Exception as e:
            ui.print_error(f"实例删除失败: {str(e)}")
            logger.error("实例删除失败", error=str(e))
            return False
        finally:
            reset_console_log_level()

    def deploy_instance_webui(self, deploy_config: Dict, progress_callback: Optional[Callable] = None) -> bool:
        """WebUI模式部署实例 — 非交互式，通过progress_callback推送进度"""
        try:
            logger.info("WebUI模式开始部署实例", config=deploy_config)

            # 创建安装目录
            install_dir = deploy_config.get("install_dir", "")
            if install_dir:
                os.makedirs(install_dir, exist_ok=True)

            # 执行部署步骤（带进度回调）
            paths = self._run_deployment_steps(deploy_config, progress_callback=progress_callback)

            # 完成部署配置
            if not self._finalize_deployment(deploy_config, **paths):
                if progress_callback:
                    progress_callback(step=6, total_steps=6, step_name="完成配置", status="failed", message="配置保存失败")
                return False

            logger.info("WebUI模式部署完成", serial=deploy_config.get("serial_number"))
            return True

        except Exception as e:
            logger.error("WebUI模式部署失败", error=str(e))
            if progress_callback:
                progress_callback(step=0, total_steps=6, step_name="部署失败", status="failed", message=str(e))
            return False

    def update_instance_webui(self, serial_number: str, new_version: Dict, progress_callback: Optional[Callable] = None) -> bool:
        """WebUI模式更新实例 — 非交互式"""
        try:
            logger.info("WebUI模式开始更新实例", serial=serial_number)
            if progress_callback:
                target_ver = new_version.get("display_name") or new_version.get("name", "-")
                progress_callback(step=1, total_steps=6, step_name="准备更新", status="running", message=f"更新任务已启动，目标版本: {target_ver}")
                progress_callback(step=1, total_steps=6, step_name="准备更新", status="running", message=f"实例序列号: {serial_number}")

            result = self.instance_updater.update_instance(
                serial_number,
                new_version,
                from_webui=True,
                progress_callback=progress_callback
            )

            if progress_callback:
                if result:
                    progress_callback(step=6, total_steps=6, step_name="更新完成", status="completed", message="实例更新成功")
                else:
                    progress_callback(step=6, total_steps=6, step_name="更新失败", status="failed", message="实例更新失败")
            return result

        except Exception as e:
            logger.error("WebUI模式更新失败", error=str(e))
            if progress_callback:
                progress_callback(step=0, total_steps=6, step_name="更新失败", status="failed", message=str(e))
            return False

    def delete_instance_webui(self, serial_number: str, confirm_nickname: str, backup: bool = True) -> Dict[str, Any]:
        """WebUI模式删除实例 — 非交互式"""
        try:
            configs = config_manager.get_all_configurations()
            matched_key = None
            matched_cfg = None
            for name, cfg in configs.items():
                if cfg.get("serial_number") == serial_number:
                    matched_key = name
                    matched_cfg = cfg
                    break

            if not matched_cfg:
                return {"success": False, "message": f"未找到序列号为 {serial_number} 的实例"}

            nickname = matched_cfg.get("nickname_path", "")
            if nickname != confirm_nickname:
                return {"success": False, "message": "实例昵称不匹配"}

            bot_type = matched_cfg.get("bot_type", "MaiBot")
            bot_path = matched_cfg.get("mai_path") if bot_type == "MaiBot" else matched_cfg.get("mofox_path")
            nickname_dir = os.path.dirname(bot_path) if bot_path else None

            if not nickname_dir or not os.path.exists(nickname_dir):
                # 仅删除配置
                if matched_key and config_manager.delete_configuration(matched_key):
                    config_manager.save()
                    return {"success": True, "message": "实例目录不存在，已删除配置记录", "backup_path": None}
                return {"success": False, "message": "实例目录不存在且配置删除失败"}

            backup_path = None
            if backup:
                parent_dir = os.path.dirname(nickname_dir)
                delete_target = os.path.join(parent_dir, f"{os.path.basename(nickname_dir)}-delete")
                if os.path.exists(delete_target):
                    self._safe_rmtree(delete_target)
                os.makedirs(delete_target, exist_ok=True)
                backup_path = delete_target

                bot_data_dir = os.path.join(bot_path, "data")
                bot_config_dir = os.path.join(bot_path, "config")
                if os.path.exists(bot_data_dir):
                    shutil.copytree(bot_data_dir, os.path.join(delete_target, "data"), dirs_exist_ok=True)
                if os.path.exists(bot_config_dir):
                    shutil.copytree(bot_config_dir, os.path.join(delete_target, "config"), dirs_exist_ok=True)

            self._safe_rmtree(nickname_dir)

            if not matched_key:
                return {"success": False, "message": "未找到对应配置键，无法完成配置删除", "backup_path": backup_path}

            if not config_manager.delete_configuration(matched_key):
                return {
                    "success": False,
                    "message": "实例目录已删除，但配置删除失败，请检查配置文件状态或写入权限",
                    "backup_path": backup_path,
                }

            config_manager.save()

            msg = f"实例 {serial_number} 已删除"
            if backup and backup_path:
                msg += f"（已备份到: {backup_path}）"
            return {"success": True, "message": msg, "backup_path": backup_path}

        except Exception as e:
            logger.error("WebUI模式删除失败", error=str(e))
            return {"success": False, "message": f"删除失败: {str(e)}"}


# 全局部署管理器实例
deployment_manager = DeploymentManager()
