# -*- coding: utf-8 -*-
"""
WebUI 配置模块
管理 WebUI 前端相关的配置（背景、仪表盘默认设置等）
"""
import os
import toml
import structlog
from typing import Any, Dict

logger = structlog.get_logger(__name__)


class WebUIConfig:
    """WebUI 配置管理类"""

    CONFIG_FILE = "config/webui_config.toml"

    DEFAULT_CONFIG = {
        "appearance": {
            "background_image": "",
            "background_blur": 50,
            "background_opacity": 0.01,
        },
        "dashboard": {
            "default_granularity": "day",
            "split_by_instance": False,
        },
        "terminal": {
            "webshell_use_profile": False,
        },
    }

    def __init__(self):
        self.config: Dict[str, Any] = {}
        self._mtime: float = 0
        self.load()

    def load(self) -> Dict[str, Any]:
        try:
            if not os.path.exists(self.CONFIG_FILE):
                self.config = {k: dict(v) if isinstance(v, dict) else v for k, v in self.DEFAULT_CONFIG.items()}
                self.save()
                return self.config
            self._mtime = os.path.getmtime(self.CONFIG_FILE)
            with open(self.CONFIG_FILE, "r", encoding="utf-8") as f:
                self.config = toml.load(f)
            # 合并缺失的默认值
            for section, defaults in self.DEFAULT_CONFIG.items():
                if section not in self.config:
                    self.config[section] = dict(defaults) if isinstance(defaults, dict) else defaults
                elif isinstance(defaults, dict):
                    for k, v in defaults.items():
                        self.config[section].setdefault(k, v)
            return self.config
        except Exception as e:
            logger.error("加载 WebUI 配置失败", error=str(e))
            self.config = {k: dict(v) if isinstance(v, dict) else v for k, v in self.DEFAULT_CONFIG.items()}
            return self.config

    def save(self) -> bool:
        try:
            os.makedirs(os.path.dirname(self.CONFIG_FILE), exist_ok=True)
            with open(self.CONFIG_FILE, "w", encoding="utf-8") as f:
                toml.dump(self.config, f)
            self._mtime = os.path.getmtime(self.CONFIG_FILE)
            return True
        except Exception as e:
            logger.error("保存 WebUI 配置失败", error=str(e))
            return False

    def reload_if_changed(self) -> bool:
        try:
            if os.path.exists(self.CONFIG_FILE) and os.path.getmtime(self.CONFIG_FILE) > self._mtime:
                self.load()
                return True
        except Exception:
            pass
        return False

    def get(self, key: str, default: Any = None) -> Any:
        try:
            keys = key.split(".")
            val = self.config
            for k in keys:
                val = val[k]
            return val
        except (KeyError, TypeError):
            return default

    def set(self, key: str, value: Any) -> None:
        keys = key.split(".")
        d = self.config
        for k in keys[:-1]:
            d = d.setdefault(k, {})
        d[keys[-1]] = value


webui_config = WebUIConfig()
