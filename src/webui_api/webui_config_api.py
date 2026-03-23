# -*- coding: utf-8 -*-
"""
WebUI 配置 API 模块
提供 WebUI 前端配置 + 实例配置的读写接口，支持热重载
"""
import os
import subprocess
from typing import Any, Dict
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..core.webui_config import webui_config
from ..core.config import config_manager
from ..core.p_config import p_config_manager
from .auth_core import require_admin

router = APIRouter()

_LEGACY_MOFOX_TYPE = "MoFox_bot"


def _normalize_bot_type(bot_type: str) -> str:
    if bot_type in {"MoFox-Core", _LEGACY_MOFOX_TYPE}:
        return "MoFox-Core"
    if bot_type == "Neo-MoFox":
        return "Neo-MoFox"
    return "MaiBot"


def _get_bot_path_key(bot_type: str) -> str:
    normalized = _normalize_bot_type(bot_type)
    if normalized == "MoFox-Core":
        return "mofox_path"
    if normalized == "Neo-MoFox":
        return "neo_mofox_path"
    return "mai_path"


def _get_bot_root_path(cfg: Dict[str, Any]) -> str:
    return os.path.realpath(cfg.get(_get_bot_path_key(cfg.get("bot_type", "MaiBot")), ""))


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


@router.post("/config", dependencies=[Depends(require_admin)])
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
                "bot_type": _normalize_bot_type(cfg.get("bot_type", "")),
                "qq_account": cfg.get("qq_account", ""),
                "version": cfg.get("version_path", ""),
                "mai_path": cfg.get("mai_path", ""),
                "mofox_path": cfg.get("mofox_path", ""),
                "neo_mofox_path": cfg.get("neo_mofox_path", ""),
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


@router.post("/instances", dependencies=[Depends(require_admin)])
def create_instance(req: CreateInstanceRequest):
    """创建新实例配置，含校验"""
    config_manager.reload_if_changed()
    configs = config_manager.get_all_configurations()

    # 配置集名称重复检查
    if req.name in configs:
        raise HTTPException(400, f"配置集 '{req.name}' 已存在")

    cfg = req.config.copy()
    cfg["bot_type"] = _normalize_bot_type(cfg.get("bot_type", "MaiBot"))
    serial = cfg.get("serial_number", "").strip()

    # 序列号重复检查
    if serial:
        for existing in configs.values():
            if existing.get("serial_number", "") == serial:
                raise HTTPException(400, f"序列号 '{serial}' 已被其他实例使用")

    # 路径有效性检查
    bot_type = cfg.get("bot_type", "MaiBot")
    path_key = _get_bot_path_key(bot_type)
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
    "qq_account", "mai_path", "mofox_path", "neo_mofox_path",
    "adapter_path", "napcat_path", "venv_path", "mongodb_path", "webui_path",
}


@router.post("/instances/{name}", dependencies=[Depends(require_admin)])
def update_instance(name: str, updates: Dict[str, Any]):
    """更新实例配置（仅允许白名单字段）"""
    config_manager.reload_if_changed()
    configs = config_manager.get_all_configurations()
    if name not in configs:
        raise HTTPException(404, f"配置集 '{name}' 未找到")
    filtered = {k: v for k, v in updates.items() if k in _UPDATABLE_FIELDS}
    if "bot_type" in filtered:
        filtered["bot_type"] = _normalize_bot_type(filtered["bot_type"])
    configs[name].update(filtered)
    config_manager.save()
    return {"status": "success", "message": f"实例 '{name}' 更新成功"}


@router.post("/instances/{name}/open-config", dependencies=[Depends(require_admin)])
def open_instance_config(name: str):
    """打开实例的配置文件"""
    config_manager.reload_if_changed()
    configs = config_manager.get_all_configurations()
    if name not in configs:
        raise HTTPException(404, f"配置集 '{name}' 未找到")
    cfg = configs[name]
    bot_path = _get_bot_root_path(cfg)
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


@router.post("/instances/{name}/open-folder", dependencies=[Depends(require_admin)])
def open_instance_folder(name: str):
    """打开实例所在目录"""
    config_manager.reload_if_changed()
    configs = config_manager.get_all_configurations()
    if name not in configs:
        raise HTTPException(404, f"配置集 '{name}' 未找到")
    cfg = configs[name]
    bot_path = _get_bot_root_path(cfg)
    if not bot_path or not os.path.isdir(bot_path):
        raise HTTPException(400, "Bot路径无效或不是目录")
    subprocess.Popen(["explorer", bot_path])
    return {"success": True}


@router.get("/p-config")
def get_p_config():
    """读取 P-config.toml 程序配置"""
    p_config_manager.reload_if_changed()
    return p_config_manager.config


@router.post("/reload", dependencies=[Depends(require_admin)])
def reload_all():
    """强制重载所有配置文件"""
    config_manager.load()
    p_config_manager.load()
    webui_config.load()
    return {"success": True}
