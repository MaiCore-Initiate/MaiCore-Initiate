# -*- coding: utf-8 -*-
"""设置管理API：P-config读写、Token管理、背景文件CRUD"""
import os
import secrets
import logging
from typing import Any, Dict, List
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel

router = APIRouter()
logger = logging.getLogger(__name__)

BACKGROUNDS_DIR = os.path.join("webui", "frontend", "public", "backgrounds")
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".webm"}
VIDEO_EXTENSIONS = {".mp4", ".webm"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
ALLOWED_SECTIONS = {"theme", "logging", "display", "on_exit", "notifications", "ui", "network", "monitor", "git"}


def _get_p_config():
    from src.core.p_config import p_config_manager
    return p_config_manager


# ── P-config 读写 ──

@router.get("/p-config")
async def get_p_config():
    mgr = _get_p_config()
    mgr.reload_if_changed()
    return {"success": True, "data": mgr.config}


class PConfigUpdateRequest(BaseModel):
    updates: Dict[str, Any]  # {"logging.log_rotation_days": 30, ...}


@router.post("/p-config")
async def update_p_config(req: PConfigUpdateRequest):
    mgr = _get_p_config()
    mgr.reload_if_changed()
    updated = []
    for key, value in req.updates.items():
        top = key.split(".")[0]
        if top not in ALLOWED_SECTIONS:
            continue
        mgr.set(key, value)
        updated.append(key)
    if updated:
        mgr.save()
    return {"success": True, "updated": updated}


# ── Token 管理 ──

@router.get("/token/current")
async def get_current_token():
    mgr = _get_p_config()
    mgr.reload_if_changed()
    token = mgr.get("webui.webui_token", "")
    return {"success": True, "token": token}


class TokenChangeRequest(BaseModel):
    new_token: str = ""


@router.post("/token/change")
async def change_token(req: TokenChangeRequest):
    token = req.new_token.strip()
    if not token:
        token = secrets.token_hex(16)
    if len(token) < 8:
        raise HTTPException(400, "Token长度不能少于8个字符")
    mgr = _get_p_config()
    mgr.set("webui.webui_token", token)
    mgr.save()
    return {"success": True, "token": token}


# ── 背景文件管理 ──

def _safe_filename(filename: str) -> str:
    return os.path.basename(filename).strip()


@router.get("/backgrounds")
async def list_backgrounds():
    os.makedirs(BACKGROUNDS_DIR, exist_ok=True)
    files = []
    for name in os.listdir(BACKGROUNDS_DIR):
        fp = os.path.join(BACKGROUNDS_DIR, name)
        if not os.path.isfile(fp):
            continue
        ext = os.path.splitext(name)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            continue
        files.append({
            "filename": name,
            "size_kb": round(os.path.getsize(fp) / 1024, 2),
            "is_video": ext in VIDEO_EXTENSIONS,
        })
    return {"success": True, "files": files}


@router.post("/backgrounds/upload")
async def upload_background(file: UploadFile = File(...)):
    safe_name = _safe_filename(file.filename or "upload")
    ext = os.path.splitext(safe_name)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"不支持的文件类型: {ext}")
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(400, "文件大小超过50MB限制")
    os.makedirs(BACKGROUNDS_DIR, exist_ok=True)
    dest = os.path.join(BACKGROUNDS_DIR, safe_name)
    real_dest = os.path.realpath(dest)
    real_base = os.path.realpath(BACKGROUNDS_DIR)
    if not real_dest.startswith(real_base + os.sep):
        raise HTTPException(400, "非法文件路径")
    with open(dest, "wb") as f:
        f.write(content)
    return {"success": True, "filename": safe_name}


@router.delete("/backgrounds/{filename}")
async def delete_background(filename: str):
    safe_name = _safe_filename(filename)
    if not safe_name:
        raise HTTPException(400, "非法文件名")
    fp = os.path.join(BACKGROUNDS_DIR, safe_name)
    real_fp = os.path.realpath(fp)
    real_base = os.path.realpath(BACKGROUNDS_DIR)
    if not real_fp.startswith(real_base + os.sep):
        raise HTTPException(400, "非法文件路径")
    if not os.path.isfile(fp):
        raise HTTPException(404, "文件不存在")
    os.remove(fp)
    return {"success": True, "deleted": safe_name}
