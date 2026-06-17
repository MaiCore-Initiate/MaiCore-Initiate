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
    ".py", ".cmd", ".bat", ".ps1", ".sh", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx",
    ".json", ".txt", ".jsonl", ".log", ".java", ".jar", ".toml", ".exe",
    ".yaml", ".xml",
}
# 视为二进制的后缀
BINARY_EXTENSIONS = {".jar", ".exe"}
CREATION_BLOCKED_EXTENSIONS = {".jar", ".exe"}
# 文件名合法字符：字母/数字/下划线/连字符/点/空格，长度 1-128
FILENAME_PATTERN = re.compile(r"^[A-Za-z0-9._\- ]{1,128}$")
# 路径段合法字符：与文件名同规则但不允许点结尾（避免 ".."、"." 等逃逸段）
SEGMENT_PATTERN = re.compile(r"^[A-Za-z0-9_\- ](?:\.[A-Za-z0-9_\- ])*$|^[A-Za-z0-9_\- ]{1,128}$")
# 子目录路径最大嵌套层数（不含项目根）。5 层 = "a/b/c/d/e/file.py"
MAX_DIR_DEPTH = 5
# 文本文件最大 5 MB
MAX_TEXT_FILE_SIZE = 5 * 1024 * 1024
# 二进制导入文件最大 200 MB
MAX_BINARY_FILE_SIZE = 200 * 1024 * 1024

PROJECT_ROOT = Path(__file__).parent.parent.parent.parent


def _normalize_relpath(value: str) -> str:
    """把任意输入的相对路径归一化为 `/` 分隔、不含首尾斜杠、不含 `.` / `..` 的形式。

    - 接受 `a\\b\\c` 也会被统一成 `a/b/c`
    - 空字符串返回空串
    - 若包含逃逸段（`..`、`.`、空段）抛 400
    """
    if value is None:
        return ""
    s = str(value).strip()
    if not s:
        return ""
    # 反斜杠统一成正斜杠
    s = s.replace("\\", "/")
    # 去掉首尾斜杠
    s = s.strip("/")
    if not s:
        return ""
    parts = s.split("/")
    for part in parts:
        if not part or part == "." or part == "..":
            raise HTTPException(400, f"非法的路径段: {value!r}")
    return "/".join(parts)


def _validate_relpath(value: str, *, allow_dir: bool = False, require_ext: bool = True) -> str:
    """校验并归一化相对路径。

    - 整体长度不超过 256
    - 拆分后的段数（含文件名）不超过 MAX_DIR_DEPTH + 1（即 6 段，意味着 5 层目录 + 1 个文件名）
    - 每段必须满足 SEGMENT_PATTERN
    - allow_dir=False 时，最后一段必须有允许的后缀（`require_ext=True`）；
      allow_dir=True 时，最后一段允许无后缀（视为目录名）
    """
    if not value or not value.strip():
        raise HTTPException(400, "路径不能为空")
    if len(value) > 256:
        raise HTTPException(400, f"路径过长（>256）: {value!r}")
    normalized = _normalize_relpath(value)
    parts = normalized.split("/")
    if len(parts) > MAX_DIR_DEPTH + 1:
        raise HTTPException(
            400,
            f"路径嵌套层数超过 {MAX_DIR_DEPTH}：{value!r}",
        )
    for part in parts:
        if not SEGMENT_PATTERN.match(part):
            raise HTTPException(400, f"路径段包含非法字符: {part!r}")
    if not allow_dir:
        # 文件名必须带允许的后缀
        ext = Path(parts[-1]).suffix.lower()
        if not ext or ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(400, f"不支持的文件类型: {ext or '<无后缀>'}")
    return normalized


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
        ".js": "javascript", ".mjs": "javascript", ".cjs": "javascript", ".jsx": "javascript",
        ".ts": "typescript", ".tsx": "typescript",
        ".json": "json", ".jsonl": "json",
        ".java": "java",
        ".toml": "ini",
        ".xml": "xml", ".yaml": "yaml", ".yml": "yaml",
        ".txt": "plaintext", ".log": "plaintext",
        ".jar": "plaintext", ".exe": "plaintext",
    }
    return table.get(ext, "plaintext")


def _validate_name(name: str) -> None:
    """校验文件名（不含子目录）。保持向后兼容。"""
    if not name or not FILENAME_PATTERN.match(name):
        raise HTTPException(400, f"非法文件名: {name!r}")
    ext = Path(name).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"不支持的文件类型: {ext}")


def _validate_creatable_name(name: str) -> None:
    _validate_name(name)
    ext = Path(name).suffix.lower()
    if ext in CREATION_BLOCKED_EXTENSIONS:
        raise HTTPException(400, f"不允许新建 {ext} 文件，请改用导入现有文件")


def _validate_relpath_file(relpath: str) -> str:
    """校验作为文件的相对路径（最多 5 层目录、最后一段是允许的文件名）。"""
    return _validate_relpath(relpath, allow_dir=False, require_ext=True)


def _validate_relpath_dir(relpath: str) -> str:
    """校验作为目录的相对路径（最多 5 层、最后一段允许无后缀）。"""
    return _validate_relpath(relpath, allow_dir=True, require_ext=False)


def _max_size_for_filename(name: str) -> int:
    return MAX_BINARY_FILE_SIZE if Path(name).suffix.lower() in BINARY_EXTENSIONS else MAX_TEXT_FILE_SIZE


def _max_size_label(size: int) -> str:
    if size >= 1024 * 1024:
        return f"{size // (1024 * 1024)}MB"
    if size >= 1024:
        return f"{size // 1024}KB"
    return f"{size}B"


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


def _safe_join(project_dir: Path, relpath: str) -> Path:
    """在 project_dir 下解析 relpath（支持子目录），拦截路径穿越。

    relpath 已经是 `_normalize_relpath` 归一化后的形式，调用方应先校验层数。
    """
    target = (project_dir / relpath).resolve()
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


def _build_meta(file_id: str, relpath: str, abs_path: Path, project_dir: Path) -> Dict[str, Any]:
    """构造文件元信息。`relpath` 必须是相对 project_dir 的正斜杠路径。"""
    stat = abs_path.stat()
    name = Path(relpath).name  # 始终取最后一段作为展示名
    return {
        "id": file_id,
        "name": name,
        "path": relpath,  # 形如 "version/JSON/version.json"
        "size": stat.st_size,
        "modifiedAt": datetime.utcfromtimestamp(stat.st_mtime).isoformat() + "Z",
        "binary": Path(name).suffix.lower() in BINARY_EXTENSIONS,
        "language": _language_for(name),
    }


def _reserved_project_names_from_project(project: Dict[str, Any]) -> set[str]:
    names: set[str] = set()
    mod_id = str(project.get("mod_id", "")).strip()
    if mod_id:
        names.add(f"{mod_id}.toml")
    cover_name = str(project.get("cover", "") or "").strip()
    if cover_name:
        names.add(cover_name)
    return names


def _file_meta_signature(item: Dict[str, Any]) -> tuple[Any, ...]:
    return (
        item.get("id"),
        item.get("name"),
        item.get("path"),
        item.get("size"),
        item.get("modifiedAt"),
        item.get("binary"),
        item.get("language"),
    )


def _sync_project_files(sequence: str) -> List[Dict[str, Any]]:
    """递归扫描 project_dir 下最多 MAX_DIR_DEPTH 层目录中的白名单文件。"""
    data = load_mod_index()
    if sequence not in data:
        raise HTTPException(404, f"工作台项目 '{sequence}' 未找到。")
    project = data[sequence]
    raw_path = str(project.get("path", "")).strip()
    if not raw_path:
        raise HTTPException(400, f"工作台项目 '{sequence}' 未配置 path。")
    project_dir = Path(raw_path)
    if not project_dir.is_absolute():
        project_dir = PROJECT_ROOT / raw_path
    project_dir.mkdir(parents=True, exist_ok=True)

    tracked = project.get("files", [])
    if not isinstance(tracked, list):
        tracked = []
    # 用 path 作为 key（多级目录下唯一）。兼容老数据：path 为空则退回 name
    tracked_by_path: Dict[str, Dict[str, Any]] = {}
    for item in tracked:
        if not isinstance(item, dict):
            continue
        rel = str(item.get("path", "")).strip()
        if not rel:
            rel = str(item.get("name", "")).strip()
        if rel:
            tracked_by_path[rel.replace("\\", "/").lstrip("/")] = item
    reserved_names = _reserved_project_names_from_project(project)
    synced: List[Dict[str, Any]] = []

    def visit(directory: Path, depth_remaining: int, prefix: str) -> None:
        try:
            children = sorted(directory.iterdir(), key=lambda item: item.name.lower())
        except OSError:
            return
        for entry in children:
            name = entry.name
            if entry.is_dir():
                if depth_remaining <= 0:
                    continue
                if not SEGMENT_PATTERN.match(name):
                    continue
                visit(entry, depth_remaining - 1, f"{prefix}{name}/")
                continue
            if not entry.is_file():
                continue
            # 顶层保留主 TOML 与封面，不当作导入文件
            if prefix == "" and name in reserved_names:
                continue
            if not FILENAME_PATTERN.match(name):
                continue
            ext = name.lower().split(".")[-1] if "." in name else ""
            ext = f".{ext}" if ext else ""
            if not ext or ext not in ALLOWED_EXTENSIONS:
                continue
            relpath = f"{prefix}{name}"
            tracked_item = tracked_by_path.get(relpath)
            file_id = (
                str(tracked_item.get("id"))
                if tracked_item and tracked_item.get("id")
                else f"file-{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}"
            )
            synced.append(_build_meta(file_id, relpath, entry, project_dir))

    visit(project_dir, MAX_DIR_DEPTH, "")

    tracked_signature = [_file_meta_signature(item) for item in tracked if isinstance(item, dict)]
    synced_signature = [_file_meta_signature(item) for item in synced]
    if tracked_signature != synced_signature:
        project["files"] = synced
        save_mod_index(data)
    return synced


def _suggest_name(parent_dir: Path, name: str, exclude: Optional[str] = None) -> str:
    """在 parent_dir 下按 `name (1).ext`、`name (2).ext` ...递增找空位。

    `name` 应是「相对于 parent_dir 的单段文件名」，不含路径分隔符。
    """
    if name != exclude and not (parent_dir / name).exists():
        return name
    stem = Path(name).stem
    suffix = Path(name).suffix
    idx = 1
    while True:
        candidate = f"{stem} ({idx}){suffix}"
        if candidate != exclude and not (parent_dir / candidate).exists():
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
    "/projects/{sequence}/files/sync",
    summary="同步模板项目目录中的白名单文件（递归扫描，最多 5 层）",
    response_model=List[FileMeta],
)
def sync_files(sequence: str):
    _ensure_project(sequence)
    return _sync_project_files(sequence)


@router.post(
    "/projects/{sequence}/files/check-name",
    summary="检测文件相对路径是否可用（支持子目录）",
    response_model=CheckNameResponse,
)
def check_name(sequence: str, payload: CheckNamePayload):
    _ensure_project(sequence)
    relpath = _validate_relpath_file(payload.name)
    project_dir = _project_dir(sequence)
    parent_dir = (project_dir / Path(relpath).parent).resolve()
    if not str(parent_dir).startswith(str(project_dir.resolve())):
        raise HTTPException(400, "非法文件路径")
    parent_dir.mkdir(parents=True, exist_ok=True)
    name = Path(relpath).name
    available = (relpath != (payload.exclude or "").replace("\\", "/").lstrip("/")) and not (parent_dir / name).exists()
    if available:
        return CheckNameResponse(available=True, suggestion=relpath)
    suggestion = _suggest_name(parent_dir, name, exclude=(payload.exclude or "").rsplit("/", 1)[-1] or None)
    suggestion_rel = (Path(relpath).parent / suggestion).as_posix() if Path(relpath).parent != Path(".") else suggestion
    return CheckNameResponse(available=False, suggestion=suggestion_rel)


@router.post(
    "/projects/{sequence}/files/upload",
    summary="上传文件（导入），支持子目录路径",
    response_model=FileMeta,
)
async def upload_file(
    sequence: str,
    file: UploadFile = File(...),
    path: str = Query(..., description="相对项目根的路径（可包含子目录，如 version/JSON/version.json）"),
    conflictResolution: Optional[str] = Query(None),
    fileId: Optional[str] = Query(None),
):
    _ensure_project(sequence)
    relpath = _validate_relpath_file(path)
    if conflictResolution and conflictResolution not in ("rename", "overwrite"):
        raise HTTPException(400, f"非法的 conflictResolution: {conflictResolution}")

    project_dir = _project_dir(sequence)
    parent_dir = (project_dir / Path(relpath).parent).resolve()
    if not str(parent_dir).startswith(str(project_dir.resolve())):
        raise HTTPException(400, "非法文件路径")
    parent_dir.mkdir(parents=True, exist_ok=True)
    name = Path(relpath).name
    target_path = parent_dir / name
    target_name = relpath

    if target_path.exists():
        if conflictResolution == "rename":
            new_name = _suggest_name(parent_dir, name)
            target_path = parent_dir / new_name
            target_name = (Path(relpath).parent / new_name).as_posix() if Path(relpath).parent != Path(".") else new_name
        elif conflictResolution != "overwrite":
            raise HTTPException(409, detail={
                "code": "name_conflict",
                "message": f"文件 '{relpath}' 已存在",
                "suggestion": (Path(relpath).parent / _suggest_name(parent_dir, name)).as_posix() if Path(relpath).parent != Path(".") else _suggest_name(parent_dir, name),
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
                max_size = _max_size_for_filename(name)
                if written > max_size:
                    raise HTTPException(413, f"文件超过 {_max_size_label(max_size)} 上限")
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
    files = [f for f in files if (f.get("path") or f.get("name")) != target_name]
    new_id = fileId or f"file-{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}"
    meta = _build_meta(new_id, target_name, target_path, project_dir)
    files.append(meta)
    _write_project_files(sequence, files)

    return meta


@router.post(
    "/projects/{sequence}/files/create",
    summary="新建空文件（支持子目录路径）",
    response_model=FileMeta,
)
def create_file(sequence: str, payload: CreateFilePayload):
    _ensure_project(sequence)
    relpath = _validate_relpath_file(payload.name)
    name = Path(relpath).name
    ext = Path(name).suffix.lower()
    if ext in CREATION_BLOCKED_EXTENSIONS:
        raise HTTPException(400, f"不允许新建 {ext} 文件，请改用导入现有文件")
    if payload.conflictResolution and payload.conflictResolution not in ("rename", "overwrite"):
        raise HTTPException(400, f"非法的 conflictResolution: {payload.conflictResolution}")
    if payload.content is not None and len(payload.content.encode("utf-8")) > MAX_TEXT_FILE_SIZE:
        raise HTTPException(413, f"内容超过 {_max_size_label(MAX_TEXT_FILE_SIZE)} 上限")

    project_dir = _project_dir(sequence)
    parent_dir = (project_dir / Path(relpath).parent).resolve()
    if not str(parent_dir).startswith(str(project_dir.resolve())):
        raise HTTPException(400, "非法文件路径")
    parent_dir.mkdir(parents=True, exist_ok=True)
    target_path = parent_dir / name
    target_name = relpath

    if target_path.exists():
        if payload.conflictResolution == "rename":
            new_name = _suggest_name(parent_dir, name)
            target_path = parent_dir / new_name
            target_name = (Path(relpath).parent / new_name).as_posix() if Path(relpath).parent != Path(".") else new_name
        elif payload.conflictResolution != "overwrite":
            raise HTTPException(409, detail={
                "code": "name_conflict",
                "message": f"文件 '{relpath}' 已存在",
                "suggestion": (Path(relpath).parent / _suggest_name(parent_dir, name)).as_posix() if Path(relpath).parent != Path(".") else _suggest_name(parent_dir, name),
            })

    try:
        if payload.content is None:
            target_path.touch()
        else:
            target_path.write_text(payload.content, encoding="utf-8")
    except OSError as exc:
        raise HTTPException(500, f"创建失败: {exc}") from exc

    files = _read_project_files(sequence)
    files = [f for f in files if (f.get("path") or f.get("name")) != target_name]
    new_id = payload.fileId or f"file-{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}"
    meta = _build_meta(new_id, target_name, target_path, project_dir)
    files.append(meta)
    _write_project_files(sequence, files)
    return meta


@router.get(
    "/projects/{sequence}/files/raw",
    summary="读取文件文本内容（path 可包含子目录）",
    response_class=PlainTextResponse,
)
def read_raw(sequence: str, path: str = Query(...)):
    _ensure_project(sequence)
    relpath = _validate_relpath_file(path)
    project_dir = _project_dir(sequence)
    target = _safe_join(project_dir, relpath)
    if not target.exists():
        raise HTTPException(404, f"文件 '{relpath}' 不存在")
    if Path(relpath).suffix.lower() in BINARY_EXTENSIONS:
        raise HTTPException(415, f"二进制文件不支持文本读取")
    size = target.stat().st_size
    if size > MAX_TEXT_FILE_SIZE:
        raise HTTPException(413, f"文件超过 {_max_size_label(MAX_TEXT_FILE_SIZE)} 上限")
    try:
        return target.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(415, f"文件不是有效的 UTF-8 文本") from exc


@router.get(
    "/projects/{sequence}/files/download",
    summary="下载文件（二进制，path 可包含子目录）",
)
def download_file(sequence: str, path: str = Query(...)):
    _ensure_project(sequence)
    relpath = _validate_relpath_file(path)
    project_dir = _project_dir(sequence)
    target = _safe_join(project_dir, relpath)
    if not target.exists():
        raise HTTPException(404, f"文件 '{relpath}' 不存在")
    return FileResponse(
        path=str(target),
        filename=Path(relpath).name,
        media_type="application/octet-stream",
    )


@router.put(
    "/projects/{sequence}/files",
    summary="写入文件文本内容（path 可包含子目录）",
    response_model=FileMeta,
)
def write_file(sequence: str, path: str = Query(...), payload: WriteFilePayload = None):
    _ensure_project(sequence)
    relpath = _validate_relpath_file(path)
    project_dir = _project_dir(sequence)
    target = _safe_join(project_dir, relpath)

    if payload is None:
        raise HTTPException(400, "缺少写入内容")
    if len(payload.content.encode("utf-8")) > MAX_TEXT_FILE_SIZE:
        raise HTTPException(413, f"内容超过 {_max_size_label(MAX_TEXT_FILE_SIZE)} 上限")

    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(payload.content, encoding="utf-8")
    files = _read_project_files(sequence)
    meta = next((f for f in files if (f.get("path") or f.get("name")) == relpath), None)
    if not meta:
        # 写入新文件，自动注册
        new_id = f"file-{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}"
        new_meta = _build_meta(new_id, relpath, target, project_dir)
        files.append(new_meta)
        _write_project_files(sequence, files)
        return new_meta
    new_meta = _build_meta(meta["id"], relpath, target, project_dir)
    files = [new_meta if f.get("id") == meta["id"] else f for f in files]
    _write_project_files(sequence, files)
    return new_meta


@router.patch(
    "/projects/{sequence}/files/rename",
    summary="重命名/移动文件（path → newPath，可跨子目录）",
    response_model=FileMeta,
)
def rename_file(sequence: str, payload: RenamePayload, path: Optional[str] = Query(None), newPath: Optional[str] = Query(None)):
    _ensure_project(sequence)
    src_rel = _validate_relpath_file(path or payload.name)
    dst_rel = _validate_relpath_file(newPath or payload.newName)
    project_dir = _project_dir(sequence)
    src = _safe_join(project_dir, src_rel)
    if not src.exists():
        raise HTTPException(404, f"文件 '{src_rel}' 不存在")

    dst_parent = (project_dir / Path(dst_rel).parent).resolve()
    if not str(dst_parent).startswith(str(project_dir.resolve())):
        raise HTTPException(400, "非法文件路径")
    dst_parent.mkdir(parents=True, exist_ok=True)
    dst = dst_parent / Path(dst_rel).name
    if dst.exists() and dst.resolve() != src.resolve():
        if payload.conflictResolution == "rename":
            new_name = _suggest_name(dst_parent, Path(dst_rel).name)
            dst = dst_parent / new_name
            dst_rel = (Path(dst_rel).parent / new_name).as_posix() if Path(dst_rel).parent != Path(".") else new_name
        elif payload.conflictResolution != "overwrite":
            raise HTTPException(409, detail={
                "code": "name_conflict",
                "message": f"文件 '{dst_rel}' 已存在",
                "suggestion": (Path(dst_rel).parent / _suggest_name(dst_parent, Path(dst_rel).name)).as_posix() if Path(dst_rel).parent != Path(".") else _suggest_name(dst_parent, Path(dst_rel).name),
            })

    if dst.resolve() != src.resolve():
        src.rename(dst)

    files = _read_project_files(sequence)
    new_meta: Optional[Dict[str, Any]] = None
    updated: List[Dict[str, Any]] = []
    for f in files:
        if (f.get("path") or f.get("name")) == src_rel:
            meta = _build_meta(f["id"], dst_rel, dst, project_dir)
            new_meta = meta
            updated.append(meta)
        else:
            updated.append(f)
    if new_meta is None:
        meta_id = f"file-{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}"
        new_meta = _build_meta(meta_id, dst_rel, dst, project_dir)
        updated.append(new_meta)
    _write_project_files(sequence, updated)
    return new_meta


@router.delete(
    "/projects/{sequence}/files",
    summary="删除文件（path 可包含子目录）",
)
def delete_file(sequence: str, path: str = Query(...)):
    _ensure_project(sequence)
    relpath = _validate_relpath_file(path)
    project_dir = _project_dir(sequence)
    target = _safe_join(project_dir, relpath)
    if target.exists():
        try:
            target.unlink()
        except OSError as exc:
            raise HTTPException(500, f"删除失败: {exc}") from exc
    files = [f for f in _read_project_files(sequence) if (f.get("path") or f.get("name")) != relpath]
    _write_project_files(sequence, files)
    return {"success": True, "path": relpath}


# ---------------- Folder Endpoints ----------------

class CreateFolderPayload(BaseModel):
    path: str


@router.post(
    "/projects/{sequence}/folders/create",
    summary="创建子目录（最多 5 层）",
)
def create_folder(sequence: str, payload: CreateFolderPayload):
    _ensure_project(sequence)
    relpath = _validate_relpath_dir(payload.path)
    if relpath in ("", "."):
        raise HTTPException(400, "目录名不能为空")
    project_dir = _project_dir(sequence)
    target = _safe_join(project_dir, relpath)
    if target.exists():
        raise HTTPException(409, f"目录 '{relpath}' 已存在")
    try:
        target.mkdir(parents=True, exist_ok=False)
    except OSError as exc:
        raise HTTPException(500, f"创建目录失败: {exc}") from exc
    return {"success": True, "path": relpath}


@router.post(
    "/projects/{sequence}/folders/remove",
    summary="删除子目录（仅当空目录或不存在文件块时成功）",
)
def remove_folder(sequence: str, payload: CreateFolderPayload):
    _ensure_project(sequence)
    relpath = _validate_relpath_dir(payload.path)
    if relpath in ("", "."):
        raise HTTPException(400, "不能删除项目根目录")
    project_dir = _project_dir(sequence)
    target = _safe_join(project_dir, relpath)
    if not target.exists():
        return {"success": True, "path": relpath, "existed": False}
    if not target.is_dir():
        raise HTTPException(400, f"'{relpath}' 不是目录")
    try:
        # 仅在目录为空时删除
        has_children = any(target.iterdir())
    except OSError as exc:
        raise HTTPException(500, f"读取目录失败: {exc}") from exc
    if has_children:
        raise HTTPException(409, f"目录 '{relpath}' 非空，请先删除其中文件")
    try:
        target.rmdir()
    except OSError as exc:
        raise HTTPException(500, f"删除目录失败: {exc}") from exc
    return {"success": True, "path": relpath}
