# -*- coding: utf-8 -*-
"""
WebUI 配置 API 模块
提供 WebUI 前端配置 + 实例配置的读写接口，支持热重载
"""
from typing import Any
from fastapi import APIRouter
from pydantic import BaseModel

from ..core.webui_config import webui_config
from ..core.config import config_manager
from ..core.p_config import p_config_manager

router = APIRouter()


class UpdateConfigRequest(BaseModel):
    key: str
    value: Any


@router.get("/config")
def get_config():
    webui_config.reload_if_changed()
    return webui_config.config


@router.post("/config")
def update_config(req: UpdateConfigRequest):
    webui_config.set(req.key, req.value)
    webui_config.save()
    return {"success": True}


@router.get("/instances")
def get_instances():
    """读取 config.toml 中的所有实例配置"""
    config_manager.reload_if_changed()
    configs = config_manager.get_all_configurations()
    current = config_manager.get("current_config")
    return {
        "current_config": current,
        "instances": {
            name: {
                "serial_number": cfg.get("serial_number", ""),
                "nickname": cfg.get("nickname_path", ""),
                "absolute_serial": cfg.get("absolute_serial_number", 0),
                "bot_type": cfg.get("bot_type", ""),
                "qq_account": cfg.get("qq_account", ""),
                "version": cfg.get("version_path", ""),
            }
            for name, cfg in configs.items()
        },
    }


@router.get("/p-config")
def get_p_config():
    """读取 P-config.toml 程序配置"""
    p_config_manager.reload_if_changed()
    return p_config_manager.config


@router.post("/reload")
def reload_all():
    """强制重载所有配置文件"""
    config_manager.load()
    p_config_manager.load()
    webui_config.load()
    return {"success": True}
