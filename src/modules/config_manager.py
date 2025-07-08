"""
配置管理模块
负责配置的创建、修改、删除等操作
"""
import structlog
from typing import Dict, Any, Optional, List
from ..core.config import config_manager
from ..utils.common import validate_path, get_input_with_validation
from ..utils.detector import auto_detector
from ..ui.interface import ui

logger = structlog.get_logger(__name__)


class ConfigManager:
    """配置管理器类"""
    
    def __init__(self):
        self.config = config_manager
    
    def auto_detect_and_create(self, name: str) -> bool:
        """
        自动检测并创建配置
        
        Args:
            name: 配置名称
            
        Returns:
            创建是否成功
        """
        try:
            ui.print_info("开始自动检测...")
            
            # 自动检测麦麦路径
            mai_path = auto_detector.detect_mai_path()
            if not mai_path:
                ui.print_warning("未能自动检测到麦麦本体，需要手动配置")
                mai_path = ui.get_input("请输入麦麦本体路径：")
                valid, msg = validate_path(mai_path, check_file="bot.py")
                if not valid:
                    ui.print_error(f"麦麦路径验证失败：{msg}")
                    return False
            else:
                ui.print_success(f"自动检测到麦麦本体：{mai_path}")
            
            # 获取版本号
            version = ui.get_input("请输入版本号（如0.7.0或classical）：")
            
            # 根据版本决定适配器配置
            from ..utils.common import is_legacy_version
            if is_legacy_version(version):
                adapter_path = "当前配置集的对象实例版本较低，无适配器"
                ui.print_info("检测到旧版本，无需配置适配器")
            else:
                # 自动检测适配器
                adapter_path = auto_detector.detect_adapter_path(mai_path)
                if not adapter_path:
                    ui.print_warning("未能自动检测到适配器，需要手动配置")
                    adapter_path = ui.get_input("请输入适配器路径：")
                    valid, msg = validate_path(adapter_path, check_file="main.py")
                    if not valid:
                        ui.print_error(f"适配器路径验证失败：{msg}")
                        return False
                else:
                    ui.print_success(f"自动检测到适配器：{adapter_path}")
            
            # 可选的NapCat路径
            napcat_path = auto_detector.detect_napcat_path()
            if napcat_path:
                ui.print_success(f"自动检测到NapCat：{napcat_path}")
            else:
                ui.print_info("未检测到NapCat，可手动配置")
                napcat_path = ui.get_input("请输入NapCat路径（可为空）：")
            
            # 可选的MongoDB路径
            mongodb_path = ui.get_input("请输入MongoDB路径（可为空，小于0.7版本时建议配置）：")
            
            # 获取其他配置
            nickname = ui.get_input("请输入配置昵称：")
            serial_number = ui.get_input("请输入用户序列号：")
            
            # 创建配置
            new_config = {
                "serial_number": serial_number,
                "absolute_serial_number": self.config.generate_unique_serial(),
                "version_path": version,
                "nickname_path": nickname,
                "mai_path": mai_path,
                "adapter_path": adapter_path,
                "napcat_path": napcat_path or "",
                "mongodb_path": mongodb_path or ""
            }
            
            # 保存配置
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
            
            # 获取版本号
            version = ui.get_input("请输入版本号（如0.7.0或classical）：")
            
            # 配置麦麦路径
            mai_path = ui.get_input("请输入麦麦本体路径：")
            valid, msg = validate_path(mai_path, check_file="bot.py")
            if not valid:
                ui.print_error(f"麦麦路径验证失败：{msg}")
                return False
            
            # 根据版本决定适配器配置
            from ..utils.common import is_legacy_version
            if is_legacy_version(version):
                adapter_path = "当前配置集的对象实例版本较低，无适配器"
                ui.print_info("检测到旧版本，无需配置适配器")
            else:
                adapter_path = ui.get_input("请输入适配器路径：")
                valid, msg = validate_path(adapter_path, check_file="main.py")
                if not valid:
                    ui.print_error(f"适配器路径验证失败：{msg}")
                    return False
            
            # 可选的NapCat路径
            napcat_path = ui.get_input("请输入NapCat路径（可为空）：")
            
            # 可选的MongoDB路径
            mongodb_path = ui.get_input("请输入MongoDB路径（可为空，小于0.7版本时建议配置）：")
            
            # 其他配置
            nickname = ui.get_input("请输入配置昵称：")
            serial_number = ui.get_input("请输入用户序列号：")
            
            # 创建配置
            new_config = {
                "serial_number": serial_number,
                "absolute_serial_number": self.config.generate_unique_serial(),
                "version_path": version,
                "nickname_path": nickname,
                "mai_path": mai_path,
                "adapter_path": adapter_path,
                "napcat_path": napcat_path or "",
                "mongodb_path": mongodb_path or ""
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
                        mai_path = ui.get_input("请输入新的麦麦本体路径：")
                        valid, msg = validate_path(mai_path, check_file="bot.py")
                        if valid:
                            config['mai_path'] = mai_path
                        else:
                            ui.print_error(f"路径验证失败：{msg}")
                            continue
                    
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
                    
                    if ui.confirm("是否重新配置MongoDB路径？"):
                        config['mongodb_path'] = ui.get_input("请输入新的MongoDB路径（可为空）：")
                    
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
                        "mai_path": "",
                        "adapter_path": "",
                        "napcat_path": "",
                        "mongodb_path": ""
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


# 全局配置管理器实例
config_mgr = ConfigManager()
