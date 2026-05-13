"""
麦麦启动器程序配置模块
负责程序本身配置文件的加载、保存和管理（例如UI主题）
"""
import os
import toml
import structlog
from copy import deepcopy
from typing import Dict, Any, Optional

logger = structlog.get_logger(__name__)
MASKED_LLM_API_KEY = "***已配置***"

class PConfig:
    """程序配置管理类"""

    CONFIG_FILE = "config/P-config.toml"
    
    # 定义默认配置，特别是UI主题
    DEFAULT_CONFIG = {
        "first_run": True,  # 新增首次运行标志
        "launcher": {
            "name": "MaiCoreStart",
            "version": "5.1.0"
        },
        "theme": {
            "primary": "#BADFFA",
            "success": "#4AF933",
            "warning": "#F2FF5D",
            "error": "#FF6B6B",
            "info": "#6DA0FD",
            "secondary": "#00FFBB",
            "danger": "#FF6B6B",
            "exit": "#7E1DE4",
            "header": "#BADFFA",
            "title": "bold magenta",
            "border": "bright_black",
            "table_header": "bold magenta",
            "cyan": "cyan",
            "white": "white",
            "green": "green",
            "blue": "#005CFA",
            "attention": "#FF45F6"
        },
        "logging": {
            "log_rotation_days": 30
        },
        "display": {
            "max_versions_display": 20
        },
        "on_exit": {
            "process_action": "ask"
        },
        "notifications": {
            "windows_center_enabled": True
        },
        "ui": {
            "minimize_to_tray": False
        },
        "network": {
            "proxy": {
                "enabled": False,
                "type": "http",
                "host": "",
                "port": "",
                "username": "",
                "password": "",
                "exclude_hosts": "localhost,127.0.0.1"
            }
        },
        "monitor": {
            "data_refresh_interval": 2.0,
            "ui_refresh_interval": 0.3,
            "input_poll_interval": 0.05
        },
        "git": {
            "mirrors": [
                "https://github.com",
                "https://ghproxy.com/https://github.com",
                "https://bgithub.xyz",
            ],
            "auto_select_mirror": True,
            "selected_mirror": "",
            "timeout": 30,
            "depth": 1
        },
        "llm": {
            "provider": "openai",
            "api_key": "",
            "base_url": "https://api.openai.com/v1",
            "model": "gpt-4o-mini",
            "temperature": 0.7,
            "max_tokens": 1000,
            "timeout": 30
        },
        "webui": {
            "webui_token": "",
            "token_max_attempts": 5,
            "host": "0.0.0.0",
            "port": 10086,
            "github_oauth": {
                "enabled": True,
                "client_id": "Ov23liLTqa4d2ihNDRBK",
                "redirect_uri": "",
                "scope": "user:email"
            }
        }
    }

    def __init__(self):
        self.config: Dict[str, Any] = {}
        self._mtime: float = 0
        self.load()

    def load(self) -> Dict[str, Any]:
        """加载配置文件，如果不存在或损坏则使用默认值"""
        try:
            if not os.path.exists(self.CONFIG_FILE):
                logger.warning("程序配置文件不存在，使用默认配置", file=self.CONFIG_FILE)
                self.config = self.DEFAULT_CONFIG.copy()
                self.save()
                return self.config

            self._mtime = os.path.getmtime(self.CONFIG_FILE)
            with open(self.CONFIG_FILE, 'r', encoding='utf-8') as f:
                self.config = toml.load(f)
                logger.info("成功加载程序配置文件")
            
            # 确保配置结构完整（合并默认值）
            if self._ensure_config_integrity():
                logger.info("配置结构已更新，正在保存...")
                self.save()
            
            return self.config
            
        except Exception as e:
            logger.error("加载程序配置文件失败，使用默认配置", error=str(e))
            self.config = self.DEFAULT_CONFIG.copy()
            return self.config

    def save(self) -> bool:
        """保存当前配置到文件"""
        try:
            os.makedirs(os.path.dirname(self.CONFIG_FILE), exist_ok=True)
            with open(self.CONFIG_FILE, 'w', encoding='utf-8') as f:
                toml.dump(self.config, f)
            self._mtime = os.path.getmtime(self.CONFIG_FILE)
            logger.info("程序配置文件保存成功")
            return True
        except Exception as e:
            logger.error("保存程序配置文件失败", error=str(e))
            return False

    def reload_if_changed(self) -> bool:
        """如果文件被外部修改则重新加载"""
        try:
            if os.path.exists(self.CONFIG_FILE) and os.path.getmtime(self.CONFIG_FILE) > self._mtime:
                self.load()
                return True
        except Exception:
            pass
        return False

    def get(self, key: str, default: Any = None) -> Any:
        """获取配置值，支持点分隔的嵌套键"""
        try:
            keys = key.split('.')
            value = self.config
            for k in keys:
                value = value[k]
            return value
        except KeyError:
            return default

    def set(self, key: str, value: Any) -> None:
        """设置配置值，支持点分隔的嵌套键"""
        try:
            keys = key.split('.')
            d = self.config
            for k in keys[:-1]:
                d = d.setdefault(k, {})
            d[keys[-1]] = value
        except Exception as e:
            logger.error("设置程序配置值失败", key=key, error=str(e))

    def get_theme_colors(self) -> Dict[str, str]:
        """获取当前主题颜色"""
        return self.get("theme", self.DEFAULT_CONFIG["theme"])

    def get_proxy_config(self) -> Dict[str, Any]:
        """获取代理配置"""
        return self.get("network.proxy", self.DEFAULT_CONFIG["network"]["proxy"])

    def is_proxy_enabled(self) -> bool:
        """检查代理是否启用"""
        return self.get("network.proxy.enabled", False)

    def get_llm_config(self) -> Dict[str, Any]:
        """获取LLM配置"""
        config = deepcopy(self.get("llm", self.DEFAULT_CONFIG["llm"]))
        api_key = str(config.get("api_key", "") or "").strip()
        if api_key == MASKED_LLM_API_KEY:
            logger.warning("检测到被掩码的LLM API Key，占位值将按未配置处理")
            api_key = ""
        elif api_key and not api_key.isascii():
            logger.warning("检测到包含非ASCII字符的LLM API Key，按未配置处理")
            api_key = ""

        config["api_key"] = api_key
        config["provider"] = str(config.get("provider", "openai") or "openai").strip() or "openai"
        config["base_url"] = str(config.get("base_url", self.DEFAULT_CONFIG["llm"]["base_url"]) or "").strip() or self.DEFAULT_CONFIG["llm"]["base_url"]
        config["model"] = str(config.get("model", self.DEFAULT_CONFIG["llm"]["model"]) or "").strip() or self.DEFAULT_CONFIG["llm"]["model"]
        return config

    def reset_to_default(self) -> bool:
        """将配置重置为默认值并保存"""
        logger.info("正在将程序配置重置为默认值")
        self.config = self.DEFAULT_CONFIG.copy()
        return self.save()

    def _ensure_config_integrity(self) -> bool:
        """
        确保配置包含所有默认项
        如果是首次添加 first_run 但文件已存在，则默认为 False (避免旧用户看到新手引导)
        返回是否进行了修改
        """
        modified = False
        
        # 1. 特殊处理 first_run
        # 如果 first_run 不存在，但配置已加载（意味着是旧配置文件），则设为 False
        if "first_run" not in self.config:
            self.config["first_run"] = False
            modified = True
            logger.info("检测到旧配置文件，已将 first_run 初始化为 False")

        # 2. 递归合并默认配置
        if self._recursive_update(self.config, self.DEFAULT_CONFIG):
            modified = True
            
        return modified

    def _recursive_update(self, target: Dict, source: Dict) -> bool:
        """递归更新字典，返回是否有变更"""
        changed = False
        for k, v in source.items():
            if k == "first_run":
                continue # 已在外部处理
                
            if k not in target:
                target[k] = v
                changed = True
            elif isinstance(v, dict) and isinstance(target[k], dict):
                if self._recursive_update(target[k], v):
                    changed = True
        return changed

# 全局程序配置实例
p_config_manager = PConfig()
