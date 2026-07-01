# -*- coding: utf-8 -*-
"""实例打包与导入 WebUI API。"""
from __future__ import annotations

import os
import re
import shutil
import tempfile
import uuid
from pathlib import Path
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel

from ..cli.pack import (
    PackFilter,
    check_github_auth,
    import_instance,
    pack_instance,
    read_mcsins_meta,
    resolve_instance_dirs,
)
from ..core.config import config_manager
from .auth_core import require_action

router = APIRouter()

_IMPORT_TEMP_DIR = Path(tempfile.gettempdir()) / "maicorestart-mcsins-imports"
_IMPORT_TEMP_DIR.mkdir(parents=True, exist_ok=True)


class PackExportRequest(BaseModel):
    instance: str
    output_path: str = ""
    description: str = ""
    include_data: bool = True
    include_config: bool = True
    include_components: bool = True
    include_src: bool = True
    include_plugins: bool = True
    include_venv: bool = False
    only_components: List[str] = []
    only_plugins: List[str] = []


class PackImportConfirmRequest(BaseModel):
    token: str
    dest_dir: str = ""
    setup_venv: bool = False


def _normalize_bot_type(bot_type: str) -> str:
    if bot_type in {"MoFox-Core", "MoFox_bot"}:
        return "MoFox-Core"
    if bot_type == "Neo-MoFox":
        return "Neo-MoFox"
    return "MaiBot"


def _path_key(bot_type: str) -> str:
    normalized = _normalize_bot_type(bot_type)
    if normalized == "MoFox-Core":
        return "mofox_path"
    if normalized == "Neo-MoFox":
        return "neo_mofox_path"
    return "mai_path"


def _resolve_cfg(identifier: str) -> tuple[str, Dict[str, Any]]:
    config_manager.reload_if_changed()
    configs = config_manager.get_all_configurations()
    if identifier in configs:
        return identifier, configs[identifier]
    for name, cfg in configs.items():
        if str(cfg.get("serial_number", "")) == str(identifier):
            return name, cfg
    raise HTTPException(404, f"实例 '{identifier}' 未找到")


def _is_registered_source(cfg: Dict[str, Any]) -> bool:
    return str(cfg.get("source") or "register") == "register"


def _safe_default_output(name: str, cfg: Dict[str, Any]) -> str:
    try:
        dirs = resolve_instance_dirs(cfg)
        parent = dirs["nickname_dir"].parent
    except Exception:
        parent = Path.cwd()
    serial = str(cfg.get("serial_number") or name)
    return str(parent / f"{serial}.mcsins")


def _instance_payload(name: str, cfg: Dict[str, Any]) -> Dict[str, Any]:
    bot_type = _normalize_bot_type(str(cfg.get("bot_type", "MaiBot")))
    main_path = str(cfg.get(_path_key(bot_type), "") or "")
    return {
        "name": name,
        "serial": str(cfg.get("serial_number", "") or ""),
        "nickname": str(cfg.get("nickname_path", "") or name),
        "absolute_serial": cfg.get("absolute_serial_number", 0),
        "bot_type": bot_type,
        "version": str(cfg.get("version_path", "") or ""),
        "source": str(cfg.get("source") or "register"),
        "main_path": main_path,
        "can_pack": _is_registered_source(cfg),
        "default_output_path": _safe_default_output(name, cfg) if _is_registered_source(cfg) else "",
    }


def _inventory_payload(cfg: Dict[str, Any]) -> Dict[str, Any]:
    dirs = resolve_instance_dirs(cfg)
    bot_dir = dirs["bot_dir"]
    nickname_dir = dirs["nickname_dir"]
    plugins_dir = dirs["plugins_dir"]
    venv_dir = dirs.get("venv_dir")

    components = []
    for item in nickname_dir.iterdir():
        if item.name == bot_dir.name:
            continue
        components.append({
            "name": item.name,
            "type": "dir" if item.is_dir() else "file",
        })

    plugins = []
    if plugins_dir.is_dir():
        plugins = [
            {"name": item.name, "type": "dir"}
            for item in plugins_dir.iterdir()
            if item.is_dir()
        ]

    return {
        "components": sorted(components, key=lambda item: item["name"].lower()),
        "plugins": sorted(plugins, key=lambda item: item["name"].lower()),
        "venv_path": str(venv_dir) if venv_dir else "",
    }


def _meta_payload(meta: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "name": str(meta.get("name", "") or ""),
        "serial": str(meta.get("serial", "") or ""),
        "author": str(meta.get("author", "") or ""),
        "mail": str(meta.get("mail", "") or ""),
        "account": str(meta.get("account", "") or ""),
        "time": str(meta.get("time", "") or ""),
        "type": str(meta.get("type", "") or ""),
        "version": str(meta.get("version", "") or ""),
        "description": str(meta.get("description", "") or ""),
        "components": list(meta.get("components", []) or []),
        "plugins": list(meta.get("plugins", []) or []),
        "pack_source": str(meta.get("pack-source", "") or ""),
        "venv_packed": bool(meta.get("venv_packed", False)),
    }


def _default_import_dir() -> str:
    return str(Path.cwd())


def _temp_path_for_token(token: str) -> Path:
    if not re.fullmatch(r"[0-9a-f]{32}", token):
        raise HTTPException(400, "导入确认令牌无效")
    return _IMPORT_TEMP_DIR / f"{token}.mcsins"


@router.get("/instances", dependencies=[Depends(require_action("misc.package-instance.access"))])
def list_packable_instances():
    config_manager.reload_if_changed()
    configs = config_manager.get_all_configurations()
    return {
        "success": True,
        "instances": [_instance_payload(name, cfg) for name, cfg in configs.items()],
    }


@router.get("/instances/{identifier}/inventory", dependencies=[Depends(require_action("misc.package-instance.access"))])
def get_instance_inventory(identifier: str):
    name, cfg = _resolve_cfg(identifier)
    if not _is_registered_source(cfg):
        raise HTTPException(400, "只能打包已注册的本地实例")
    try:
        return {
            "success": True,
            "instance": _instance_payload(name, cfg),
            **_inventory_payload(cfg),
        }
    except Exception as exc:
        raise HTTPException(400, f"读取实例清单失败: {exc}") from exc


@router.post("/export", dependencies=[Depends(require_action("misc.package-instance.access"))])
def export_instance(req: PackExportRequest):
    name, cfg = _resolve_cfg(req.instance)
    if not _is_registered_source(cfg):
        raise HTTPException(400, "只能打包已注册的本地实例")

    try:
        github_user = check_github_auth()
    except RuntimeError as exc:
        raise HTTPException(400, str(exc)) from exc

    output_path = (req.output_path or "").strip() or _safe_default_output(name, cfg)
    if not output_path:
        raise HTTPException(400, "导出路径不能为空")

    pack_filter = PackFilter(
        no_data=not req.include_data,
        no_config=not req.include_config,
        no_components=not req.include_components,
        no_src=not req.include_src,
        no_plugins=not req.include_plugins,
        no_venv=not req.include_venv,
        only_components=req.only_components if req.include_components else [],
        only_plugins=req.only_plugins if req.include_plugins else [],
    )

    try:
        result = pack_instance(name, pack_filter, output_path, req.description, github_user)
        return {
            "success": True,
            "message": "实例打包完成",
            "output_path": result,
        }
    except Exception as exc:
        raise HTTPException(500, f"打包失败: {exc}") from exc


@router.post("/import/preview", dependencies=[Depends(require_action("misc.package-instance.access"))])
async def preview_import(file: UploadFile = File(...)):
    filename = file.filename or ""
    if not filename.lower().endswith(".mcsins"):
        raise HTTPException(400, "请上传 .mcsins 实例包")

    token = uuid.uuid4().hex
    target = _temp_path_for_token(token)
    try:
        with open(target, "wb") as handle:
            shutil.copyfileobj(file.file, handle)
        meta = read_mcsins_meta(str(target))
        return {
            "success": True,
            "token": token,
            "filename": filename,
            "default_dest_dir": _default_import_dir(),
            "meta": _meta_payload(meta),
        }
    except Exception as exc:
        try:
            target.unlink(missing_ok=True)
        except Exception:
            pass
        raise HTTPException(400, f"读取实例包失败: {exc}") from exc


@router.post("/import/confirm", dependencies=[Depends(require_action("misc.package-instance.access"))])
def confirm_import(req: PackImportConfirmRequest):
    token = (req.token or "").strip()
    if not token:
        raise HTTPException(400, "缺少导入确认令牌")
    source = _temp_path_for_token(token)
    if not source.is_file():
        raise HTTPException(404, "导入预览已失效，请重新选择实例包")

    dest_dir = (req.dest_dir or "").strip() or _default_import_dir()
    os.makedirs(dest_dir, exist_ok=True)

    try:
        extract_dir = import_instance(str(source), dest_dir, confirm=False, setup_venv=req.setup_venv)
        return {
            "success": True,
            "message": "实例导入完成",
            "extract_dir": extract_dir,
        }
    except Exception as exc:
        raise HTTPException(500, f"导入失败: {exc}") from exc
    finally:
        try:
            source.unlink(missing_ok=True)
        except Exception:
            pass
