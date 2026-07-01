# -*- coding: utf-8 -*-
"""
MaiBot部署器
负责MaiBot的部署逻辑，包括版本检测、适配器安装等
"""
import os
import re
import shutil
import tempfile
from typing import Dict, Optional
import structlog

from .base_deployer import BaseDeployer
from .version_manager import VersionManager
from ...ui.interface import ui
from ...utils.version_detector import get_version_requirements, compare_versions, is_plugin_adapter_version

logger = structlog.get_logger(__name__)


class MaiBotDeployer(BaseDeployer):
    """MaiBot部署器"""
    
    def __init__(self):
        super().__init__()
        self.repo = "Mai-with-u/MaiBot"
        self.adapter_repo = "Mai-with-u/MaiBot-Napcat-Adapter"
        self.version_manager = VersionManager(self.repo)
    
    def install_bot(self, deploy_config: Dict) -> Optional[str]:
        """
        安装MaiBot主体
        
        Args:
            deploy_config: 部署配置
            
        Returns:
            MaiBot安装路径，失败返回None
        """
        ui.console.print("\n[📦 第一步：安装MaiBot]", style=ui.colors["primary"])
        
        selected_version = deploy_config["selected_version"]
        install_dir = deploy_config["install_dir"]
        
        # 使用实例昵称作为父目录，与MoFox_bot保持一致
        nickname = deploy_config.get("nickname", "MaiBot_instance")
        instance_dir = os.path.join(install_dir, nickname)
        target_dir = os.path.join(instance_dir, "MaiBot")
        
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
            ui.print_success("✅ MaiBot安装完成")
            logger.info("MaiBot安装成功", path=target_dir, method="git_or_download")
            return target_dir
        else:
            ui.print_error("MaiBot安装失败")
            return None
    
    def install_adapter(self, deploy_config: Dict, bot_path: str) -> str:
        """
        检测版本并安装适配器
        
        Args:
            deploy_config: 部署配置
            bot_path: MaiBot路径
            
        Returns:
            适配器路径或状态信息
        """
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
        ui.console.print("  • 低于1.0.0：使用0.7.0外置适配器")
        ui.console.print("  • 1.0.0及以上：使用main分支插件适配器，安装到MaiBot/plugins")
        ui.console.print("  • 部署方式：优先使用git clone，失败时回退到下载压缩包")

        deploy_config["adapter_mode"] = (
            "plugin" if is_plugin_adapter_version(version_to_check, "MaiBot") else "external"
        )
        
        # 判断是否需要适配器
        adapter_path = self._determine_adapter_requirements(version_to_check, bot_path)
        
        if adapter_path == "无需适配器":
            deploy_config["adapter_mode"] = "none"
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
                os.path.join(maibot_path, "napcat-adapter"),
                os.path.join(maibot_path, "plugins", "MaiBot-Napcat-Adapter"),
            ]
            
            for path in potential_adapter_paths:
                if os.path.exists(path):
                    ui.print_info(f"发现已存在的适配器：{path}")
                    return path
            
            # 使用版本检测模块
            version_reqs = get_version_requirements(version, "MaiBot")
            
            ui.print_info(f"版本分析结果：")
            ui.print_info(f"  版本号：{version}")
            ui.print_info(f"  是否旧版本：{version_reqs['is_legacy']}")
            ui.print_info(f"  需要适配器：{version_reqs['needs_adapter']}")
            ui.print_info(f"  适配器版本：{version_reqs['adapter_version']}")
            ui.print_info(f"  适配器模式：{version_reqs.get('adapter_mode', 'external')}")
            
            # 检查是否需要适配器
            if not version_reqs["needs_adapter"]:
                return "无需适配器"
            
            adapter_version = version_reqs["adapter_version"]
            
            # 根据适配器版本下载
            return self._download_specific_adapter_version(
                adapter_version,
                maibot_path,
                version_reqs.get("adapter_mode", "external")
            )
                
        except Exception as e:
            ui.print_error(f"适配器处理失败：{str(e)}")
            logger.error("适配器处理异常", error=str(e))
            return "适配器处理失败"
    
    def _download_specific_adapter_version(self, adapter_version: str, maibot_path: str, adapter_mode: str = "external") -> str:
        """下载特定版本的适配器"""
        if adapter_mode == "plugin":
            adapter_parent_dir = os.path.join(maibot_path, "plugins")
            os.makedirs(adapter_parent_dir, exist_ok=True)
            adapter_extract_path = os.path.join(adapter_parent_dir, "MaiBot-Napcat-Adapter")
        else:
            # 旧版外置适配器安装到主程序同父级目录下。
            adapter_parent_dir = os.path.dirname(maibot_path)
            adapter_extract_path = os.path.join(adapter_parent_dir, "MaiBot-Napcat-Adapter")
        
        # 如果目标目录已存在，先删除
        if os.path.exists(adapter_extract_path):
            try:
                shutil.rmtree(adapter_extract_path)
            except Exception as e:
                ui.print_warning(f"删除旧适配器目录失败: {str(e)}")
        
        # 确定分支名称
        if adapter_version in ["main", "dev"]:
            branch = adapter_version
        else:
            branch = adapter_version
        
        # 优先使用Git clone，失败时回退到下载压缩包
        fallback_url = None
        if adapter_version in ["main", "dev"]:
            fallback_url = f"https://codeload.github.com/{self.adapter_repo}/zip/refs/heads/{adapter_version}"
        else:
            fallback_url = f"https://codeload.github.com/{self.adapter_repo}/zip/refs/heads/{adapter_version}"
        
        ui.print_info(f"适配器安装模式: {'插件' if adapter_mode == 'plugin' else '外置进程'}")
        ui.print_info(f"适配器目标路径: {adapter_extract_path}")

        if self.download_with_git_fallback(self.adapter_repo, adapter_extract_path, branch, fallback_url):
            ui.print_success(f"适配器安装完成")
            logger.info("适配器安装成功", version=adapter_version, mode=adapter_mode, path=adapter_extract_path)
            return adapter_extract_path
        else:
            ui.print_warning("适配器安装失败")
            return "适配器安装失败"
    
    def setup_config_files(self, deploy_config: Dict, bot_path: str, 
                          adapter_path: str = "", napcat_path: str = "",
                          mongodb_path: str = "", webui_path: str = "") -> bool:
        """
        设置MaiBot配置文件
        
        Args:
            deploy_config: 部署配置
            bot_path: MaiBot路径
            adapter_path: 适配器路径
            napcat_path: NapCat路径
            mongodb_path: MongoDB路径
            webui_path: WebUI路径
            
        Returns:
            是否设置成功
        """
        ui.console.print("\n[⚙️ 第六步：配置文件设置]", style=ui.colors["primary"])
        
        # 获取版本信息以进行条件判断
        version_name = deploy_config.get("selected_version", {}).get("name", "")

        try:
            # 准备路径
            config_dir = os.path.join(bot_path, "config")
            template_dir = os.path.join(bot_path, "template")
            
            # 1. 处理Bot主程序配置文件
            ui.print_info("正在设置MaiBot配置文件...")
            
            # Case: MaiBot >= 0.10.0
            if compare_versions(version_name, "0.10.0") >= 0:
                os.makedirs(config_dir, exist_ok=True)
                ui.print_info("为 MaiBot >= 0.10.0 创建标准配置文件...")

                # 复制 bot_config_template.toml
                bot_config_template = os.path.join(template_dir, "bot_config_template.toml")
                bot_config_target = os.path.join(config_dir, "bot_config.toml")
                if os.path.exists(bot_config_template):
                    shutil.copy2(bot_config_template, bot_config_target)
                    ui.print_success("✅ bot_config.toml 配置完成")
                else:
                    ui.print_warning(f"⚠️ 未找到模板: {bot_config_template}")

                # 复制 model_config_template.toml
                model_config_template = os.path.join(template_dir, "model_config_template.toml")
                model_config_target = os.path.join(config_dir, "model_config.toml")
                if os.path.exists(model_config_template):
                    shutil.copy2(model_config_template, model_config_target)
                    ui.print_success("✅ model_config.toml 配置完成")
                else:
                    ui.print_warning(f"⚠️ 未找到模板: {model_config_template}")
                
                # 仅在部署MoFox_bot实例时处理插件配置
                if deploy_config.get("bot_type") == "MoFox_bot":
                    plugin_template = os.path.join(template_dir, "plugin_config_template.toml")
                    plugin_target = os.path.join(config_dir, "plugin_config.toml")
                    if os.path.exists(plugin_template):
                        shutil.copy2(plugin_template, plugin_target)
                        ui.print_success("✅ plugin_config.toml 配置完成")
                    else:
                        ui.print_warning(f"⚠️ 未找到模板: plugin_config_template.toml")
            
            # Case: 其他所有情况 (旧版MaiBot, MaiBot分支)
            else:
                os.makedirs(config_dir, exist_ok=True)
                ui.print_info(f"为 MaiBot v{version_name} 创建标准配置文件...")
                
                # 复制 bot_config_template.toml (通用)
                bot_config_template = os.path.join(template_dir, "bot_config_template.toml")
                bot_config_target = os.path.join(config_dir, "bot_config.toml")
                if os.path.exists(bot_config_template):
                    shutil.copy2(bot_config_template, bot_config_target)
                    ui.print_success("✅ bot_config.toml 配置完成")
                else:
                    ui.print_warning(f"⚠️ 未找到模板: {bot_config_template}")

                # 非classical分支需要model_config.toml
                version_info = deploy_config.get("selected_version", {})
                is_maibot_branch_not_classical = (
                    version_info.get("type") == "branch" and
                    version_info.get("name") != "classical"
                )

                if is_maibot_branch_not_classical:
                    model_config_template = os.path.join(template_dir, "model_config_template.toml")
                    model_config_target = os.path.join(config_dir, "model_config.toml")
                    if os.path.exists(model_config_template):
                        shutil.copy2(model_config_template, model_config_target)
                        ui.print_success("✅ model_config.toml 配置完成")
                    else:
                        ui.print_warning(f"⚠️ 未找到模板: {model_config_template}")

                # 特定旧版的 lpmm_config.toml
                if (compare_versions(version_name, "0.6.3") >= 0 and 
                    compare_versions(version_name, "0.10.0") < 0):
                    lpmm_template = os.path.join(template_dir, "lpmm_config_template.toml")
                    lpmm_target = os.path.join(config_dir, "lpmm_config.toml")
                    if os.path.exists(lpmm_template):
                        shutil.copy2(lpmm_template, lpmm_target)
                        ui.print_success("✅ lpmm_config.toml 配置完成")
                    else:
                        ui.print_warning(f"⚠️ 未找到模板: lpmm_config_template.toml")

            # 复制 template.env (所有版本都需要)
            env_template = os.path.join(template_dir, "template.env")
            env_target = os.path.join(bot_path, ".env")
            if os.path.exists(env_template):
                shutil.copy2(env_template, env_target)
                try:
                    with open(env_target, 'r+', encoding='utf-8') as f:
                        content = f.read()
                        content = re.sub(r'PORT=\d+', 'PORT=8000', content) if 'PORT=' in content else content + '\nPORT=8000\n'
                        f.seek(0)
                        f.write(content)
                        f.truncate()
                    ui.print_success("✅ .env 配置完成 (PORT=8000)")
                except Exception as e:
                    ui.print_warning(f"⚠️ .env 文件PORT修改失败: {str(e)}")
            else:
                ui.print_warning(f"⚠️ 未找到环境变量模板文件")

            # 2. 处理适配器配置文件
            if adapter_path and adapter_path not in ["无需适配器", "跳过适配器安装"] and not ("失败" in adapter_path):
                ui.print_info("正在设置适配器配置文件...")
                adapter_template_dir = os.path.join(adapter_path, "template")
                if os.path.exists(adapter_template_dir):
                    for file in os.listdir(adapter_template_dir):
                        if file.endswith(('.toml', '.json', '.yaml')):
                            source_file = os.path.join(adapter_template_dir, file)
                            target_filename = file.replace('template_', '').replace('_template', '')
                            target_file = os.path.join(adapter_path, target_filename)
                            try:
                                shutil.copy2(source_file, target_file)
                                ui.print_success(f"✅ 适配器配置文件: {target_filename}")
                            except Exception as e:
                                ui.print_warning(f"⚠️ 适配器配置文件复制失败: {file} - {str(e)}")
                else:
                    ui.print_info("适配器无需额外配置文件")

            # 3. 配置提示
            if napcat_path:
                ui.print_info("NapCat配置提醒:")
                ui.console.print("  • 请参考 https://docs.mai-mai.org/manual/adapters/napcat.html")

            if mongodb_path:
                ui.print_info("MongoDB配置完成:")
                ui.console.print(f"  • MongoDB路径: {mongodb_path}")
            
            if webui_path:
                ui.print_info("WebUI配置完成:")
                ui.console.print(f"  • WebUI路径: {webui_path}")
            
            ui.print_success("✅ 配置文件设置完成")
            return True
            
        except Exception as e:
            ui.print_error(f"配置文件设置失败: {str(e)}")
            logger.error("配置文件设置失败", error=str(e))
            return False
