import base64
import binascii
import json
import re
import secrets
import shutil
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

router = APIRouter()

CONFIG_FILE_PATH = Path("config") / "MOD.json"

MOD_ID_PATTERN = re.compile(r"^[A-Za-z0-9_\-]{1,64}$")
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


class WorkbenchProject(BaseModel):
    sequence: str
    mod_name: str
    path: str
    mod_id: str = ""
    description: str = ""
    author: str = ""
    cover: Optional[str] = None
    files: List[Dict[str, Any]] = []


class CreateWorkbenchProjectPayload(BaseModel):
    base_path: str
    mod_name: str
    mod_id: str
    description: str = ""
    author: str
    cover_data_url: Optional[str] = None
    conflict_resolution: Optional[str] = None  # "rename" | "overwrite"
    sequence: Optional[str] = None


class CheckProjectPathPayload(BaseModel):
    base_path: str
    mod_id: str
    exclude: Optional[str] = None


class CheckProjectPathResponse(BaseModel):
    available: bool
    suggestion: str
    reason: Optional[str] = None


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


def generate_sequence(existing: Dict[str, Dict[str, Any]]) -> str:
    while True:
        sequence = secrets.token_hex(32)
        if sequence not in existing:
            return sequence


def to_project(sequence: str, data: Dict[str, Any]) -> WorkbenchProject:
    files = data.get("files", [])
    return WorkbenchProject(
        sequence=sequence,
        mod_name=str(data.get("mod_name", "")),
        path=str(data.get("path", "")),
        mod_id=str(data.get("mod_id", "")),
        description=str(data.get("description", "")),
        author=str(data.get("author", "")),
        cover=data.get("cover"),
        files=files if isinstance(files, list) else [],
    )


def _validate_mod_id(mod_id: str) -> None:
    if not mod_id or not MOD_ID_PATTERN.match(mod_id):
        raise HTTPException(400, f"非法的 mod_id: {mod_id!r}（仅允许字母/数字/下划线/连字符，1-64 字符）")


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
    return to_project(sequence, data[sequence])


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
