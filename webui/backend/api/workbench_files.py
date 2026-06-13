# -*- coding: utf-8 -*-
"""
工作台文件块 API

为 MaiCore-Start 工作台提供文件块（FileBlock）的后端支持。
- 元信息跟随 workbench project 走，存储在 config/MOD.json
- 文件本体落到 workbench project 目录下（与模板 TOML 同级）
"""
from __future__ import annotations

import re
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, PlainTextResponse
from pydantic import BaseModel

from .template_workbench import (
    load_mod_index,
    save_mod_index,
)

router = APIRouter()

# 允许的文件后缀
ALLOWED_EXTENSIONS = {
    ".py", ".cmd", ".bat", ".ps1", ".sh", ".js", ".ts",
    ".json", ".txt", ".jsonl", ".log", ".java", ".jar", ".toml", ".exe",
    ".xaml", ".xml",
}
# 视为二进制的后缀
BINARY_EXTENSIONS = {".jar", ".exe"}
# 文件名合法字符：字母/数字/下划线/连字符/点/空格，长度 1-128
FILENAME_PATTERN = re.compile(r"^[A-Za-z0-9._\- ]{1,128}$")
# 单文件最大 5 MB
MAX_FILE_SIZE = 5 * 1024 * 1024

PROJECT_ROOT = Path(__file__).parent.parent.parent.parent


# ---------------- Pydantic Models ----------------

class FileMeta(BaseModel):
    id: str
    name: str
    path: str
    size: int
    modifiedAt: str
    binary: bool
    language: str


class CheckNamePayload(BaseModel):
    name: str
    exclude: Optional[str] = None  # 排除某个旧名（rename 时用）


class CheckNameResponse(BaseModel):
    available: bool
    suggestion: str


class WriteFilePayload(BaseModel):
    content: str
    conflictResolution: Optional[str] = None  # "rename" | "overwrite" | None


class RenamePayload(BaseModel):
    newName: str
    conflictResolution: Optional[str] = None


class CreateFilePayload(BaseModel):
    name: str
    content: Optional[str] = None
    conflictResolution: Optional[str] = None  # "rename" | "overwrite" | None
    fileId: Optional[str] = None


# ---------------- Helpers ----------------

def _language_for(name: str) -> str:
    ext = Path(name).suffix.lower()
    table = {
        ".py": "python",
        ".ps1": "powershell", ".cmd": "powershell", ".bat": "powershell",
        ".sh": "shell",
        ".js": "javascript",
        ".ts": "typescript",
        ".json": "json", ".jsonl": "json",
        ".java": "java",
        ".toml": "ini",
        ".xml": "xml", ".xaml": "xml",
        ".txt": "plaintext", ".log": "plaintext",
        ".jar": "plaintext", ".exe": "plaintext",
    }
    return table.get(ext, "plaintext")


def _validate_name(name: str) -> None:
    if not name or not FILENAME_PATTERN.match(name):
        raise HTTPException(400, f"非法文件名: {name!r}")
    ext = Path(name).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"不支持的文件类型: {ext}")


def _ensure_project(sequence: str) -> Dict[str, Any]:
    data = load_mod_index()
    if sequence not in data:
        raise HTTPException(404, f"工作台项目 '{sequence}' 未找到。")
    return data[sequence]


def _project_dir(sequence: str) -> Path:
    """根据 project.path 解析出工作台项目目录（与模板 TOML 同级）。"""
    project = _ensure_project(sequence)
    raw_path = str(project.get("path", "")).strip()
    if not raw_path:
        raise HTTPException(400, f"工作台项目 '{sequence}' 未配置 path。")
    project_dir = Path(raw_path)
    if not project_dir.is_absolute():
        project_dir = PROJECT_ROOT / raw_path
    project_dir.mkdir(parents=True, exist_ok=True)
    return project_dir


def _safe_join(project_dir: Path, filename: str) -> Path:
    """在 project_dir 下解析 filename，拦截路径穿越。"""
    target = (project_dir / filename).resolve()
    if not str(target).startswith(str(project_dir.resolve())):
        raise HTTPException(400, "非法文件路径")
    return target


def _read_project_files(sequence: str) -> List[Dict[str, Any]]:
    data = load_mod_index()
    if sequence not in data:
        return []
    files = data[sequence].get("files", [])
    return files if isinstance(files, list) else []


def _write_project_files(sequence: str, files: List[Dict[str, Any]]) -> None:
    data = load_mod_index()
    if sequence not in data:
        raise HTTPException(404, f"工作台项目 '{sequence}' 未找到。")
    data[sequence]["files"] = files
    save_mod_index(data)


def _build_meta(file_id: str, name: str, abs_path: Path, project_dir: Path) -> Dict[str, Any]:
    stat = abs_path.stat()
    try:
        rel = abs_path.relative_to(project_dir)
    except ValueError:
        rel = abs_path
    return {
        "id": file_id,
        "name": name,
        "path": str(rel),
        "size": stat.st_size,
        "modifiedAt": datetime.utcfromtimestamp(stat.st_mtime).isoformat() + "Z",
        "binary": Path(name).suffix.lower() in BINARY_EXTENSIONS,
        "language": _language_for(name),
    }


def _suggest_name(project_dir: Path, name: str, exclude: Optional[str] = None) -> str:
    """按 `name (1).ext`、`name (2).ext` ...递增找空位。"""
    if name != exclude and not (project_dir / name).exists():
        return name
    stem = Path(name).stem
    suffix = Path(name).suffix
    idx = 1
    while True:
        candidate = f"{stem} ({idx}){suffix}"
        if candidate != exclude and not (project_dir / candidate).exists():
            return candidate
        idx += 1
        if idx > 9999:
            raise HTTPException(500, "无法找到可用文件名")


# ---------------- Endpoints ----------------

@router.get(
    "/projects/{sequence}/files",
    summary="列出项目所有文件元信息",
    response_model=List[FileMeta],
)
def list_files(sequence: str):
    _ensure_project(sequence)
    return _read_project_files(sequence)


@router.post(
    "/projects/{sequence}/files/check-name",
    summary="检测文件名是否可用",
    response_model=CheckNameResponse,
)
def check_name(sequence: str, payload: CheckNamePayload):
    _ensure_project(sequence)
    _validate_name(payload.name)
    project_dir = _project_dir(sequence)
    available = (payload.name != payload.exclude) and not (project_dir / payload.name).exists()
    if available:
        return CheckNameResponse(available=True, suggestion=payload.name)
    suggestion = _suggest_name(project_dir, payload.name, payload.exclude)
    return CheckNameResponse(available=False, suggestion=suggestion)


@router.post(
    "/projects/{sequence}/files/upload",
    summary="上传文件（导入）",
    response_model=FileMeta,
)
async def upload_file(
    sequence: str,
    file: UploadFile = File(...),
    filename: str = Query(...),
    conflictResolution: Optional[str] = Query(None),
    fileId: Optional[str] = Query(None),
):
    _ensure_project(sequence)
    _validate_name(filename)
    if conflictResolution and conflictResolution not in ("rename", "overwrite"):
        raise HTTPException(400, f"非法的 conflictResolution: {conflictResolution}")

    project_dir = _project_dir(sequence)
    target_name = filename
    target_path = _safe_join(project_dir, target_name)

    if target_path.exists():
        if conflictResolution == "rename":
            target_name = _suggest_name(project_dir, filename)
            target_path = _safe_join(project_dir, target_name)
        elif conflictResolution != "overwrite":
            raise HTTPException(409, detail={
                "code": "name_conflict",
                "message": f"文件 '{filename}' 已存在",
                "suggestion": _suggest_name(project_dir, filename),
            })

    written = 0
    chunk_size = 1024 * 1024  # 1MB
    try:
        with open(target_path, "wb") as f:
            while True:
                chunk = await file.read(chunk_size)
                if not chunk:
                    break
                written += len(chunk)
                if written > MAX_FILE_SIZE:
                    raise HTTPException(413, f"文件超过 5MB 上限")
                f.write(chunk)
    except HTTPException:
        if target_path.exists() and target_path.stat().st_size == 0:
            try:
                target_path.unlink()
            except OSError:
                pass
        raise
    except Exception as exc:
        if target_path.exists():
            try:
                target_path.unlink()
            except OSError:
                pass
        raise HTTPException(500, f"写入失败: {exc}") from exc

    files = _read_project_files(sequence)
    files = [f for f in files if f.get("name") != target_name]
    new_id = fileId or f"file-{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}"
    meta = _build_meta(new_id, target_name, target_path, project_dir)
    files.append(meta)
    _write_project_files(sequence, files)

    return meta


@router.post(
    "/projects/{sequence}/files/create",
    summary="新建空文件（可在工作台直接创建）",
    response_model=FileMeta,
)
def create_file(sequence: str, payload: CreateFilePayload):
    _ensure_project(sequence)
    _validate_name(payload.name)
    if payload.conflictResolution and payload.conflictResolution not in ("rename", "overwrite"):
        raise HTTPException(400, f"非法的 conflictResolution: {payload.conflictResolution}")
    if payload.content is not None and len(payload.content.encode("utf-8")) > MAX_FILE_SIZE:
        raise HTTPException(413, f"内容超过 5MB 上限")

    project_dir = _project_dir(sequence)
    target_name = payload.name
    target_path = _safe_join(project_dir, target_name)

    if target_path.exists():
        if payload.conflictResolution == "rename":
            target_name = _suggest_name(project_dir, payload.name)
            target_path = _safe_join(project_dir, target_name)
        elif payload.conflictResolution != "overwrite":
            raise HTTPException(409, detail={
                "code": "name_conflict",
                "message": f"文件 '{payload.name}' 已存在",
                "suggestion": _suggest_name(project_dir, payload.name),
            })

    try:
        if payload.content is None:
            target_path.touch()
        else:
            target_path.write_text(payload.content, encoding="utf-8")
    except OSError as exc:
        raise HTTPException(500, f"创建失败: {exc}") from exc

    files = _read_project_files(sequence)
    files = [f for f in files if f.get("name") != target_name]
    new_id = payload.fileId or f"file-{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}"
    meta = _build_meta(new_id, target_name, target_path, project_dir)
    files.append(meta)
    _write_project_files(sequence, files)
    return meta


@router.get(
    "/projects/{sequence}/files/{filename}/raw",
    summary="读取文件文本内容",
    response_class=PlainTextResponse,
)
def read_raw(sequence: str, filename: str):
    _ensure_project(sequence)
    _validate_name(filename)
    project_dir = _project_dir(sequence)
    target = _safe_join(project_dir, filename)
    if not target.exists():
        raise HTTPException(404, f"文件 '{filename}' 不存在")
    if Path(filename).suffix.lower() in BINARY_EXTENSIONS:
        raise HTTPException(415, f"二进制文件不支持文本读取")
    size = target.stat().st_size
    if size > MAX_FILE_SIZE:
        raise HTTPException(413, f"文件超过 5MB 上限")
    try:
        return target.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(415, f"文件不是有效的 UTF-8 文本") from exc


@router.get(
    "/projects/{sequence}/files/{filename}/download",
    summary="下载文件（二进制）",
)
def download_file(sequence: str, filename: str):
    _ensure_project(sequence)
    _validate_name(filename)
    project_dir = _project_dir(sequence)
    target = _safe_join(project_dir, filename)
    if not target.exists():
        raise HTTPException(404, f"文件 '{filename}' 不存在")
    return FileResponse(
        path=str(target),
        filename=filename,
        media_type="application/octet-stream",
    )


@router.put(
    "/projects/{sequence}/files/{filename}",
    summary="写入文件文本内容",
    response_model=FileMeta,
)
def write_file(sequence: str, filename: str, payload: WriteFilePayload):
    _ensure_project(sequence)
    _validate_name(filename)
    project_dir = _project_dir(sequence)
    target = _safe_join(project_dir, filename)

    if len(payload.content.encode("utf-8")) > MAX_FILE_SIZE:
        raise HTTPException(413, f"内容超过 5MB 上限")

    target.write_text(payload.content, encoding="utf-8")
    files = _read_project_files(sequence)
    meta = next((f for f in files if f.get("name") == filename), None)
    if not meta:
        raise HTTPException(404, f"文件 '{filename}' 在元信息中不存在")
    new_meta = _build_meta(meta["id"], filename, target, project_dir)
    files = [new_meta if f.get("id") == meta["id"] else f for f in files]
    _write_project_files(sequence, files)
    return new_meta


@router.patch(
    "/projects/{sequence}/files/{filename}/rename",
    summary="重命名文件",
    response_model=FileMeta,
)
def rename_file(sequence: str, filename: str, payload: RenamePayload):
    _ensure_project(sequence)
    _validate_name(filename)
    _validate_name(payload.newName)
    project_dir = _project_dir(sequence)
    src = _safe_join(project_dir, filename)
    if not src.exists():
        raise HTTPException(404, f"文件 '{filename}' 不存在")

    target_name = payload.newName
    target = _safe_join(project_dir, target_name)
    if target.exists() and target_name != filename:
        if payload.conflictResolution == "rename":
            target_name = _suggest_name(project_dir, payload.newName, exclude=filename)
            target = _safe_join(project_dir, target_name)
        elif payload.conflictResolution != "overwrite":
            raise HTTPException(409, detail={
                "code": "name_conflict",
                "message": f"文件 '{payload.newName}' 已存在",
                "suggestion": _suggest_name(project_dir, payload.newName, exclude=filename),
            })

    if target_name != filename:
        src.rename(target)

    files = _read_project_files(sequence)
    updated: List[Dict[str, Any]] = []
    new_meta: Optional[Dict[str, Any]] = None
    for f in files:
        if f.get("name") == filename:
            meta = _build_meta(f["id"], target_name, target, project_dir)
            new_meta = meta
            updated.append(meta)
        else:
            updated.append(f)
    if new_meta is None:
        meta_id = f"file-{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}"
        new_meta = _build_meta(meta_id, target_name, target, project_dir)
        updated.append(new_meta)
    _write_project_files(sequence, updated)
    return new_meta


@router.delete(
    "/projects/{sequence}/files/{filename}",
    summary="删除文件",
)
def delete_file(sequence: str, filename: str):
    _ensure_project(sequence)
    _validate_name(filename)
    project_dir = _project_dir(sequence)
    target = _safe_join(project_dir, filename)
    if target.exists():
        try:
            target.unlink()
        except OSError as exc:
            raise HTTPException(500, f"删除失败: {exc}") from exc
    files = [f for f in _read_project_files(sequence) if f.get("name") != filename]
    _write_project_files(sequence, files)
    return {"success": True, "name": filename}
