"""
麦麦启动器配置模块
负责配置文件的加载、保存和管理
"""
import os
import toml
import structlog
from typing import Dict, Any, Optional

logger = structlog.get_logger(__name__)


class Config:
    """配置管理类"""
    
    CONFIG_FILE = "config/config.toml"
    CONFIG_TEMPLATE = {
        "current_config": "default",
        "configurations": {
            "default": {
                "serial_number": "1",
                "absolute_serial_number": 1,
                "version_path": "0.0.0",
                "nickname_path": "默认配置",
                "bot_type": "MaiBot",  # 新增字段，标识bot类型 ("MaiBot" 或 "MoFox_bot")
                "mai_path": "",
                "mofox_path": "",  # 新增字段，墨狐本体路径
                "neo_mofox_path": "",
                "adapter_path": "",
                "napcat_path": "",
                "napcat_version": "",  # 新增字段，标识NapCatQQ版本 (如 "NapCat.Shell")
                "venv_path": "",
                "mongodb_path": "",
                "webui_path": "",
                "install_options": {},
                "mod_binding": {},
                "deployment_profile": {},
                "component_bindings": [],
                "template_inputs": {},
                "qq_account": ""
            }
        }
    }
    
    def __init__(self):
        self.config: Dict[str, Any] = {}
        self._mtime: float = 0
        self.load()

    def load(self) -> Dict[str, Any]:
        """加载配置文件"""
        try:
            if not os.path.exists(self.CONFIG_FILE):
                logger.warning("配置文件不存在，使用默认配置", file=self.CONFIG_FILE)
                self.config = self.CONFIG_TEMPLATE.copy()
                self.save()
                return self.config

            self._mtime = os.path.getmtime(self.CONFIG_FILE)
            with open(self.CONFIG_FILE, 'r', encoding='utf-8') as f:
                self.config = toml.load(f)
                logger.info("成功加载配置文件", current_config=self.config.get('current_config'))
                
            # 确保配置结构完整
            if "configurations" not in self.config:
                logger.warning("配置缺少 'configurations'，使用默认值")
                self.config["configurations"] = self.CONFIG_TEMPLATE["configurations"].copy()
                
            if "current_config" not in self.config:
                logger.warning("配置缺少 'current_config'，使用默认值 'default'")
                self.config["current_config"] = "default"
            
            # 验证并修复序列号
            if self._validate_and_repair_serials():
                self.save()

            self._ensure_configuration_defaults()

            return self.config
            
        except Exception as e:
            logger.error("加载配置文件失败，使用默认配置", error=str(e))
            self.config = self.CONFIG_TEMPLATE.copy()
            return self.config
    
    def save(self) -> bool:
        """保存配置文件"""
        try:
            with open(self.CONFIG_FILE, 'w', encoding='utf-8') as f:
                toml.dump(self.config, f)
            self._mtime = os.path.getmtime(self.CONFIG_FILE)
            logger.info("配置文件保存成功")
            return True
        except Exception as e:
            logger.error("保存配置文件失败", error=str(e))
            return False

    def reload_if_changed(self) -> bool:
        """如果文件被外部修改则重新加载，返回是否重载"""
        try:
            if os.path.exists(self.CONFIG_FILE) and os.path.getmtime(self.CONFIG_FILE) > self._mtime:
                self.load()
                return True
        except Exception:
            pass
        return False

    def get(self, key: str, default: Any = None) -> Any:
        """获取配置值"""
        return self.config.get(key, default)
    
    def set(self, key: str, value: Any) -> None:
        """设置配置值"""
        self.config[key] = value
    
    def get_current_config(self) -> Optional[Dict[str, Any]]:
        """获取当前激活的配置"""
        current_name = self.config.get("current_config")
        configurations = self.config.get("configurations", {})
        return configurations.get(current_name)
    
    def get_all_configurations(self) -> Dict[str, Any]:
        """获取所有配置"""
        return self.config.get("configurations", {})
    
    def add_configuration(self, name: str, config: Dict[str, Any]) -> bool:
        """添加新配置"""
        try:
            if "configurations" not in self.config:
                self.config["configurations"] = {}
            
            # 检查 absolute_serial_number 的唯一性
            new_serial = config.get("absolute_serial_number")
            for existing_config in self.config["configurations"].values():
                if existing_config.get("absolute_serial_number") == new_serial:
                    logger.error("添加配置失败：absolute_serial_number 已存在", new_serial=new_serial)
                    return False
            
            self.config["configurations"][name] = config
            logger.info("添加新配置", name=name)
            return True
        except Exception as e:
            logger.error("添加配置失败", name=name, error=str(e))
            return False
    
    def delete_configuration(self, name: str) -> bool:
        """删除配置"""
        try:
            if name in self.config.get("configurations", {}):
                del self.config["configurations"][name]
                logger.info("删除配置", name=name)
                return True
            else:
                logger.warning("配置不存在", name=name)
                return False
        except Exception as e:
            logger.error("删除配置失败", name=name, error=str(e))
            return False
    
    def generate_unique_serial(self) -> int:
        """生成唯一的绝对序列号"""
        configurations = self.get_all_configurations()
        existing_serials = {cfg.get("absolute_serial_number", 0) for cfg in configurations.values()}
        return max(existing_serials) + 1 if existing_serials else 1

    def _ensure_configuration_defaults(self) -> None:
        """确保每个实例配置都包含新字段默认值。"""
        defaults = self.CONFIG_TEMPLATE["configurations"]["default"]
        for name, cfg in self.get_all_configurations().items():
            updated = False
            for key, value in defaults.items():
                if key not in cfg:
                    cfg[key] = value.copy() if isinstance(value, (dict, list)) else value
                    updated = True
            if updated:
                logger.info("已为实例补齐默认配置字段", name=name)

    def _validate_and_repair_serials(self) -> bool:
        """验证并修复绝对序列号，确保其唯一且升序"""
        repaired = False
        configurations = self.get_all_configurations()
        if not configurations:
            return False

        # 获取所有配置项，保持原始顺序
        config_items = list(configurations.items())

        # 检查是否存在问题（重复或不连续），并确保类型为整数
        try:
            serials = [int(cfg.get("absolute_serial_number")) for _, cfg in config_items]
            is_problematic = len(serials) != len(set(serials)) or sorted(serials) != list(range(1, len(serials) + 1))
        except (ValueError, TypeError):
            # 如果转换失败或存在None，则认为有问题，需要修复
            is_problematic = True

        if is_problematic:
            logger.warning("检测到绝对序列号存在问题，开始修复...")
            repaired = True
            # 按原始顺序重新分配序列号
            for i, (name, config) in enumerate(config_items):
                self.config["configurations"][name]["absolute_serial_number"] = i + 1

            logger.info("绝对序列号修复完成。")

        return repaired


# 全局配置实例
config_manager = Config()
