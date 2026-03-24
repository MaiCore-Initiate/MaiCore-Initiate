"""
配置管理模块
负责配置的创建、修改、删除等操作
"""
import structlog
import os
from typing import Dict, Any, Optional, List, Tuple
from ..core.config import config_manager
from ..utils.common import validate_path, get_input_with_validation
from ..utils.detector import auto_detector
from ..ui.interface import ui

logger = structlog.get_logger(__name__)


class ConfigManager:
    """配置管理器类"""
    
    def __init__(self):
        self.config = config_manager
    
    def _parse_bot_config(self, bot_path: str) -> Tuple[Optional[str], Optional[str]]:
        """尝试解析bot_config.toml以预填充信息"""
        import tomli
        import os
        config_path = os.path.join(bot_path, "config", "bot_config.toml")
        if os.path.exists(config_path):
            try:
                with open(config_path, "rb") as f:
                    config = tomli.load(f)
                nickname = config.get("bot", {}).get("nickname")
                qq_account = config.get("bot", {}).get("qq_account")
                return str(nickname) if nickname else None, str(qq_account) if qq_account else None
            except Exception as e:
                logger.warning("解析bot_config.toml失败", path=config_path, error=str(e))
        return None, None

    def auto_detect_and_create(self, name: str) -> bool:
        """重构后的自动检测并创建配置"""
        try:
            ui.print_info("开始自动检索Bot...")
            
            # 1. 询问Bot类型和基目录
            bot_type = ui.get_choice("请选择要检索的Bot类型: [A] MaiBot [B] MoFox_bot", ["A", "B"])
            bot_type = "MaiBot" if bot_type == "A" else "MoFox_bot"
            
            base_dir = ui.get_input("请输入要开始检索的基目录 (例如 D:\\MyBots): ")
            if not os.path.isdir(base_dir):
                ui.print_error("输入的不是一个有效的目录。")
                return False

            # 2. 调用新的检测器
            bot_path = auto_detector.detect_bot_path(base_dir)
            if not bot_path:
                ui.print_warning("在指定目录及其子目录中未找到任何Bot实例。")
                return False
            
            ui.print_success(f"成功找到Bot实例: {bot_path}")
            bot_path_key = "mai_path" if bot_type == "MaiBot" else "mofox_path"

            # 3. 解析配置并预填充
            nickname_parsed, qq_parsed = self._parse_bot_config(bot_path)
            
            nickname = nickname_parsed
            qq_account = qq_parsed

            if nickname_parsed:
                if not ui.confirm(f"检测到昵称: '{nickname_parsed}'，是否使用此昵称？"):
                    nickname = ui.get_input("请输入配置昵称：")
            else:
                nickname = ui.get_input("请输入配置昵称：")

            if qq_parsed:
                if not ui.confirm(f"检测到QQ号: '{qq_parsed}'，是否使用此QQ号？"):
                    qq_account = ui.get_input("请输入QQ账号：")
            else:
                qq_account = ui.get_input("请输入QQ账号：")

            # 4. 获取其余信息
            serial_number = ui.get_input("请输入用户序列号 (用于区分不同实例): ")
            version = ui.get_input("请输入此Bot的版本号 (例如 0.7.0, main, dev): ").lower()

            # 5. 获取组件安装选项
            install_options = self._get_install_options()
            adapter_path = self._configure_adapter_auto(version, install_options.get("install_adapter", False), bot_path, bot_type)
            napcat_path = self._configure_napcat_auto(install_options.get("install_napcat", False))
            mongodb_path = self._configure_mongodb_auto(version, install_options.get("install_mongodb", False), bot_type)
            webui_path = self._configure_webui_auto(install_options.get("install_webui", False))

            # 6. 创建配置
            new_config = {
                "serial_number": serial_number,
                "qq_account": qq_account,
                "absolute_serial_number": self.config.generate_unique_serial(),
                "version_path": version,
                "nickname_path": nickname,
                "bot_type": bot_type,
                bot_path_key: bot_path,
                "adapter_path": adapter_path,
                "napcat_path": napcat_path,
                "mongodb_path": mongodb_path,
                "webui_path": webui_path,
                "install_options": install_options
            }

            # 7. 保存配置
            if self.config.add_configuration(name, new_config):
                self.config.set("current_config", name)
                self.config.save()
                ui.print_success(f"配置 '{name}' 创建成功！")
                logger.info("自动创建配置成功", name=name, config=new_config)
                return True
            else:
                ui.print_error("配置保存失败")
                return False
                
        except Exception as e:
            ui.print_error(f"自动配置失败：{str(e)}")
            logger.error("自动配置失败", error=str(e))
            return False
    
    def manual_create(self, name: str) -> bool:
        """
        手动创建配置
        
        Args:
            name: 配置名称
            
        Returns:
            创建是否成功
        """
        try:
            ui.print_info("开始手动配置...")
            
            # 获取版本号（带格式校验+过老重输+三次吐槽）
            import re
            old_version_count = 0
            while True:
                version = ui.get_input("请输入版本号（如0.7.0或classical,main,dev）：").lower()
                m = re.match(r'^(\d+)\.(\d+)\.(\d+)$', version)
                if m:
                    major, minor, patch = map(int, m.groups())
                    if minor < 5:
                        old_version_count += 1
                        if old_version_count >= 3:
                            ui.print_warning("你是故意的吧？快升级！")
                        else:
                            ui.print_warning("你这版本太老了，快升级！请重新输入。")
                        continue
                if m or version in ("classical","dev","main"):
                    break
                else:
                    ui.print_error("版本号格式不正确，请重新输入（如0.7.0或classical）")
            # 版本号吐槽逻辑

            
            # 配置麦麦路径
            mai_path = ui.get_input("请输入麦麦本体路径：")
            valid, msg = validate_path(mai_path, check_file="bot.py")
            if not valid:
                ui.print_error(f"麦麦路径验证失败：{msg}")
                return False
            
            # 获取安装选项
            install_options = self._get_install_options()
            
            # 根据版本和选项配置适配器（手动模式）
            adapter_path = self._configure_adapter_manual(version, install_options.get("install_adapter", False), mai_path, "MaiBot")
            
            # 配置NapCat（手动模式）
            napcat_path = self._configure_napcat_manual(install_options.get("install_napcat", False))

            # 配置MongoDB（手动模式）
            mongodb_path = self._configure_mongodb_manual(version, install_options.get("install_mongodb", False), "MaiBot")
            
            # 配置WebUI（手动模式）
            webui_path = self._configure_webui_manual(install_options.get("install_webui", False))
            
            # 其他配置
            nickname = ui.get_input("请输入配置昵称：")
            serial_number = ui.get_input("请输入用户序列号：")
            qq_account = ui.get_input("请输入QQ账号：")
            
            # 创建配置
            new_config = {
                "serial_number": serial_number,
                "qq_account": qq_account,
                "absolute_serial_number": self.config.generate_unique_serial(),
                "version_path": version,
                "nickname_path": nickname,
                "bot_type": "MaiBot",  # 默认为MaiBot
                "mai_path": mai_path,  # 默认使用mai_path字段
                "adapter_path": adapter_path,
                "napcat_path": napcat_path,
                "mongodb_path": mongodb_path,
                "webui_path": webui_path,
                "install_options": install_options
            }
            
            # 保存配置
            if self.config.add_configuration(name, new_config):
                self.config.set("current_config", name)
                self.config.save()
                ui.print_success(f"配置 '{name}' 创建成功！")
                logger.info("手动创建配置成功", name=name, config=new_config)
                return True
            else:
                ui.print_error("配置保存失败")
                return False
                
        except Exception as e:
            ui.print_error(f"手动配置失败：{str(e)}")
            logger.error("手动配置失败", error=str(e))
            return False
    
    def select_configuration(self) -> Optional[Dict[str, Any]]:
        """
        选择配置
        
        Returns:
            选中的配置或None
        """
        configurations = self.config.get_all_configurations()
        if not configurations:
            ui.print_warning("没有可用的配置")
            return None
        
        # 显示配置列表
        ui.show_instance_list(configurations)
        
        # 获取用户选择
        while True:
            choice = ui.get_input("请输入您要使用的实例序列号（输入Q返回）：")
            
            if choice.upper() == 'Q':
                return None
            
            # 根据序列号查找配置
            selected_config = None
            for cfg in configurations.values():
                if (cfg.get("serial_number") == choice or 
                    str(cfg.get("absolute_serial_number")) == choice):
                    selected_config = cfg
                    break
            
            if selected_config:
                return selected_config
            else:
                ui.print_error("未找到匹配的实例序列号！")
    
    def edit_configuration(self, config_name: str) -> bool:
        """
        编辑配置
        
        Args:
            config_name: 配置名称
            
        Returns:
            编辑是否成功
        """
        try:
            configurations = self.config.get_all_configurations()
            if config_name not in configurations:
                ui.print_error(f"配置 '{config_name}' 不存在")
                return False
            
            config = configurations[config_name]
            ui.show_config_details(config_name, config)
            
            # 提供编辑选项
            while True:
                ui.console.print("\n[操作选项]")
                ui.console.print(" [A] 重新配置此配置集", style=ui.colors["success"])
                ui.console.print(" [B] 返回", style="#7E1DE4")
                
                choice = ui.get_choice("请选择操作", ["A", "B"])
                
                if choice == "B":
                    break
                elif choice == "A":
                    # 重新配置
                    if ui.confirm("是否重新配置版本号？"):
                        config['version_path'] = ui.get_input("请输入新的版本号：")
                    
                    if ui.confirm("是否重新配置昵称？"):
                        config['nickname_path'] = ui.get_input("请输入新的配置昵称：")
                    
                    if ui.confirm("是否重新配置麦麦本体路径？"):
                        # 根据bot_type字段选择正确的路径字段
                        bot_type = config.get('bot_type', 'MaiBot')  # 获取bot类型，默认为MaiBot
                        if bot_type == "MoFox_bot":
                            path_label = "墨狐本体路径"
                            path_key = "mofox_path"
                        else:
                            path_label = "麦麦本体路径"
                            path_key = "mai_path"
                        
                        mai_path = ui.get_input(f"请输入新的{path_label}：")
                        valid, msg = validate_path(mai_path, check_file="bot.py")
                        if valid:
                            config[path_key] = mai_path
                        else:
                            ui.print_error(f"路径验证失败：{msg}")
                            continue
                    
                    # 重新配置安装选项
                    if ui.confirm("是否重新配置安装选项？"):
                        install_options = self._get_install_options()
                        config['install_options'] = install_options
                        
                        # 根据新的安装选项重新配置组件（使用手动模式，因为是编辑配置）
                        version = config.get('version_path', '')
                        mai_path = config.get('mai_path', '')
                        
                        config['adapter_path'] = self._configure_adapter_manual(version, install_options.get("install_adapter", False), mai_path, config.get('bot_type', 'MaiBot'))
                        config['napcat_path'] = self._configure_napcat_manual(install_options.get("install_napcat", False))
                        config['mongodb_path'] = self._configure_mongodb_manual(version, install_options.get("install_mongodb", False), config.get('bot_type', 'MaiBot'))
                        config['webui_path'] = self._configure_webui_manual(install_options.get("install_webui", False))
                    else:
                        # 单独配置各组件
                        if ui.confirm("是否重新配置适配器路径？"):
                            adapter_path = ui.get_input("请输入新的适配器路径：")
                            valid, msg = validate_path(adapter_path, check_file="main.py")
                            if valid:
                                config['adapter_path'] = adapter_path
                            else:
                                ui.print_error(f"路径验证失败：{msg}")
                                continue
                        
                        if ui.confirm("是否重新配置NapCat路径？"):
                            config['napcat_path'] = ui.get_input("请输入新的NapCat路径（可为空）：")
                        
                        if ui.confirm("是否重新配置QQ账号？"):
                            config['qq_account'] = ui.get_input("请输入新的QQ账号：")

                        if ui.confirm("是否重新配置MongoDB路径？"):
                            config['mongodb_path'] = ui.get_input("请输入新的MongoDB路径（可为空）：")
                        
                        if ui.confirm("是否重新配置WebUI路径？"):
                            config['webui_path'] = ui.get_input("请输入新的WebUI路径（可为空）：")
                    
                    # 保存配置
                    self.config.save()
                    ui.print_success("配置更新成功！")
                    logger.info("配置编辑成功", name=config_name)
                    return True
            
            return False
            
        except Exception as e:
            ui.print_error(f"编辑配置失败：{str(e)}")
            logger.error("编辑配置失败", error=str(e))
            return False
    
    def delete_configurations(self, serial_numbers: List[str]) -> bool:
        """
        删除配置
        
        Args:
            serial_numbers: 要删除的序列号列表
            
        Returns:
            删除是否成功
        """
        try:
            configurations = self.config.get_all_configurations()
            deleted_configs = []
            
            # 查找要删除的配置
            for config_name, config in configurations.items():
                if config.get('serial_number') in serial_numbers:
                    deleted_configs.append(config_name)
            
            if not deleted_configs:
                ui.print_warning("未找到匹配的配置")
                return False
            
            # 确认删除
            ui.print_warning(f"将要删除 {len(deleted_configs)} 个配置：")
            for name in deleted_configs:
                ui.console.print(f"  - {name}")
            
            if not ui.confirm("确定要删除这些配置吗？"):
                ui.print_info("取消删除操作")
                return False
            
            # 执行删除
            for config_name in deleted_configs:
                self.config.delete_configuration(config_name)
            
            # 处理当前配置
            current_config = self.config.get("current_config")
            if current_config in deleted_configs:
                remaining_configs = self.config.get_all_configurations()
                if remaining_configs:
                    new_current = next(iter(remaining_configs))
                    self.config.set("current_config", new_current)
                else:
                    # 创建默认配置
                    default_config = {
                        "serial_number": "1",
                        "absolute_serial_number": 1,
                        "version_path": "0.0.0",
                        "nickname_path": "默认配置",
                        "bot_type": "MaiBot",  # 默认为MaiBot
                        "mai_path": "",
                        "mofox_path": "",  # 添加mofox_path字段
                        "adapter_path": "",
                        "qq_account": "",
                        "napcat_path": "",
                        "napcat_version": "",  # 添加napcat_version字段
                        "mongodb_path": "",
                        "webui_path": "",
                        "install_options": {
                            "install_adapter": False,
                            "install_napcat": False,
                            "install_mongodb": False,
                            "install_webui": False
                        }
                    }
                    self.config.add_configuration("default", default_config)
                    self.config.set("current_config", "default")
            
            self.config.save()
            ui.print_success(f"已删除 {len(deleted_configs)} 个配置")
            logger.info("配置删除成功", deleted=deleted_configs)
            return True
            
        except Exception as e:
            ui.print_error(f"删除配置失败：{str(e)}")
            logger.error("删除配置失败", error=str(e))
            return False
    
    def _get_install_options(self) -> Dict[str, bool]:
        """
        获取安装选项
        
        Returns:
            安装选项字典
        """
        ui.console.print("\n[🔧 组件安装选择]", style=ui.colors["primary"])
        ui.console.print("请选择需要安装的组件：")
        
        # 询问是否安装适配器
        install_adapter = ui.confirm("是否安装了适配器？(0.6+需要)")
        
        # 询问是否安装NapCat
        install_napcat = ui.confirm("是否安装了NapCat？(QQ连接组件)")
        
        # 询问是否安装MongoDB
        install_mongodb = ui.confirm("是否安装了MongoDB？(数据库)")
        
        # 询问是否安装WebUI
        install_webui = ui.confirm("是否安装了WebUI？(Web管理界面)")
        
        return {
            "install_adapter": install_adapter,
            "install_napcat": install_napcat,
            "install_mongodb": install_mongodb,
            "install_webui": install_webui
        }
    
    def _configure_adapter_auto(self, version: str, install_adapter: bool, mai_path: str, bot_type: str = "MaiBot") -> str:
        """
        自动配置适配器
        
        Args:
            version: 版本号
            install_adapter: 是否安装适配器
            mai_path: 麦麦路径
            bot_type: Bot类型
            
        Returns:
            适配器路径
        """
        if not install_adapter:
            ui.print_info("跳过适配器安装")
            return "跳过适配器安装"
        
        # 检查是否为旧版本
        from ..utils.version_detector import is_legacy_version_with_bot_type
        if is_legacy_version_with_bot_type(version, bot_type):
            ui.print_info("检测到旧版本，无需配置适配器")
            return "当前配置集的对象实例版本较低，无适配器"
        else:
            # 尝试自动检测适配器
            adapter_path = auto_detector.detect_adapter_path(mai_path)
            if adapter_path:
                ui.print_success(f"自动检测到适配器：{adapter_path}")
                return adapter_path
            
            # 自动检测失败，需要手动输入
            ui.print_warning("未能自动检测到适配器，需要手动配置")
            adapter_path = ui.get_input("请输入适配器路径：")
            valid, msg = validate_path(adapter_path, check_file="main.py")
            if not valid:
                ui.print_error(f"适配器路径验证失败：{msg}")
                return "适配器路径验证失败"
            
            return adapter_path
    
    def _configure_adapter_manual(self, version: str, install_adapter: bool, mai_path: str, bot_type: str = "MaiBot") -> str:
        """
        手动配置适配器
        
        Args:
            version: 版本号
            install_adapter: 是否安装适配器
            mai_path: 麦麦路径
            bot_type: Bot类型
            
        Returns:
            适配器路径
        """
        if not install_adapter:
            ui.print_info("跳过适配器安装")
            return "跳过适配器安装"
        
        # 检查是否为旧版本
        from ..utils.version_detector import is_legacy_version_with_bot_type
        if is_legacy_version_with_bot_type(version, bot_type):
            ui.print_info("检测到旧版本，无需配置适配器")
            return "当前配置集的对象实例版本较低，无适配器"
        else:
            # 手动配置适配器
            adapter_path = ui.get_input("请输入适配器路径：")
            valid, msg = validate_path(adapter_path, check_file="main.py")
            if not valid:
                ui.print_error(f"适配器路径验证失败：{msg}")
                return "适配器路径验证失败"
            
            return adapter_path
    
    def _configure_napcat_auto(self, install_napcat: bool) -> str:
        """
        自动配置NapCat
        
        Args:
            install_napcat: 是否安装NapCat
            
        Returns:
            NapCat路径
        """
        if not install_napcat:
            ui.print_info("跳过NapCat安装")
            return ""
        
        # 尝试自动检测NapCat
        napcat_path = auto_detector.detect_napcat_path()
        if napcat_path:
            ui.print_success(f"自动检测到NapCat：{napcat_path}")
            return napcat_path
        
        # 自动检测失败，需要手动输入
        ui.print_info("未检测到NapCat，需要手动配置")
        napcat_path = ui.get_input("请输入NapCat路径（NapCatWinBootMain.exe)(可为空）：")
        
        return napcat_path or ""
    
    def _configure_napcat_manual(self, install_napcat: bool) -> str:
        """
        手动配置NapCat
        
        Args:
            install_napcat: 是否安装NapCat
            
        Returns:
            NapCat路径
        """
        if not install_napcat:
            ui.print_info("跳过NapCat安装")
            return ""
        
        # 手动配置NapCat
        napcat_path = ui.get_input("请输入NapCat路径(NapCatWinBootMain.exe)（可为空）：")
        
        return napcat_path or ""
    
    def _configure_mongodb_auto(self, version: str, install_mongodb: bool, bot_type: str = "MaiBot") -> str:
        """
        自动配置MongoDB
        
        Args:
            version: 版本号
            install_mongodb: 是否安装MongoDB
            bot_type: Bot类型
            
        Returns:
            MongoDB路径
        """
        if not install_mongodb:
            ui.print_info("跳过MongoDB安装")
            return ""
        
        # 检查版本建议
        from ..utils.version_detector import needs_mongodb
        if needs_mongodb(version, bot_type):
            ui.print_info("检测到0.7以下版本，建议配置MongoDB")
            mongodb_path = ui.get_input("请输入MongoDB路径（可为空）：")
        else:
            ui.print_info("0.7及以上版本MaiMbot不需要MongoDB")
        return mongodb_path or ""
    
    def _configure_mongodb_manual(self, version: str, install_mongodb: bool, bot_type: str = "MaiBot") -> str:
        """
        手动配置MongoDB
        
        Args:
            version: 版本号
            install_mongodb: 是否安装MongoDB
            bot_type: Bot类型
            
        Returns:
            MongoDB路径
        """
        if not install_mongodb:
            ui.print_info("跳过MongoDB安装")
            return ""
        
        # 检查版本建议
        from ..utils.version_detector import needs_mongodb
        if needs_mongodb(version, bot_type):
            ui.print_info("检测到0.7以下版本，建议配置MongoDB")
            mongodb_path = ui.get_input("请输入MongoDB路径（可为空）：")
        else:
            ui.print_info("0.7及以上版本MaiMbot不需要MongoDB")
            return ""
        
        
        return mongodb_path or ""
    
    def _configure_webui_auto(self, install_webui: bool) -> str:
        """
        自动配置WebUI
        
        Args:
            install_webui: 是否安装WebUI
            
        Returns:
            WebUI路径
        """
        if not install_webui:
            ui.print_info("跳过WebUI安装")
            return ""
        
        # 尝试自动检测WebUI（如果有相关检测功能）
        # 这里可以添加自动检测逻辑
        webui_path = ui.get_input("请输入WebUI路径（可为空）：")
        
        return webui_path or ""
    
    def _configure_webui_manual(self, install_webui: bool) -> str:
        """
        手动配置WebUI
        
        Args:
            install_webui: 是否安装WebUI
            
        Returns:
            WebUI路径
        """
        if not install_webui:
            ui.print_info("跳过WebUI配置")
            return ""
        
        webui_path = ui.get_input("请输入WebUI路径（可为空）：")
        
        return webui_path or ""

    def open_config_files(self, config: Dict[str, Any]):
        """打开选中配置的主要配置文件"""
        from ..utils.common import open_files_in_editor
        from ..utils.version_detector import compare_versions
        import os

        bot_type = config.get("bot_type", "MaiBot")
        if bot_type == "MaiBot":
            bot_path_key = "mai_path"
        elif bot_type in {"MoFox_bot", "MoFox-Core"}:
            bot_path_key = "mofox_path"
            bot_type = "MoFox-Core"
        else:
            bot_path_key = "neo_mofox_path"
        bot_path = config.get(bot_path_key)

        if not bot_path or not os.path.exists(bot_path):
            ui.print_error("当前配置的Bot路径无效或不存在。")
            return

        version_name = config.get("version_path", "")
        is_modern_config = compare_versions(version_name, "0.10.0") >= 0

        files_to_open = []
        
        if bot_type != "Neo-MoFox":
            env_file = os.path.join(bot_path, ".env")
            if os.path.exists(env_file):
                files_to_open.append(env_file)
        
        # 确定要打开的配置文件
        if is_modern_config and bot_type == "MaiBot":
            model_config = os.path.join(bot_path, "config", "model_config.toml")
            if os.path.exists(model_config):
                files_to_open.append(model_config)

            # 为 0.10.0+ 添加 plugin_config.toml
            plugin_config = os.path.join(bot_path, "config", "plugin_config.toml")
            if os.path.exists(plugin_config):
                files_to_open.append(plugin_config)
        
        if bot_type == "Neo-MoFox":
            for config_name in ["model.toml", "core.toml"]:
                config_file = os.path.join(bot_path, "config", config_name)
                if os.path.exists(config_file):
                    files_to_open.append(config_file)
        else:
            bot_config_file = os.path.join(bot_path, "config", "bot_config.toml")
            if os.path.exists(bot_config_file):
                files_to_open.append(bot_config_file)
        
        # 新增逻辑：为特定版本的MaiBot添加lpmm_config.toml
        if bot_type == "MaiBot" and \
           compare_versions(version_name, "0.6.3") >= 0 and \
           compare_versions(version_name, "0.10.0") < 0:
            lpmm_config_file = os.path.join(bot_path, "config", "lpmm_config.toml")
            if os.path.exists(lpmm_config_file):
                files_to_open.append(lpmm_config_file)

        if bot_type in {"MoFox-Core", "Neo-MoFox"}:
            adapter_config = os.path.join(bot_path, "config", "plugins", "napcat_adapter", "config.toml")
            if os.path.exists(adapter_config):
                files_to_open.append(adapter_config)

        if files_to_open:
            open_files_in_editor(files_to_open)
        else:
            ui.print_warning("未找到任何可供打开的配置文件。")
    
    def open_instance_folder(self, config: Dict[str, Any]):
        """打开选中配置的实例所在目录"""
        import subprocess
        import os

        bot_type = config.get("bot_type", "MaiBot")
        if bot_type == "MaiBot":
            bot_path_key = "mai_path"
        elif bot_type in {"MoFox_bot", "MoFox-Core"}:
            bot_path_key = "mofox_path"
        else:
            bot_path_key = "neo_mofox_path"
        bot_path = config.get(bot_path_key)

        if not bot_path or not os.path.exists(bot_path):
            ui.print_error("当前配置的Bot路径无效或不存在。")
            return

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
        
# 全局配置管理器实例
config_mgr = ConfigManager()
