# -*- coding: utf-8 -*-
"""
WebUI API模块
为WebUI提供调用后端功能的API接口
"""
from .deploy_api import router as deploy_router
from .launcher_api import router as launcher_router
from .multi_instance_api import router as multi_instance_router
from .knowledge_api import router as knowledge_router
from .port_api import router as port_router
from .process_api import router as process_router
from .stats_api import router as stats_router
from .webui_config_api import router as webui_config_router
from .preferences_api import router as preferences_router
from .plugin_api import router as plugin_router

__all__ = [
    "deploy_router",
    "launcher_router",
    "multi_instance_router",
    "knowledge_router",
    "port_router",
    "process_router",
    "stats_router",
    "webui_config_router",
    "preferences_router",
    "plugin_router"
]
