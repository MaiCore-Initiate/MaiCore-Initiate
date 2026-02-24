# -*- coding: utf-8 -*-
"""
WebUI 配置 API 模块
提供 WebUI 前端配置 + 实例配置的读写接口，支持热重载
"""
import os
import subprocess
from typing import Any, Dict
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..core.webui_config import webui_config
from ..core.config import config_manager
from ..core.p_config import p_config_manager

router = APIRouter()


class UpdateConfigRequest(BaseModel):
    key: str
    value: Any


class CreateInstanceRequest(BaseModel):
    name: str
    config: Dict[str, Any]


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
    """读取 config.toml 中的所有实例配置（返回完整字段）"""
    config_manager.reload_if_changed()
    configs = config_manager.get_all_configurations()
    current = config_manager.get("current_config")
    return {
        "current_config": current,
        "next_serial": config_manager.generate_unique_serial(),
        "instances": {
            name: {
                "serial_number": cfg.get("serial_number", ""),
                "nickname": cfg.get("nickname_path", ""),
                "absolute_serial": cfg.get("absolute_serial_number", 0),
                "bot_type": cfg.get("bot_type", ""),
                "qq_account": cfg.get("qq_account", ""),
                "version": cfg.get("version_path", ""),
                "mai_path": cfg.get("mai_path", ""),
                "mofox_path": cfg.get("mofox_path", ""),
                "adapter_path": cfg.get("adapter_path", ""),
                "napcat_path": cfg.get("napcat_path", ""),
                "mongodb_path": cfg.get("mongodb_path", ""),
                "webui_path": cfg.get("webui_path", ""),
                "venv_path": cfg.get("venv_path", ""),
                "install_options": cfg.get("install_options", {}),
            }
            for name, cfg in configs.items()
        },
    }


@router.get("/instances/next-serial")
def get_next_serial():
    """获取下一个可用的绝对序列号"""
    return {"next_serial": config_manager.generate_unique_serial()}


@router.post("/instances")
def create_instance(req: CreateInstanceRequest):
    """创建新实例配置，含校验"""
    config_manager.reload_if_changed()
    configs = config_manager.get_all_configurations()

    # 配置集名称重复检查
    if req.name in configs:
        raise HTTPException(400, f"配置集 '{req.name}' 已存在")

    cfg = req.config
    serial = cfg.get("serial_number", "").strip()

    # 序列号重复检查
    if serial:
        for existing in configs.values():
            if existing.get("serial_number", "") == serial:
                raise HTTPException(400, f"序列号 '{serial}' 已被其他实例使用")

    # 路径有效性检查
    bot_type = cfg.get("bot_type", "MaiBot")
    path_key = "mofox_path" if bot_type == "MoFox_bot" else "mai_path"
    main_path = cfg.get(path_key, "").strip()
    if main_path and not os.path.isdir(main_path):
        raise HTTPException(400, f"主程序路径不存在: {main_path}")

    for key, label in [("adapter_path", "适配器目录"), ("webui_path", "WebUI路径")]:
        p = cfg.get(key, "").strip()
        if p and not os.path.isdir(p):
            raise HTTPException(400, f"{label}不存在: {p}")

    new_config = cfg.copy()
    new_config["absolute_serial_number"] = config_manager.generate_unique_serial()
    if config_manager.add_configuration(req.name, new_config):
        config_manager.save()
        return {"status": "success", "message": f"实例 '{req.name}' 创建成功"}
    raise HTTPException(500, "创建失败")


_UPDATABLE_FIELDS = {
    "serial_number", "nickname_path", "version_path", "bot_type",
    "qq_account", "mai_path", "mofox_path", "adapter_path",
    "napcat_path", "venv_path", "webui_path",
}


@router.post("/instances/{name}")
def update_instance(name: str, updates: Dict[str, Any]):
    """更新实例配置（仅允许白名单字段）"""
    config_manager.reload_if_changed()
    configs = config_manager.get_all_configurations()
    if name not in configs:
        raise HTTPException(404, f"配置集 '{name}' 未找到")
    filtered = {k: v for k, v in updates.items() if k in _UPDATABLE_FIELDS}
    configs[name].update(filtered)
    config_manager.save()
    return {"status": "success", "message": f"实例 '{name}' 更新成功"}


@router.post("/instances/{name}/open-config")
def open_instance_config(name: str):
    """打开实例的配置文件"""
    config_manager.reload_if_changed()
    configs = config_manager.get_all_configurations()
    if name not in configs:
        raise HTTPException(404, f"配置集 '{name}' 未找到")
    cfg = configs[name]
    bot_type = cfg.get("bot_type", "MaiBot")
    bot_path = os.path.realpath(cfg.get("mai_path" if bot_type == "MaiBot" else "mofox_path", ""))
    if not bot_path or not os.path.isdir(bot_path):
        raise HTTPException(400, "Bot路径无效或不是目录")

    files_to_open = []
    for f in [".env", os.path.join("config", "bot_config.toml"),
              os.path.join("config", "model_config.toml")]:
        fp = os.path.realpath(os.path.join(bot_path, f))
        # 确保文件在 bot_path 内，防止路径遍历
        if fp.startswith(bot_path) and os.path.isfile(fp):
            files_to_open.append(fp)

    if not files_to_open:
        raise HTTPException(404, "未找到可打开的配置文件")

    for fp in files_to_open:
        try:
            os.startfile(fp)
        except Exception:
            subprocess.Popen(["notepad", fp])
    return {"success": True, "opened": len(files_to_open)}


@router.post("/instances/{name}/open-folder")
def open_instance_folder(name: str):
    """打开实例所在目录"""
    config_manager.reload_if_changed()
    configs = config_manager.get_all_configurations()
    if name not in configs:
        raise HTTPException(404, f"配置集 '{name}' 未找到")
    cfg = configs[name]
    bot_type = cfg.get("bot_type", "MaiBot")
    bot_path = os.path.realpath(cfg.get("mai_path" if bot_type == "MaiBot" else "mofox_path", ""))
    if not bot_path or not os.path.isdir(bot_path):
        raise HTTPException(400, "Bot路径无效或不是目录")
    subprocess.Popen(["explorer", bot_path])
    return {"success": True}


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
