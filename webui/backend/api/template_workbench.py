import base64
import binascii
import json
import re
import secrets
import shutil
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

router = APIRouter()

PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
CONFIG_FILE_PATH = Path("config") / "MOD.json"
TRASH_ROOT = PROJECT_ROOT / "data" / "template_workbench_trash"
TRASH_ITEMS_DIR = TRASH_ROOT / "items"
TRASH_INDEX_PATH = TRASH_ROOT / "index.json"
TRASH_RETENTION_DAYS = 30

MOD_ID_PATTERN = re.compile(r"^[A-Za-z0-9_\-\.]{1,128}$")
COVER_ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp"}
COVER_MAX_BYTES = 5 * 1024 * 1024
TOML_STRING_ESCAPE = re.compile(r'["\\\b\f\n\r\t]')
TOML_STRING_ESCAPE_REPL = {
    "\\": "\\\\",
    '"': '\\"',
    "\b": "\\b",
    "\f": "\\f",
    "\n": "\\n",
    "\r": "\\r",
    "\t": "\\t",
}

# 新建项目时附加文件路径相关限制（与 workbench_files.py 保持一致）
EXTRA_FILE_ALLOWED_EXTENSIONS = {
    ".py", ".cmd", ".bat", ".ps1", ".sh", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx",
    ".json", ".txt", ".jsonl", ".log", ".java", ".jar", ".toml", ".exe",
    ".yaml", ".xml",
}
EXTRA_FILE_BINARY_EXTENSIONS = {".jar", ".exe"}
EXTRA_FILE_MAX_TEXT_BYTES = 5 * 1024 * 1024
EXTRA_FILE_MAX_BINARY_BYTES = 200 * 1024 * 1024
EXTRA_FILE_SEGMENT_PATTERN = re.compile(r"^[A-Za-z0-9._\- ]{1,128}$")
EXTRA_FILE_MAX_DIR_DEPTH = 5


class WorkbenchProject(BaseModel):
    sequence: str
    mod_name: str
    path: str
    mod_id: str = ""
    description: str = ""
    author: str = ""
    cover: Optional[str] = None
    directories: List[str] = []
    files: List[Dict[str, Any]] = []
    force_folder: Optional[bool] = None
    display_mode: str = "card"


class CreateWorkbenchProjectPayload(BaseModel):
    base_path: str
    mod_name: str
    mod_id: str
    description: str = ""
    author: str
    cover_data_url: Optional[str] = None
    conflict_resolution: Optional[str] = None  # "rename" | "overwrite"
    sequence: Optional[str] = None


class UpdateProjectPayload(BaseModel):
    mod_name: Optional[str] = None
    description: Optional[str] = None
    cover_data_url: Optional[str] = None
    cover_clear: Optional[bool] = None


class SetDisplayModePayload(BaseModel):
    mode: str  # "auto" | "folder" | "card"


class CheckProjectPathPayload(BaseModel):
    base_path: str
    mod_id: str
    exclude: Optional[str] = None


class CheckProjectPathResponse(BaseModel):
    available: bool
    suggestion: str
    reason: Optional[str] = None


class SaveWorkbenchStatePayload(BaseModel):
    meta: Dict[str, Any]
    visible_blocks: Dict[str, Any]
    canvas_state: Dict[str, Any] = Field(default_factory=dict)
    toml_content: str


# ---------------- Helpers ----------------

def load_mod_index() -> Dict[str, Dict[str, Any]]:
    try:
        with CONFIG_FILE_PATH.open("r", encoding="utf-8") as file:
            data = json.load(file)
            return data if isinstance(data, dict) else {}
    except FileNotFoundError:
        return {}
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"读取 MOD.json 失败: {exc}") from exc


def save_mod_index(data: Dict[str, Dict[str, Any]]) -> None:
    try:
        CONFIG_FILE_PATH.parent.mkdir(parents=True, exist_ok=True)
        with CONFIG_FILE_PATH.open("w", encoding="utf-8") as file:
            json.dump(data, file, ensure_ascii=False, indent=4)
            file.write("\n")
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"保存 MOD.json 失败: {exc}") from exc


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _utc_iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _parse_utc_iso(value: str) -> datetime:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return _utc_now()


def _read_trash_index(*, cleanup: bool = True) -> List[Dict[str, Any]]:
    try:
        with TRASH_INDEX_PATH.open("r", encoding="utf-8") as file:
            data = json.load(file)
    except FileNotFoundError:
        return []
    except json.JSONDecodeError as exc:
        raise HTTPException(500, f"读取回收站索引失败: {exc}") from exc
    entries = data if isinstance(data, list) else []
    normalized = [entry for entry in entries if isinstance(entry, dict)]
    if cleanup:
        return _cleanup_expired_trash_entries(normalized)
    return normalized


def _write_trash_index(entries: List[Dict[str, Any]]) -> None:
    try:
        TRASH_ROOT.mkdir(parents=True, exist_ok=True)
        with TRASH_INDEX_PATH.open("w", encoding="utf-8") as file:
            json.dump(entries, file, ensure_ascii=False, indent=4)
            file.write("\n")
    except OSError as exc:
        raise HTTPException(500, f"保存回收站索引失败: {exc}") from exc


def _cleanup_expired_trash_entries(entries: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    now = _utc_now()
    kept: List[Dict[str, Any]] = []
    changed = False
    for entry in entries:
        expires_at = str(entry.get("expiresAt") or "")
        if expires_at and _parse_utc_iso(expires_at) <= now:
            _remove_trash_payload(str(entry.get("id") or ""))
            changed = True
            continue
        kept.append(entry)
    if changed:
        _write_trash_index(kept)
    return kept


def _remove_trash_payload(trash_id: str) -> None:
    if not trash_id:
        return
    target = (TRASH_ITEMS_DIR / trash_id).resolve()
    if not str(target).startswith(str(TRASH_ITEMS_DIR.resolve())):
        return
    if target.exists():
        shutil.rmtree(target, ignore_errors=True)


def _make_trash_id() -> str:
    return f"{_utc_now().strftime('%Y%m%d%H%M%S%f')}-{secrets.token_hex(6)}"


def _move_to_trash(source: Path, trash_id: str) -> Optional[Path]:
    if not source.exists():
        return None
    payload_root = TRASH_ITEMS_DIR / trash_id
    payload_root.mkdir(parents=True, exist_ok=False)
    destination = payload_root / "payload"
    try:
        shutil.move(str(source), str(destination))
    except OSError as exc:
        shutil.rmtree(payload_root, ignore_errors=True)
        raise HTTPException(500, f"移入回收站失败: {exc}") from exc
    return destination


def _create_trash_entry(kind: str, name: str, source: Path, metadata: Dict[str, Any]) -> Dict[str, Any]:
    entries = _read_trash_index()
    trash_id = _make_trash_id()
    payload_path = _move_to_trash(source, trash_id)
    now = _utc_now()
    entry = {
        "id": trash_id,
        "kind": kind,
        "name": name,
        "deletedAt": _utc_iso(now),
        "expiresAt": _utc_iso(now + timedelta(days=TRASH_RETENTION_DAYS)),
        "payloadExists": payload_path is not None,
        "metadata": metadata,
    }
    entries.append(entry)
    _write_trash_index(entries)
    return entry


def _trash_payload_path(trash_id: str) -> Path:
    target = (TRASH_ITEMS_DIR / trash_id / "payload").resolve()
    if not str(target).startswith(str(TRASH_ITEMS_DIR.resolve())):
        raise HTTPException(400, "非法回收站记录")
    return target


def _drop_trash_entry(trash_id: str) -> None:
    entries = _read_trash_index()
    _write_trash_index([entry for entry in entries if entry.get("id") != trash_id])
    _remove_trash_payload(trash_id)


def _resolve_project_path_from_item(item: Dict[str, Any]) -> Path:
    raw_path = str(item.get("path", "")).strip()
    if not raw_path:
        raise HTTPException(400, "项目未配置 path")
    path = Path(raw_path)
    return path if path.is_absolute() else PROJECT_ROOT / raw_path


def _restore_project_from_trash(entry: Dict[str, Any]) -> Dict[str, Any]:
    metadata = entry.get("metadata") if isinstance(entry.get("metadata"), dict) else {}
    project = metadata.get("project") if isinstance(metadata.get("project"), dict) else {}
    sequence = str(metadata.get("sequence") or "").strip()
    if not sequence or not project:
        raise HTTPException(400, "回收站项目元数据不完整")
    data = load_mod_index()
    if sequence in data:
        raise HTTPException(409, f"项目 sequence '{sequence}' 已存在，无法恢复")
    target = _resolve_project_path_from_item(project)
    if target.exists():
        raise HTTPException(409, f"项目目录已存在：{target}")
    payload = _trash_payload_path(str(entry.get("id")))
    if not payload.exists():
        raise HTTPException(404, "回收站项目文件不存在")
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(payload), str(target))
    except OSError as exc:
        raise HTTPException(500, f"恢复项目失败: {exc}") from exc
    data[sequence] = project
    save_mod_index(data)
    _drop_trash_entry(str(entry.get("id")))
    return to_project(sequence, project).model_dump()


def _restore_file_from_trash(entry: Dict[str, Any]) -> Dict[str, Any]:
    metadata = entry.get("metadata") if isinstance(entry.get("metadata"), dict) else {}
    sequence = str(metadata.get("sequence") or "").strip()
    relpath = str(metadata.get("path") or "").strip().replace("\\", "/").strip("/")
    file_meta = metadata.get("file") if isinstance(metadata.get("file"), dict) else {}
    if not sequence or not relpath or not file_meta:
        raise HTTPException(400, "回收站文件元数据不完整")
    data = load_mod_index()
    if sequence not in data:
        raise HTTPException(404, f"工作台项目 '{sequence}' 未找到，无法恢复文件")
    project_dir = _resolve_project_path(sequence)
    target = (project_dir / relpath).resolve()
    if not str(target).startswith(str(project_dir.resolve())):
        raise HTTPException(400, "非法文件恢复路径")
    if target.exists():
        raise HTTPException(409, f"文件已存在：{relpath}")
    payload = _trash_payload_path(str(entry.get("id")))
    if not payload.exists():
        raise HTTPException(404, "回收站文件不存在")
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(payload), str(target))
    except OSError as exc:
        raise HTTPException(500, f"恢复文件失败: {exc}") from exc
    files = data[sequence].get("files", [])
    if not isinstance(files, list):
        files = []
    files = [item for item in files if (item.get("path") or item.get("name")) != relpath and item.get("id") != file_meta.get("id")]
    files.append(file_meta)
    directories = data[sequence].get("directories", [])
    if not isinstance(directories, list):
        directories = []
    directories = sorted(set(directories + _trash_directory_chain_for_file(relpath)))
    _restore_file_import_refs(data[sequence], [file_meta])
    data[sequence]["files"] = files
    data[sequence]["directories"] = directories
    save_mod_index(data)
    _drop_trash_entry(str(entry.get("id")))
    return file_meta


def _restore_folder_from_trash(entry: Dict[str, Any]) -> Dict[str, Any]:
    metadata = entry.get("metadata") if isinstance(entry.get("metadata"), dict) else {}
    sequence = str(metadata.get("sequence") or "").strip()
    relpath = str(metadata.get("path") or "").strip().replace("\\", "/").strip("/")
    if not sequence or not relpath:
        raise HTTPException(400, "回收站文件夹元数据不完整")
    data = load_mod_index()
    if sequence not in data:
        raise HTTPException(404, f"工作台项目 '{sequence}' 未找到，无法恢复文件夹")
    project_dir = _resolve_project_path(sequence)
    target = (project_dir / relpath).resolve()
    if not str(target).startswith(str(project_dir.resolve())):
        raise HTTPException(400, "非法文件夹恢复路径")
    if target.exists():
        raise HTTPException(409, f"文件夹已存在：{relpath}")
    payload = _trash_payload_path(str(entry.get("id")))
    if not payload.exists():
        raise HTTPException(404, "回收站文件夹不存在")
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(payload), str(target))
    except OSError as exc:
        raise HTTPException(500, f"恢复文件夹失败: {exc}") from exc
    restored_files = metadata.get("files") if isinstance(metadata.get("files"), list) else []
    restored_dirs = metadata.get("directories") if isinstance(metadata.get("directories"), list) else []
    current_files = data[sequence].get("files", [])
    if not isinstance(current_files, list):
        current_files = []
    restored_paths = {
        str(item.get("path") or item.get("name") or "").replace("\\", "/").strip("/")
        for item in restored_files
        if isinstance(item, dict)
    }
    current_files = [
        item for item in current_files
        if str(item.get("path") or item.get("name") or "").replace("\\", "/").strip("/") not in restored_paths
    ]
    current_files.extend(item for item in restored_files if isinstance(item, dict))
    current_dirs = data[sequence].get("directories", [])
    if not isinstance(current_dirs, list):
        current_dirs = []
    _restore_file_import_refs(data[sequence], [item for item in restored_files if isinstance(item, dict)])
    data[sequence]["files"] = current_files
    data[sequence]["directories"] = sorted(set(current_dirs + restored_dirs + _trash_directory_chain_for_dir(relpath)))
    save_mod_index(data)
    _drop_trash_entry(str(entry.get("id")))
    return {"success": True, "sequence": sequence, "path": relpath}


def _trash_directory_chain_for_file(relpath: str) -> List[str]:
    parent = Path(relpath).parent.as_posix()
    if parent in ("", "."):
        return []
    return _trash_directory_chain_for_dir(parent)


def _trash_directory_chain_for_dir(relpath: str) -> List[str]:
    normalized = relpath.replace("\\", "/").strip("/")
    if not normalized:
        return []
    current = ""
    chain: List[str] = []
    for part in normalized.split("/"):
        if not part:
            continue
        current = f"{current}/{part}" if current else part
        chain.append(current)
    return chain


def _trash_file_ref_keys(file_meta: Dict[str, Any]) -> set[str]:
    keys: set[str] = set()
    for key in ("path", "name"):
        value = str(file_meta.get(key) or "").replace("\\", "/").strip("/")
        if value:
            keys.add(value)
    return keys


def _remove_file_import_refs(project: Dict[str, Any], file_metas: List[Dict[str, Any]]) -> None:
    workbench_meta = project.get("workbench_meta")
    if not isinstance(workbench_meta, dict):
        return
    file_import_list = workbench_meta.get("fileImportList")
    if not isinstance(file_import_list, list):
        return
    removed_refs: set[str] = set()
    for file_meta in file_metas:
        if isinstance(file_meta, dict):
            removed_refs.update(_trash_file_ref_keys(file_meta))
    if not removed_refs:
        return
    workbench_meta["fileImportList"] = [
        item for item in file_import_list
        if str(item).replace("\\", "/").strip("/") not in removed_refs
    ]


def _restore_file_import_refs(project: Dict[str, Any], file_metas: List[Dict[str, Any]]) -> None:
    workbench_meta = project.get("workbench_meta")
    if not isinstance(workbench_meta, dict):
        workbench_meta = {}
        project["workbench_meta"] = workbench_meta
    current = workbench_meta.get("fileImportList")
    if not isinstance(current, list):
        current = []
    refs = list(current)
    seen = {str(item).replace("\\", "/").strip("/") for item in refs}
    for file_meta in file_metas:
        if not isinstance(file_meta, dict):
            continue
        path = str(file_meta.get("path") or file_meta.get("name") or "").replace("\\", "/").strip("/")
        if path and path not in seen:
            refs.append(path)
            seen.add(path)
    workbench_meta["fileImportList"] = refs


def generate_sequence(existing: Dict[str, Dict[str, Any]]) -> str:
    while True:
        sequence = secrets.token_hex(32)
        if sequence not in existing:
            return sequence


def to_project(sequence: str, data: Dict[str, Any]) -> WorkbenchProject:
    files = data.get("files", [])
    directories = data.get("directories", [])
    cover = data.get("cover")
    force_folder = data.get("force_folder")
    if force_folder is True:
        display_mode = "folder"
    elif force_folder is False:
        display_mode = "card"
    else:
        display_mode = "folder" if (len(files) > 0 or len(directories) > 0 or cover) else "card"
    return WorkbenchProject(
        sequence=sequence,
        mod_name=str(data.get("mod_name", "")),
        path=str(data.get("path", "")),
        mod_id=str(data.get("mod_id", "")),
        description=str(data.get("description", "")),
        author=str(data.get("author", "")),
        cover=cover,
        directories=directories if isinstance(directories, list) else [],
        files=files if isinstance(files, list) else [],
        force_folder=force_folder,
        display_mode=display_mode,
    )


def _validate_mod_id(mod_id: str) -> None:
    if not mod_id or not MOD_ID_PATTERN.match(mod_id):
        raise HTTPException(400, f"非法的 mod_id: {mod_id!r}（仅允许字母/数字/下划线/连字符/点，1-128 字符）")


def _validate_base_path(base_path: str) -> Path:
    if not base_path:
        raise HTTPException(400, "缺少基础路径")
    p = Path(base_path)
    if not p.is_absolute():
        raise HTTPException(400, f"基础路径必须是绝对路径：{base_path!r}")
    if p.exists() and not p.is_dir():
        raise HTTPException(400, f"基础路径不是目录：{base_path!r}")
    if not p.exists():
        # 允许父目录存在但当前不存在，后端会 mkdir
        parent = p.parent
        if not parent.exists() or not parent.is_dir():
            raise HTTPException(400, f"父目录不存在：{parent}")
    # 检查可写（创建测试文件）
    try:
        p.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise HTTPException(400, f"基础路径不可写：{exc}") from exc
    return p


def _suggest_mod_id(base: Path, mod_id: str, exclude: Optional[str] = None) -> str:
    """按 `mod_id (1)`、`mod_id (2)` ...递增找空位。exclude 是正在被 rename 的旧目录（避免命中自己）。"""
    if mod_id != exclude and not (base / mod_id).exists():
        return mod_id
    idx = 1
    while True:
        candidate = f"{mod_id} ({idx})"
        if candidate != exclude and not (base / candidate).exists():
            return candidate
        idx += 1
        if idx > 9999:
            raise HTTPException(500, "无法找到可用 mod_id")


def _toml_escape(value: str) -> str:
    return TOML_STRING_ESCAPE.sub(lambda m: TOML_STRING_ESCAPE_REPL[m.group(0)], value)


def _toml_basic_string(value: str) -> str:
    return f'"{_toml_escape(value)}"'


def _render_mod_info_toml(mod_id: str, mod_name: str, description: str, author: str, cover: Optional[str]) -> str:
    lines: List[str] = ["[MODINFO]"]
    lines.append(f"author = {_toml_basic_string(author)}")
    lines.append(f"mod_id = {_toml_basic_string(mod_id)}")
    lines.append(f"mod_name = {_toml_basic_string(mod_name)}")
    if description:
        lines.append(f"description = {_toml_basic_string(description)}")
    if cover:
        lines.append(f"cover = {_toml_basic_string(cover)}")
    return "\n".join(lines) + "\n"


def _normalize_extra_relpath(value: str) -> str:
    """归一化附加文件相对路径。"""
    if value is None:
        return ""
    s = str(value).strip()
    if not s:
        return ""
    s = s.replace("\\", "/").strip("/")
    if not s:
        return ""
    parts = s.split("/")
    for part in parts:
        if not part or part == "." or part == "..":
            raise HTTPException(400, f"非法的附加文件路径: {value!r}")
    return "/".join(parts)


def _validate_extra_relpath(value: str) -> str:
    """校验附加文件相对路径（最多 5 层目录、最后一段必须带允许的后缀）。"""
    if not value or not value.strip():
        raise HTTPException(400, "附加文件路径不能为空")
    if len(value) > 256:
        raise HTTPException(400, f"附加文件路径过长（>256）: {value!r}")
    normalized = _normalize_extra_relpath(value)
    parts = normalized.split("/")
    if len(parts) > EXTRA_FILE_MAX_DIR_DEPTH + 1:
        raise HTTPException(
            400,
            f"附加文件路径嵌套层数超过 {EXTRA_FILE_MAX_DIR_DEPTH}：{value!r}",
        )
    for part in parts:
        if not EXTRA_FILE_SEGMENT_PATTERN.match(part):
            raise HTTPException(400, f"附加文件路径段包含非法字符: {part!r}")
    ext = Path(parts[-1]).suffix.lower()
    if not ext or ext not in EXTRA_FILE_ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"不支持的附加文件类型: {ext or '<无后缀>'}")
    return normalized


def _safe_join_inside(parent: Path, relpath: str) -> Path:
    """在 parent 下解析 relpath，拦截路径穿越。"""
    target = (parent / relpath).resolve()
    if not str(target).startswith(str(parent.resolve())):
        raise HTTPException(400, f"非法附加文件路径: {relpath!r}")
    return target


async def _save_extra_file(target: Path, upload: UploadFile) -> int:
    """把 UploadFile 流式写入 target，按扩展名检查大小上限。返回写入字节数。"""
    ext = target.suffix.lower()
    is_binary = ext in EXTRA_FILE_BINARY_EXTENSIONS
    max_size = EXTRA_FILE_MAX_BINARY_BYTES if is_binary else EXTRA_FILE_MAX_TEXT_BYTES
    written = 0
    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        with open(target, "wb") as f:
            while True:
                chunk = await upload.read(1024 * 1024)
                if not chunk:
                    break
                written += len(chunk)
                if written > max_size:
                    raise HTTPException(413, f"附加文件 {target.name!r} 超过大小上限")
                f.write(chunk)
    except HTTPException:
        if target.exists() and target.stat().st_size == 0:
            try:
                target.unlink()
            except OSError:
                pass
        raise
    return written


def _parse_cover_data_url(data_url: str) -> tuple[str, bytes]:
    """解析 data URL，返回 (扩展名, 二进制)。"""
    match = re.match(r"^data:image/([A-Za-z0-9+.\-]+);base64,(.+)$", data_url, re.DOTALL)
    if not match:
        raise HTTPException(400, "非法的 cover data URL（必须是 image/...;base64,...）")
    mime_sub = match.group(1).lower()
    mime_to_ext = {
        "png": ".png", "jpeg": ".jpg", "jpg": ".jpg", "gif": ".gif", "webp": ".webp",
    }
    if mime_sub not in mime_to_ext:
        raise HTTPException(400, f"不支持的封面格式：{mime_sub}")
    try:
        raw = base64.b64decode(match.group(2), validate=True)
    except binascii.Error as exc:
        raise HTTPException(400, f"非法的 base64 编码：{exc}") from exc
    if len(raw) > COVER_MAX_BYTES:
        raise HTTPException(413, f"封面超过 5MB 上限")
    return mime_to_ext[mime_sub], raw


def _ensure_login(request: Request) -> Dict[str, Any]:
    from src.webui_api.auth_core import resolve_request_auth
    user = resolve_request_auth(request)
    if not user:
        raise HTTPException(401, "请先登录")
    return user


def _ensure_github_login(request: Request) -> str:
    user = _ensure_login(request)
    login = str(user.get("github_login") or "").strip()
    if not login:
        raise HTTPException(
            403,
            detail={
                "code": "github_not_bound",
                "message": "未绑定 GitHub 账户，请先在账户设置中完成 GitHub OAuth 绑定。",
            },
        )
    return login


# ---------------- Endpoints ----------------

@router.get("/projects", summary="获取所有工作台项目索引")
def list_projects():
    data = load_mod_index()
    return [to_project(sequence, item) for sequence, item in data.items()]


@router.get("/projects/{sequence}", summary="获取指定工作台项目索引")
def get_project(sequence: str):
    data = load_mod_index()
    if sequence not in data:
        raise HTTPException(status_code=404, detail=f"工作台项目 '{sequence}' 未找到。")
    project = to_project(sequence, data[sequence]).model_dump()
    project["workbench_meta"] = data[sequence].get("workbench_meta")
    project["visible_blocks"] = data[sequence].get("visible_blocks")
    project["workbench_canvas_state"] = data[sequence].get("workbench_canvas_state")
    return project


@router.put("/projects/{sequence}/workbench-state", summary="保存工作台模板状态")
def save_workbench_state(sequence: str, payload: SaveWorkbenchStatePayload):
    data = load_mod_index()
    if sequence not in data:
        raise HTTPException(status_code=404, detail=f"工作台项目 '{sequence}' 未找到。")

    item = data[sequence]
    project_dir = _resolve_project_path(sequence)
    meta = payload.meta if isinstance(payload.meta, dict) else {}
    visible_blocks = payload.visible_blocks if isinstance(payload.visible_blocks, dict) else {}
    next_mod_id = str(meta.get("modId") or item.get("mod_id") or "").strip()
    next_mod_name = str(meta.get("modName") or item.get("mod_name") or "").strip()

    if not next_mod_id:
        raise HTTPException(400, "保存失败：mod_id 不能为空")
    if not next_mod_name:
        raise HTTPException(400, "保存失败：mod_name 不能为空")

    _validate_mod_id(next_mod_id)

    old_mod_id = str(item.get("mod_id") or "").strip()
    toml_path = project_dir / f"{next_mod_id}.toml"
    try:
        toml_path.write_text(payload.toml_content, encoding="utf-8")
    except OSError as exc:
        raise HTTPException(500, f"保存模板失败：{exc}") from exc

    if old_mod_id and old_mod_id != next_mod_id:
        old_toml_path = project_dir / f"{old_mod_id}.toml"
        if old_toml_path != toml_path and old_toml_path.exists():
            try:
                old_toml_path.unlink()
            except OSError:
                pass

    item["mod_id"] = next_mod_id
    item["mod_name"] = next_mod_name
    item["description"] = str(meta.get("description") or "")
    item["author"] = str(meta.get("author") or "")
    item["workbench_meta"] = meta
    item["visible_blocks"] = visible_blocks
    item["workbench_canvas_state"] = payload.canvas_state if isinstance(payload.canvas_state, dict) else {}
    save_mod_index(data)

    project = to_project(sequence, item).model_dump()
    project["workbench_meta"] = item.get("workbench_meta")
    project["visible_blocks"] = item.get("visible_blocks")
    project["workbench_canvas_state"] = item.get("workbench_canvas_state")
    return project


@router.post("/projects/check-path", summary="检测项目子目录是否可用", response_model=CheckProjectPathResponse)
def check_project_path(payload: CheckProjectPathPayload):
    base = _validate_base_path(payload.base_path)
    _validate_mod_id(payload.mod_id)
    target = base / payload.mod_id
    if not target.exists() or target == base:
        return CheckProjectPathResponse(available=True, suggestion=payload.mod_id, reason="目录不存在")
    suggestion = _suggest_mod_id(base, payload.mod_id, payload.exclude)
    return CheckProjectPathResponse(available=False, suggestion=suggestion, reason="目录已存在")


@router.post("/projects", summary="创建工作台项目", response_model=WorkbenchProject)
def create_project(payload: CreateWorkbenchProjectPayload, request: Request):
    base = _validate_base_path(payload.base_path)
    _validate_mod_id(payload.mod_id)
    if not payload.mod_name.strip():
        raise HTTPException(400, "项目名称不能为空")
    if len(payload.mod_name) > 128:
        raise HTTPException(400, "项目名称长度不能超过 128 字符")
    if len(payload.description) > 2000:
        raise HTTPException(400, "项目简介长度不能超过 2000 字符")

    # 强制 GitHub 登录校验：作者必须与后端当前用户一致
    current_login = _ensure_github_login(request)
    requested_author = payload.author.strip()
    if requested_author != current_login:
        raise HTTPException(
            403,
            detail={
                "code": "author_mismatch",
                "message": f"作者必须与当前 GitHub 账户一致（{current_login}）",
            },
        )

    target_dir = base / payload.mod_id
    conflict_resolution = payload.conflict_resolution
    created_by_us = False

    if target_dir.exists():
        if conflict_resolution == "rename":
            new_id = _suggest_mod_id(base, payload.mod_id)
            payload = payload.model_copy(update={"mod_id": new_id})
            target_dir = base / new_id
        elif conflict_resolution == "overwrite":
            # 清空目录里我们之前创建的文件（保留用户后续加的文件 — 简单做法：删 toml 和 cover）
            for fname in list(target_dir.iterdir()):
                if fname.name in {f"{payload.mod_id}.toml", "cover.png", "cover.jpg", "cover.jpeg", "cover.gif", "cover.webp"}:
                    try:
                        fname.unlink()
                    except OSError:
                        pass
        else:
            suggestion = _suggest_mod_id(base, payload.mod_id)
            raise HTTPException(
                409,
                detail={
                    "code": "dir_conflict",
                    "message": f"目录 '{target_dir}' 已存在",
                    "suggestion": f"{payload.mod_id} (1)",
                },
            )

    # 创建目录
    try:
        target_dir.mkdir(parents=True, exist_ok=True)
        created_by_us = True
    except OSError as exc:
        raise HTTPException(500, f"创建目录失败：{exc}") from exc

    cover_filename: Optional[str] = None
    if payload.cover_data_url:
        try:
            ext, raw = _parse_cover_data_url(payload.cover_data_url)
        except HTTPException:
            if created_by_us and not any(target_dir.iterdir()):
                try:
                    target_dir.rmdir()
                except OSError:
                    pass
            raise
        cover_filename = f"cover{ext}"
        cover_path = target_dir / cover_filename
        try:
            cover_path.write_bytes(raw)
        except OSError as exc:
            if created_by_us and not any(target_dir.iterdir()):
                try:
                    target_dir.rmdir()
                except OSError:
                    pass
            raise HTTPException(500, f"写入封面失败：{exc}") from exc

    # 写 TOML
    toml_path = target_dir / f"{payload.mod_id}.toml"
    try:
        toml_path.write_text(
            _render_mod_info_toml(
                payload.mod_id,
                payload.mod_name,
                payload.description,
                current_login,
                cover_filename,
            ),
            encoding="utf-8",
        )
    except OSError as exc:
        # 回滚
        if cover_filename:
            try:
                (target_dir / cover_filename).unlink()
            except OSError:
                pass
        if created_by_us and not any(target_dir.iterdir()):
            try:
                target_dir.rmdir()
            except OSError:
                pass
        raise HTTPException(500, f"写入模板失败：{exc}") from exc

    # 更新 MOD.json
    data = load_mod_index()
    sequence = payload.sequence or generate_sequence(data)
    if sequence in data:
        # 回滚
        try:
            toml_path.unlink()
        except OSError:
            pass
        if cover_filename:
            try:
                (target_dir / cover_filename).unlink()
            except OSError:
                pass
        if created_by_us and not any(target_dir.iterdir()):
            try:
                target_dir.rmdir()
            except OSError:
                pass
        raise HTTPException(400, f"工作台项目序列号 '{sequence}' 已存在。")
    data[sequence] = {
        "mod_name": payload.mod_name,
        "path": str(target_dir),
        "mod_id": payload.mod_id,
        "description": payload.description,
        "author": current_login,
        "cover": cover_filename,
        "files": [],
    }
    save_mod_index(data)
    return to_project(sequence, data[sequence])


@router.post(
    "/projects/with-files",
    summary="创建工作台项目并附带初始文件/目录（multipart 提交）",
    response_model=WorkbenchProject,
)
async def create_project_with_files(
    request: Request,
    base_path: str = Form(...),
    mod_name: str = Form(...),
    mod_id: str = Form(...),
    description: str = Form(""),
    author: str = Form(...),
    cover_data_url: Optional[str] = Form(None),
    conflict_resolution: Optional[str] = Form(None),
    sequence: Optional[str] = Form(None),
    extra_files: List[UploadFile] = File(default=[]),
    extra_relpaths: List[str] = Form(default=[]),
):
    """创建项目并把用户上传的附加文件按相对路径直接落到项目根目录。

    `extra_files` 与 `extra_relpaths` 一一对应；`extra_relpaths[i]` 是 `extra_files[i]`
    相对项目根的正斜杠路径（如 `version/JSON/version.json`）。最多 5 层目录嵌套。
    """
    base = _validate_base_path(base_path)
    _validate_mod_id(mod_id)
    if not mod_name.strip():
        raise HTTPException(400, "项目名称不能为空")
    if len(mod_name) > 128:
        raise HTTPException(400, "项目名称长度不能超过 128 字符")
    if len(description) > 2000:
        raise HTTPException(400, "项目简介长度不能超过 2000 字符")

    current_login = _ensure_github_login(request)
    requested_author = author.strip()
    if requested_author != current_login:
        raise HTTPException(
            403,
            detail={
                "code": "author_mismatch",
                "message": f"作者必须与当前 GitHub 账户一致（{current_login}）",
            },
        )

    if len(extra_files) != len(extra_relpaths):
        raise HTTPException(400, "extra_files 与 extra_relpaths 数量不匹配")

    target_dir = base / mod_id
    actual_mod_id = mod_id
    created_by_us = False
    extra_trash: List[Path] = []  # 落盘失败时用于回滚

    if target_dir.exists():
        if conflict_resolution == "rename":
            actual_mod_id = _suggest_mod_id(base, mod_id)
            target_dir = base / actual_mod_id
        elif conflict_resolution == "overwrite":
            for fname in list(target_dir.iterdir()):
                if fname.name in {f"{mod_id}.toml", "cover.png", "cover.jpg", "cover.jpeg", "cover.gif", "cover.webp"}:
                    try:
                        fname.unlink()
                    except OSError:
                        pass
        else:
            suggestion = _suggest_mod_id(base, mod_id)
            raise HTTPException(
                409,
                detail={
                    "code": "dir_conflict",
                    "message": f"目录 '{target_dir}' 已存在",
                    "suggestion": f"{mod_id} (1)",
                },
            )

    try:
        target_dir.mkdir(parents=True, exist_ok=True)
        created_by_us = True
    except OSError as exc:
        raise HTTPException(500, f"创建目录失败：{exc}") from exc

    cover_filename: Optional[str] = None
    if cover_data_url:
        try:
            ext, raw = _parse_cover_data_url(cover_data_url)
        except HTTPException:
            if created_by_us and not any(target_dir.iterdir()):
                try:
                    target_dir.rmdir()
                except OSError:
                    pass
            raise
        cover_filename = f"cover{ext}"
        cover_path = target_dir / cover_filename
        try:
            cover_path.write_bytes(raw)
        except OSError as exc:
            if created_by_us and not any(target_dir.iterdir()):
                try:
                    target_dir.rmdir()
                except OSError:
                    pass
            raise HTTPException(500, f"写入封面失败：{exc}") from exc

    # 写附加文件：先校验所有路径，再流式落盘
    validated_relpaths: List[str] = []
    targets: List[Path] = []
    for rel in extra_relpaths:
        normalized = _validate_extra_relpath(rel)
        # 禁止覆盖主 TOML / cover / 与主 mod_id 同名的 .toml
        if normalized == f"{actual_mod_id}.toml" or normalized == cover_filename:
            raise HTTPException(400, f"附加文件路径与保留文件冲突: {normalized!r}")
        # 文件名要落在项目根下
        target = _safe_join_inside(target_dir, normalized)
        validated_relpaths.append(normalized)
        targets.append(target)

    try:
        for upload, target in zip(extra_files, targets):
            await _save_extra_file(target, upload)
            extra_trash.append(target)
    except HTTPException:
        # 回滚：删除已落盘的附加文件
        for path in extra_trash:
            try:
                if path.is_dir():
                    shutil.rmtree(path)
                else:
                    path.unlink()
            except OSError:
                pass
        if cover_filename:
            try:
                (target_dir / cover_filename).unlink()
            except OSError:
                pass
        if created_by_us and not any(target_dir.iterdir()):
            try:
                target_dir.rmdir()
            except OSError:
                pass
        raise

    # 写 TOML
    toml_path = target_dir / f"{actual_mod_id}.toml"
    try:
        toml_path.write_text(
            _render_mod_info_toml(
                actual_mod_id,
                mod_name,
                description,
                current_login,
                cover_filename,
            ),
            encoding="utf-8",
        )
    except OSError as exc:
        for path in extra_trash:
            try:
                if path.is_dir():
                    shutil.rmtree(path)
                else:
                    path.unlink()
            except OSError:
                pass
        if cover_filename:
            try:
                (target_dir / cover_filename).unlink()
            except OSError:
                pass
        if created_by_us and not any(target_dir.iterdir()):
            try:
                target_dir.rmdir()
            except OSError:
                pass
        raise HTTPException(500, f"写入模板失败：{exc}") from exc

    data = load_mod_index()
    actual_sequence = sequence or generate_sequence(data)
    if actual_sequence in data:
        for path in extra_trash:
            try:
                if path.is_dir():
                    shutil.rmtree(path)
                else:
                    path.unlink()
            except OSError:
                pass
        try:
            toml_path.unlink()
        except OSError:
            pass
        if cover_filename:
            try:
                (target_dir / cover_filename).unlink()
            except OSError:
                pass
        if created_by_us and not any(target_dir.iterdir()):
            try:
                target_dir.rmdir()
            except OSError:
                pass
        raise HTTPException(400, f"工作台项目序列号 '{actual_sequence}' 已存在。")
    data[actual_sequence] = {
        "mod_name": mod_name,
        "path": str(target_dir),
        "mod_id": actual_mod_id,
        "description": description,
        "author": current_login,
        "cover": cover_filename,
        "files": [],
    }
    save_mod_index(data)
    return to_project(actual_sequence, data[actual_sequence])


# ---------------- Project Management Endpoints (cover, update, display-mode, delete) ----------------

_COVER_MIME_BY_EXT = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
}


def _ensure_project(sequence: str) -> Dict[str, Any]:
    data = load_mod_index()
    if sequence not in data:
        raise HTTPException(404, f"工作台项目 '{sequence}' 未找到。")
    return data[sequence]


def _resolve_project_path(sequence: str) -> Path:
    """读 MOD.json 拿到 project 的绝对路径（不存在则抛 404）。同时自动迁移 legacy .toml 文件路径。"""
    data = load_mod_index()
    if sequence not in data:
        raise HTTPException(404, f"工作台项目 '{sequence}' 未找到。")
    raw_path = str(data[sequence].get("path", "")).strip()
    if not raw_path:
        raise HTTPException(400, f"工作台项目 '{sequence}' 未配置 path。")
    p = Path(raw_path)
    if not p.is_absolute():
        p = PROJECT_ROOT / raw_path
    return _migrate_legacy_project_path(data, sequence, p)


def _migrate_legacy_project_path(data: Dict[str, Any], sequence: str, p: Path) -> Path:
    """自动迁移 legacy 格式：path 指向一个 .toml 文件，迁到 base/<stem>/<stem>.toml 子目录结构。

    旧代码会把 .toml 模板文件直接作为 project.path 存进 MOD.json。新流程要求 path 是项目根目录。
    这里做懒迁移：每次访问项目时检查，文件存在且是 .toml 就迁到标准结构。
    """
    if not p.exists() or p.is_dir() or p.suffix.lower() != '.toml':
        return p
    base = p.parent
    mod_id = p.stem
    new_dir = base / mod_id
    try:
        new_dir.mkdir(parents=True, exist_ok=True)
    except OSError:
        return p
    new_toml = new_dir / f"{mod_id}.toml"
    try:
        if not new_toml.exists():
            shutil.move(str(p), str(new_toml))
    except OSError:
        return p
    item = data[sequence]
    item["path"] = str(new_dir)
    if not str(item.get("mod_id", "")).strip():
        item["mod_id"] = mod_id
    save_mod_index(data)
    return new_dir


def _delete_old_cover(project_dir: Path, cover_name: str) -> None:
    if not cover_name:
        return
    try:
        target = (project_dir / cover_name).resolve()
        if str(target).startswith(str(project_dir.resolve())) and target.exists():
            target.unlink()
    except OSError:
        pass


@router.get("/projects/{sequence}/cover", summary="获取项目封面图片")
def get_project_cover(sequence: str):
    project = _ensure_project(sequence)
    cover_name = (project.get("cover") or "").strip()
    if not cover_name:
        raise HTTPException(404, "项目无封面")
    project_dir = _resolve_project_path(sequence)
    target = (project_dir / cover_name).resolve()
    if not str(target).startswith(str(project_dir.resolve())):
        raise HTTPException(400, "封面路径非法")
    if not target.exists():
        raise HTTPException(404, f"封面文件 '{cover_name}' 不存在")
    ext = target.suffix.lower()
    media = _COVER_MIME_BY_EXT.get(ext, "application/octet-stream")
    # 兜底禁缓存：替换封面是同名文件覆盖，URL 路径不变，必须让浏览器每次都拿最新字节
    headers = {"Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache", "Expires": "0"}
    return FileResponse(str(target), media_type=media, headers=headers)


@router.patch("/projects/{sequence}", summary="编辑项目信息", response_model=WorkbenchProject)
def update_project(sequence: str, payload: UpdateProjectPayload):
    data = load_mod_index()
    if sequence not in data:
        raise HTTPException(404, f"工作台项目 '{sequence}' 未找到。")
    item = data[sequence]
    project_dir = _resolve_project_path(sequence)
    old_cover = item.get("cover")
    new_cover = old_cover

    if payload.mod_name is not None:
        name = payload.mod_name.strip()
        if not name:
            raise HTTPException(400, "项目名称不能为空")
        if len(name) > 128:
            raise HTTPException(400, "项目名称长度不能超过 128 字符")
        item["mod_name"] = name

    if payload.description is not None:
        if len(payload.description) > 2000:
            raise HTTPException(400, "项目简介长度不能超过 2000 字符")
        item["description"] = payload.description

    if payload.cover_clear is True:
        _delete_old_cover(project_dir, old_cover)
        new_cover = None
    elif payload.cover_data_url is not None and payload.cover_data_url != "":
        # 替换封面
        ext, raw = _parse_cover_data_url(payload.cover_data_url)
        _delete_old_cover(project_dir, old_cover)
        new_cover = f"cover{ext}"
        try:
            (project_dir / new_cover).write_bytes(raw)
        except OSError as exc:
            raise HTTPException(500, f"写入封面失败：{exc}") from exc

    item["cover"] = new_cover

    # 同步 toml
    mod_id = str(item.get("mod_id", ""))
    if mod_id:
        toml_path = project_dir / f"{mod_id}.toml"
        try:
            toml_path.write_text(
                _render_mod_info_toml(
                    mod_id,
                    str(item.get("mod_name", "")),
                    str(item.get("description", "")),
                    str(item.get("author", "")),
                    new_cover,
                ),
                encoding="utf-8",
            )
        except OSError as exc:
            raise HTTPException(500, f"重写模板失败：{exc}") from exc

    save_mod_index(data)
    return to_project(sequence, data[sequence])


@router.patch("/projects/{sequence}/display-mode", summary="切换文件夹/卡片显示", response_model=WorkbenchProject)
def set_display_mode(sequence: str, payload: SetDisplayModePayload):
    data = load_mod_index()
    if sequence not in data:
        raise HTTPException(404, f"工作台项目 '{sequence}' 未找到。")
    mode_map = {"auto": None, "folder": True, "card": False}
    if payload.mode not in mode_map:
        raise HTTPException(400, f"非法 mode: {payload.mode}")
    data[sequence]["force_folder"] = mode_map[payload.mode]
    save_mod_index(data)
    return to_project(sequence, data[sequence])


@router.get("/trash", summary="列出模板工作台回收站")
def list_trash():
    return _read_trash_index()


@router.post("/trash/{trash_id}/restore", summary="恢复回收站项目")
def restore_trash_item(trash_id: str):
    entries = _read_trash_index()
    entry = next((item for item in entries if item.get("id") == trash_id), None)
    if not entry:
        raise HTTPException(404, f"回收站记录 '{trash_id}' 不存在")
    kind = entry.get("kind")
    if kind == "project":
        restored = _restore_project_from_trash(entry)
    elif kind == "file":
        restored = _restore_file_from_trash(entry)
    elif kind == "folder":
        restored = _restore_folder_from_trash(entry)
    else:
        raise HTTPException(400, f"未知回收站类型: {kind}")
    return {"success": True, "item": restored, "kind": kind}


@router.delete("/trash/{trash_id}", summary="永久删除回收站项目")
def delete_trash_item(trash_id: str):
    entries = _read_trash_index()
    if not any(item.get("id") == trash_id for item in entries):
        raise HTTPException(404, f"回收站记录 '{trash_id}' 不存在")
    _drop_trash_entry(trash_id)
    return {"success": True, "id": trash_id}


@router.delete("/projects/{sequence}", summary="删除项目")
def delete_project(sequence: str):
    data = load_mod_index()
    if sequence not in data:
        raise HTTPException(404, f"工作台项目 '{sequence}' 未找到。")
    project_path = _resolve_project_path(sequence)
    data = load_mod_index()
    if sequence not in data:
        raise HTTPException(404, f"工作台项目 '{sequence}' 未找到。")
    project = data[sequence]
    trash_entry = _create_trash_entry(
        "project",
        str(project.get("mod_name") or project_path.name or sequence),
        project_path,
        {
            "sequence": sequence,
            "project": project,
            "path": str(project_path),
        },
    )
    del data[sequence]
    save_mod_index(data)
    return {
        "success": True,
        "sequence": sequence,
        "trash": trash_entry,
        "disk_cleaned": True,
        "disk_error": None,
    }
