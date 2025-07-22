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
    
    CONFIG_FILE = "config.toml"
    CONFIG_TEMPLATE = {
        "current_config": "default",
        "configurations": {
            "default": {
                "serial_number": "1",
                "absolute_serial_number": 1,
                "version_path": "0.0.0",
                "nickname_path": "默认配置",
                "mai_path": "",
                "adapter_path": "",
                "napcat_path": "",
                "qq_account": ""
            }
        }
    }
    
    def __init__(self):
        self.config = None
        self.load()
    
    def load(self) -> Dict[str, Any]:
        """加载配置文件"""
        try:
            if not os.path.exists(self.CONFIG_FILE):
                logger.warning("配置文件不存在，使用默认配置", file=self.CONFIG_FILE)
                self.config = self.CONFIG_TEMPLATE.copy()
                self.save()
                return self.config
            
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
            logger.info("配置文件保存成功")
            return True
        except Exception as e:
            logger.error("保存配置文件失败", error=str(e))
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


# 全局配置实例
config_manager = Config()
