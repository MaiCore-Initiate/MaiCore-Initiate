# -*- coding: utf-8 -*-
"""设置管理 API。"""
import json
import os
import re
import secrets
import sqlite3
import logging
import shutil
import subprocess
import sys
import time
from copy import deepcopy
from typing import Any, Dict, List
from pathlib import Path
from urllib.parse import quote
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, Form, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from pydantic import BaseModel
from PIL import Image, ImageOps

from .auth_core import require_action, require_admin

router = APIRouter()
logger = logging.getLogger(__name__)

BACKGROUNDS_DIR = os.path.join("webui", "frontend", "public", "backgrounds")
ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".mp4", ".webm"}
VIDEO_EXTENSIONS = {".mp4", ".webm"}
MAX_IMAGE_FILE_SIZE = 50 * 1024 * 1024   # 50MB
MAX_VIDEO_FILE_SIZE = 600 * 1024 * 1024  # 600MB
THUMB_CACHE_DIR = os.path.join(BACKGROUNDS_DIR, ".thumb_cache")
THUMB_MIN_SIZE = 64
THUMB_MAX_SIZE = 1024
PROJECT_ROOT = Path(__file__).resolve().parents[2]
ALLOWED_SECTIONS = {"theme", "logging", "display", "on_exit", "notifications", "ui", "network", "monitor", "git"}
PREFERENCES_DB = PROJECT_ROOT / "data" / "user_preferences.db"
DEFAULT_USER_ID = "default"
DESKTOP_PET_KEY = "desktop_pet_settings"
LIVE2D_ROOT = PROJECT_ROOT / "data" / "Live_2D"
LIVE2D_CUSTOM_COVER_PREFIX = "__cover_custom"
LIVE2D_COVER_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
LIVE2D_IMPORT_MAX_FILE_SIZE = 150 * 1024 * 1024  # 单文件 150MB
LIVE2D_OVERLAY_MIN_W = 180
LIVE2D_OVERLAY_MAX_W = 1200
LIVE2D_OVERLAY_MIN_H = 180
LIVE2D_OVERLAY_MAX_H = 1600

DEFAULT_DESKTOP_PET_SETTINGS: Dict[str, Any] = {
    "enabled": False,
    "model_id": "",
    "scale": 1.0,
    "opacity": 1.0,
    "position": {"x": 80, "y": 120},
    "window": {"width": 360, "height": 520, "always_on_top": True, "transparent": True},
    "expression": "",
    "motion_group": "",
    "motion_index": 0,
    "face_capture_enabled": False,
    "face_capture_source": "camera",
    "face_smoothing": 0.45,
    "ai_enabled": True,
    "persona": {
        "name": "",
        "tone": "",
        "system_prompt": "",
        "greeting": ""
    },
    "model_overrides": {},
    "memory": {
        "share_between_sessions_same_model": True,
        "stage_management": {
            "memory_digest_interval_turns": 50,
            "impression_build_turns": [30, 50, 100, 150],
            "impression_rebuild_interval_turns": 150,
        },
        "embedding": {
            "provider": "",
            "base_url": "",
            "api_key": "",
            "model": "",
        },
        "rerank": {
            "provider": "",
            "base_url": "",
            "api_key": "",
            "model": "",
        },
    },
}

_desktop_pet_process: subprocess.Popen | None = None
_desktop_pet_started_at: float | None = None
_face_capture_state: Dict[str, Any] = {
    "timestamp": 0,
    "yaw": 0.0,
    "pitch": 0.0,
    "roll": 0.0,
    "eye_open_left": 1.0,
    "eye_open_right": 1.0,
    "mouth_open": 0.0,
}
DESKTOP_PET_OVERLAY_LOG = PROJECT_ROOT / "log" / "desktop_pet_overlay.log"
PET_USAGE_LOG = PROJECT_ROOT / "data" / "pet_usage.json"
DESKTOP_PET_SETTINGS_FILE = PROJECT_ROOT / "data" / "desktop_pet_settings.json"
DESKTOP_PET_MODELS_CACHE_FILE = PROJECT_ROOT / "data" / "desktop_pet_models_cache.json"
DESKTOP_PET_RUNTIME_FILE = PROJECT_ROOT / "data" / "desktop_pet_runtime.json"


# ── WebSocket 设置广播管理器 ──

class _SettingsWSManager:
    def __init__(self):
        self._conns: list = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self._conns.append(ws)

    def disconnect(self, ws: WebSocket):
        if ws in self._conns:
            self._conns.remove(ws)

    async def broadcast(self, msg: dict):
        dead = []
        for ws in list(self._conns):
            try:
                await ws.send_json(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


settings_ws_manager = _SettingsWSManager()


def _find_electron_exe() -> "Path | None":
    """按优先级查找 Electron 桌宠 exe。"""
    mgr = _get_p_config()
    stored = mgr.get("desktop_pet.exe_path", "")
    if stored and Path(stored).exists():
        return Path(stored)

    candidates = [
        PROJECT_ROOT / "desktop_pet_frontend" / "release" / "win-unpacked" / "MCStart Desktop Pet.exe",
        PROJECT_ROOT / "desktop_pet_frontend" / "dist" / "win-unpacked" / "MCStart Desktop Pet.exe",
        PROJECT_ROOT / "desktop_pet_frontend" / "release" / "win-unpacked" / "Desktop Pet.exe",
        PROJECT_ROOT / "desktop_pet_frontend" / "dist" / "win-unpacked" / "Desktop Pet.exe",
        PROJECT_ROOT / "desktop_pet_frontend" / "dist" / "win-unpacked" / "desktop-pet-scheduler.exe",
        PROJECT_ROOT / "desktop_pet_frontend" / "release" / "win-unpacked" / "desktop-pet-scheduler.exe",
    ]
    for p in candidates:
        if p.exists():
            return p

    if os.name == "nt":
        try:
            import winreg
            # (app_id, exe_name) — 新名先查
            app_entries = [
                ("MCStart Desktop Pet", "MCStart Desktop Pet.exe"),
                ("Desktop Pet", "Desktop Pet.exe"),
                ("com.xiaocz.desktoppet", "MCStart Desktop Pet.exe"),
                ("com.xiaocz.desktoppet", "Desktop Pet.exe"),
            ]
            hives = [winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER]
            for hive in hives:
                for app_id, exe_name in app_entries:
                    key_path = rf"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{app_id}"
                    try:
                        with winreg.OpenKey(hive, key_path) as k:
                            loc, _ = winreg.QueryValueEx(k, "InstallLocation")
                            exe = Path(loc) / exe_name
                            if exe.exists():
                                mgr.set("desktop_pet.exe_path", str(exe))
                                mgr.save()
                                return exe
                    except OSError:
                        continue
        except ImportError:
            pass
    return None


def _read_usage_log() -> dict:
    if not PET_USAGE_LOG.exists():
        return {"sessions": []}
    try:
        return json.loads(PET_USAGE_LOG.read_text(encoding="utf-8"))
    except Exception:
        return {"sessions": []}


def _write_usage_log(data: dict):
    PET_USAGE_LOG.parent.mkdir(parents=True, exist_ok=True)
    PET_USAGE_LOG.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def _append_usage_session_start():
    from datetime import datetime, timezone
    data = _read_usage_log()
    data["sessions"].append({"start": datetime.now(timezone.utc).isoformat(), "end": None})
    _write_usage_log(data)


def _update_usage_session_end():
    from datetime import datetime, timezone
    data = _read_usage_log()
    sessions = data.get("sessions", [])
    for sess in reversed(sessions):
        if sess.get("end") is None:
            sess["end"] = datetime.now(timezone.utc).isoformat()
            break
    _write_usage_log(data)


def _get_p_config():
    from src.core.p_config import p_config_manager
    return p_config_manager


def _deep_merge(target: Dict[str, Any], incoming: Dict[str, Any]) -> Dict[str, Any]:
    for key, value in incoming.items():
        if isinstance(value, dict) and isinstance(target.get(key), dict):
            _deep_merge(target[key], value)
            continue
        target[key] = value
    return target


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _normalize_persona_settings(value: Dict[str, Any] | None) -> Dict[str, Any]:
    persona = value if isinstance(value, dict) else {}
    return {
        "name": str(persona.get("name", "")).strip(),
        "tone": str(persona.get("tone", "")).strip(),
        "system_prompt": str(persona.get("system_prompt", "")).strip(),
        "greeting": str(persona.get("greeting", "")).strip(),
    }


def _normalize_model_overrides(value: Any) -> Dict[str, Any]:
    if not isinstance(value, dict):
        return {}

    normalized: Dict[str, Any] = {}
    for raw_model_id, raw_override in value.items():
        model_id = str(raw_model_id or "").strip()
        if not model_id or not isinstance(raw_override, dict):
            continue

        override: Dict[str, Any] = {}
        raw_scale = raw_override.get("scale")
        try:
            scale = float(raw_scale)
        except (TypeError, ValueError):
            scale = None
        if scale is not None:
            override["scale"] = float(_clamp(scale, 0.3, 2.5))

        window = raw_override.get("window", {}) if isinstance(raw_override.get("window"), dict) else {}
        width = window.get("width")
        height = window.get("height")
        next_window: Dict[str, Any] = {}
        try:
            next_window["width"] = int(_clamp(float(width), LIVE2D_OVERLAY_MIN_W, LIVE2D_OVERLAY_MAX_W))
        except (TypeError, ValueError):
            pass
        try:
            next_window["height"] = int(_clamp(float(height), LIVE2D_OVERLAY_MIN_H, LIVE2D_OVERLAY_MAX_H))
        except (TypeError, ValueError):
            pass
        if next_window:
            override["window"] = next_window

        if isinstance(raw_override.get("persona"), dict):
            override["persona"] = _normalize_persona_settings(raw_override.get("persona"))

        if override:
            normalized[model_id] = override

    return normalized


def _resolve_effective_desktop_pet_settings(settings: Dict[str, Any]) -> Dict[str, Any]:
    result = deepcopy(_normalize_desktop_pet_settings(settings))
    model_id = str(result.get("model_id", "")).strip()
    if not model_id:
        return result

    override = result.get("model_overrides", {}).get(model_id)
    if not isinstance(override, dict):
        return result

    if isinstance(override.get("window"), dict):
        result["window"].update(override["window"])
    if override.get("scale") is not None:
        result["scale"] = float(override["scale"])
    if isinstance(override.get("persona"), dict):
        result["persona"] = _normalize_persona_settings(override.get("persona"))
    return result


def _sanitize_model_id(raw: str) -> str:
    val = (raw or "").strip().replace("\\", "/").strip("/")
    if not val or "/" in val:
        raise HTTPException(400, "非法模型ID")
    if val.startswith("."):
        raise HTTPException(400, "非法模型ID")
    return val


def _safe_folder_name(raw: str) -> str:
    name = re.sub(r"[^\w\-\u4e00-\u9fff\.]+", "_", (raw or "").strip())
    name = name.strip("._ ")
    if not name:
        name = f"model_{uuid4().hex[:8]}"
    return name


def _ensure_preferences_schema(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS preferences (
            user_id TEXT NOT NULL DEFAULT 'default',
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            PRIMARY KEY (user_id, key)
        )
        """
    )


def _get_pref_conn() -> sqlite3.Connection:
    PREFERENCES_DB.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(PREFERENCES_DB))
    _ensure_preferences_schema(conn)
    conn.commit()
    return conn


def _read_json_file(path: Path) -> Any | None:
    if not path.exists() or not path.is_file():
        return None
    last_error: Exception | None = None
    for _ in range(6):
        try:
            text = path.read_text(encoding="utf-8")
            if text.startswith("\ufeff"):
                text = text.lstrip("\ufeff")
            return json.loads(text)
        except PermissionError as exc:
            last_error = exc
            time.sleep(0.05)
        except OSError as exc:
            last_error = exc
            if getattr(exc, "errno", None) in {13}:
                time.sleep(0.05)
                continue
            break
        except Exception as exc:
            last_error = exc
            break
    if last_error is not None:
        logger.warning("读取 JSON 文件失败: %s (%s)", path, last_error)
    return None


def _write_json_file(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    content = json.dumps(payload, ensure_ascii=False, indent=2)
    last_error: Exception | None = None
    for _ in range(8):
        try:
            path.write_text(content, encoding="utf-8")
            return
        except PermissionError as exc:
            last_error = exc
            time.sleep(0.05)
        except OSError as exc:
            last_error = exc
            if getattr(exc, "errno", None) in {13}:
                time.sleep(0.05)
                continue
            break

    if last_error is not None:
        raise last_error


def _normalize_desktop_pet_settings(value: Dict[str, Any] | None) -> Dict[str, Any]:
    result = deepcopy(DEFAULT_DESKTOP_PET_SETTINGS)
    if value and isinstance(value, dict):
        _deep_merge(result, value)

    result["enabled"] = bool(result.get("enabled", False))
    result["model_id"] = str(result.get("model_id", "")).strip()
    result["scale"] = float(_clamp(float(result.get("scale", 1.0)), 0.2, 4.0))
    result["opacity"] = float(_clamp(float(result.get("opacity", 1.0)), 0.1, 1.0))

    pos = result.get("position", {}) if isinstance(result.get("position"), dict) else {}
    result["position"] = {
        "x": int(pos.get("x", DEFAULT_DESKTOP_PET_SETTINGS["position"]["x"])),
        "y": int(pos.get("y", DEFAULT_DESKTOP_PET_SETTINGS["position"]["y"])),
    }

    window = result.get("window", {}) if isinstance(result.get("window"), dict) else {}
    result["window"] = {
        "width": int(_clamp(float(window.get("width", 360)), LIVE2D_OVERLAY_MIN_W, LIVE2D_OVERLAY_MAX_W)),
        "height": int(_clamp(float(window.get("height", 520)), LIVE2D_OVERLAY_MIN_H, LIVE2D_OVERLAY_MAX_H)),
        "always_on_top": bool(window.get("always_on_top", True)),
        "transparent": bool(window.get("transparent", True)),
    }

    result["expression"] = str(result.get("expression", "")).strip()
    result["motion_group"] = str(result.get("motion_group", "")).strip()
    result["motion_index"] = int(max(0, int(result.get("motion_index", 0))))
    result["face_capture_enabled"] = bool(result.get("face_capture_enabled", False))
    result["face_capture_source"] = str(result.get("face_capture_source", "camera")).strip() or "camera"
    result["face_smoothing"] = float(_clamp(float(result.get("face_smoothing", 0.45)), 0.0, 1.0))
    result["ai_enabled"] = bool(result.get("ai_enabled", True))

    result["persona"] = _normalize_persona_settings(result.get("persona"))
    result["model_overrides"] = _normalize_model_overrides(result.get("model_overrides"))

    memory = result.get("memory", {}) if isinstance(result.get("memory"), dict) else {}
    stage_management = memory.get("stage_management", {}) if isinstance(memory.get("stage_management"), dict) else {}
    embedding = memory.get("embedding", {}) if isinstance(memory.get("embedding"), dict) else {}
    rerank = memory.get("rerank", {}) if isinstance(memory.get("rerank"), dict) else {}
    raw_build_turns = stage_management.get(
        "impression_build_turns",
        DEFAULT_DESKTOP_PET_SETTINGS["memory"]["stage_management"]["impression_build_turns"],
    )
    normalized_build_turns: list[int] = []
    if isinstance(raw_build_turns, list):
        for item in raw_build_turns:
            try:
                turn = int(item)
            except (TypeError, ValueError):
                continue
            if turn <= 0 or turn in normalized_build_turns:
                continue
            normalized_build_turns.append(turn)
    if not normalized_build_turns:
        normalized_build_turns = list(DEFAULT_DESKTOP_PET_SETTINGS["memory"]["stage_management"]["impression_build_turns"])
    normalized_build_turns.sort()
    try:
        memory_digest_interval_turns = int(stage_management.get("memory_digest_interval_turns", 50))
    except (TypeError, ValueError):
        memory_digest_interval_turns = 50
    try:
        impression_rebuild_interval_turns = int(stage_management.get("impression_rebuild_interval_turns", 150))
    except (TypeError, ValueError):
        impression_rebuild_interval_turns = 150

    result["memory"] = {
        "share_between_sessions_same_model": bool(memory.get("share_between_sessions_same_model", True)),
        "stage_management": {
            "memory_digest_interval_turns": int(max(1, memory_digest_interval_turns)),
            "impression_build_turns": normalized_build_turns,
            "impression_rebuild_interval_turns": int(max(1, impression_rebuild_interval_turns)),
        },
        "embedding": {
            "provider": str(embedding.get("provider", "")).strip(),
            "base_url": str(embedding.get("base_url", "")).strip(),
            "api_key": str(embedding.get("api_key", "")).strip(),
            "model": str(embedding.get("model", "")).strip(),
        },
        "rerank": {
            "provider": str(rerank.get("provider", "")).strip(),
            "base_url": str(rerank.get("base_url", "")).strip(),
            "api_key": str(rerank.get("api_key", "")).strip(),
            "model": str(rerank.get("model", "")).strip(),
        },
    }
    return result


def _write_desktop_pet_settings_to_sqlite(normalized: Dict[str, Any]) -> None:
    conn = _get_pref_conn()
    try:
        conn.execute(
            "INSERT OR REPLACE INTO preferences (user_id, key, value) VALUES (?, ?, ?)",
            (DEFAULT_USER_ID, DESKTOP_PET_KEY, json.dumps(normalized, ensure_ascii=False)),
        )
        conn.commit()
    finally:
        conn.close()


def _read_desktop_pet_settings() -> Dict[str, Any]:
    if not _desktop_pet_settings_owned_by_electron():
        shared_raw = _read_json_file(DESKTOP_PET_SETTINGS_FILE)
        if isinstance(shared_raw, dict):
            normalized = _normalize_desktop_pet_settings(shared_raw)
            _write_desktop_pet_settings_to_sqlite(normalized)
            _write_json_file(DESKTOP_PET_SETTINGS_FILE, normalized)
            return _resolve_effective_desktop_pet_settings(normalized)

    conn = _get_pref_conn()
    try:
        row = conn.execute(
            "SELECT value FROM preferences WHERE user_id=? AND key=?",
            (DEFAULT_USER_ID, DESKTOP_PET_KEY),
        ).fetchone()
    finally:
        conn.close()

    raw: Dict[str, Any] | None = None
    if row:
        try:
            parsed = json.loads(row[0])
            raw = parsed if isinstance(parsed, dict) else None
        except json.JSONDecodeError:
            raw = None

    normalized = _normalize_desktop_pet_settings(raw)
    _write_desktop_pet_settings_to_sqlite(normalized)
    _write_json_file(DESKTOP_PET_SETTINGS_FILE, normalized)
    return _resolve_effective_desktop_pet_settings(normalized)


def _read_stored_desktop_pet_settings() -> Dict[str, Any]:
    if not _desktop_pet_settings_owned_by_electron():
        shared_raw = _read_json_file(DESKTOP_PET_SETTINGS_FILE)
        if isinstance(shared_raw, dict):
            normalized = _normalize_desktop_pet_settings(shared_raw)
            _write_desktop_pet_settings_to_sqlite(normalized)
            _write_json_file(DESKTOP_PET_SETTINGS_FILE, normalized)
            return normalized

    conn = _get_pref_conn()
    try:
        row = conn.execute(
            "SELECT value FROM preferences WHERE user_id=? AND key=?",
            (DEFAULT_USER_ID, DESKTOP_PET_KEY),
        ).fetchone()
    finally:
        conn.close()

    raw: Dict[str, Any] | None = None
    if row:
        try:
            parsed = json.loads(row[0])
            raw = parsed if isinstance(parsed, dict) else None
        except json.JSONDecodeError:
            raw = None

    normalized = _normalize_desktop_pet_settings(raw)
    _write_desktop_pet_settings_to_sqlite(normalized)
    _write_json_file(DESKTOP_PET_SETTINGS_FILE, normalized)
    return normalized


def _write_desktop_pet_settings(settings: Dict[str, Any]) -> Dict[str, Any]:
    normalized = _normalize_desktop_pet_settings(settings)
    _write_desktop_pet_settings_to_sqlite(normalized)
    _write_json_file(DESKTOP_PET_SETTINGS_FILE, normalized)
    return normalized


def _is_valid_live2d_folder(model_dir: Path) -> bool:
    for p in model_dir.rglob("*"):
        if not p.is_file():
            continue
        suffix = p.suffix.lower()
        if suffix in {".moc", ".moc3"}:
            return True
    return False


def _find_model_json(model_dir: Path) -> Path | None:
    model_jsons = sorted(model_dir.glob("*.model3.json"))
    if model_jsons:
        return model_jsons[0]
    old_model_jsons = sorted(model_dir.glob("*.model.json"))
    if old_model_jsons:
        return old_model_jsons[0]
    for p in sorted(model_dir.rglob("*.model3.json")):
        return p
    for p in sorted(model_dir.rglob("*.model.json")):
        return p
    return None


def _to_live2d_public_url(path: Path) -> str:
    rel = path.relative_to(LIVE2D_ROOT).as_posix()
    return f"/live2d/{quote(rel, safe='/')}"


def _extract_live2d_metadata(model_dir: Path) -> Dict[str, Any]:
    model_json = _find_model_json(model_dir)
    expressions: List[Dict[str, str]] = []
    motions: Dict[str, List[Dict[str, Any]]] = {}
    texture_count = 0

    if model_json and model_json.is_file():
        try:
            model_data = json.loads(model_json.read_text(encoding="utf-8"))
        except UnicodeDecodeError:
            model_data = json.loads(model_json.read_text(encoding="utf-8-sig"))
        except Exception:
            model_data = {}
        refs = model_data.get("FileReferences", {}) if isinstance(model_data, dict) else {}
        expression_list = refs.get("Expressions", [])
        if isinstance(expression_list, list):
            for item in expression_list:
                if not isinstance(item, dict):
                    continue
                file_name = str(item.get("File", "")).strip()
                name = str(item.get("Name", "")).strip() or Path(file_name).stem
                if file_name:
                    expressions.append({"name": name, "file": file_name})
        motion_map = refs.get("Motions", {})
        if isinstance(motion_map, dict):
            for group, values in motion_map.items():
                if not isinstance(values, list):
                    continue
                group_items: List[Dict[str, Any]] = []
                for idx, item in enumerate(values):
                    if not isinstance(item, dict):
                        continue
                    file_name = str(item.get("File", "")).strip()
                    if not file_name:
                        continue
                    group_items.append({"index": idx, "file": file_name})
                if group_items:
                    motions[str(group)] = group_items
        textures = refs.get("Textures", [])
        if isinstance(textures, list):
            texture_count = len(textures)

    if not expressions:
        for exp_file in sorted(model_dir.rglob("*.exp3.json")):
            expressions.append({"name": exp_file.stem, "file": exp_file.relative_to(model_dir).as_posix()})

    if not motions:
        discovered = sorted(model_dir.rglob("*.motion3.json"))
        if discovered:
            motions["default"] = [{"index": i, "file": p.relative_to(model_dir).as_posix()} for i, p in enumerate(discovered)]

    custom_cover = None
    for ext in LIVE2D_COVER_EXTENSIONS:
        candidate = model_dir / f"{LIVE2D_CUSTOM_COVER_PREFIX}{ext}"
        if candidate.is_file():
            custom_cover = candidate
            break
    fallback_cover = None
    if custom_cover is None:
        for p in sorted(model_dir.iterdir()):
            if p.is_file() and p.suffix.lower() in LIVE2D_COVER_EXTENSIONS:
                fallback_cover = p
                break
    cover = custom_cover or fallback_cover
    cover_url = _to_live2d_public_url(cover) if cover else ""

    return {
        "model_id": model_dir.name,
        "path": str(model_dir),
        "model_json": model_json.name if model_json else "",
        "model_json_url": _to_live2d_public_url(model_json) if model_json else "",
        "model_json_path": str(model_json.resolve()) if model_json else "",
        "cover_url": cover_url,
        "cover_path": str(cover.resolve()) if cover else "",
        "expressions": expressions,
        "motions": motions,
        "texture_count": texture_count,
    }


def _scan_live2d_models() -> List[Dict[str, Any]]:
    LIVE2D_ROOT.mkdir(parents=True, exist_ok=True)
    models: List[Dict[str, Any]] = []
    for child in sorted(LIVE2D_ROOT.iterdir(), key=lambda p: p.name.lower()):
        if not child.is_dir():
            continue
        if child.name.startswith("."):
            continue
        if not _is_valid_live2d_folder(child):
            continue
        try:
            models.append(_extract_live2d_metadata(child))
        except Exception as exc:
            logger.warning("读取 Live2D 模型失败: %s (%s)", child.name, exc)
    return models


def _refresh_desktop_pet_models_cache(models: List[Dict[str, Any]] | None = None) -> List[Dict[str, Any]]:
    models = models if models is not None else _scan_live2d_models()
    _write_json_file(
        DESKTOP_PET_MODELS_CACHE_FILE,
        {
            "models": models,
            "updated_at": int(time.time() * 1000),
        },
    )
    return models


def _read_desktop_pet_runtime_file() -> Dict[str, Any]:
    raw = _read_json_file(DESKTOP_PET_RUNTIME_FILE)
    return raw if isinstance(raw, dict) else {}


def _process_exists(pid: int) -> bool:
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except PermissionError:
        return True
    except OSError:
        return False
    return True


def _resolve_live2d_model_dir(model_id: str) -> Path:
    safe_id = _sanitize_model_id(model_id)
    model_dir = LIVE2D_ROOT / safe_id
    real_model_dir = model_dir.resolve()
    real_root = LIVE2D_ROOT.resolve()
    if not str(real_model_dir).startswith(str(real_root)):
        raise HTTPException(400, "非法模型路径")
    if not real_model_dir.is_dir():
        raise HTTPException(404, "模型不存在")
    return real_model_dir


def _desktop_pet_process_running() -> bool:
    global _desktop_pet_process
    if _desktop_pet_process is None:
        return False
    if _desktop_pet_process.poll() is not None:
        _desktop_pet_process = None
        return False
    return True


def _desktop_pet_status() -> Dict[str, Any]:
    running = _desktop_pet_process_running()
    mgr = _get_p_config()
    mgr.reload_if_changed()
    stored_electron_path = str(mgr.get("desktop_pet.exe_path", "") or "").strip()
    return {
        "running": running,
        "pid": _desktop_pet_process.pid if running and _desktop_pet_process else None,
        "started_at": _desktop_pet_started_at if running else None,
        "electron_path": stored_electron_path or None,
    }


def _resolve_backend_url() -> str:
    mgr = _get_p_config()
    mgr.reload_if_changed()
    host = mgr.get("webui.host", "127.0.0.1")
    port = int(mgr.get("webui.port", 10086))
    if host in {"0.0.0.0", "::"}:
        host = "127.0.0.1"
    return f"http://{host}:{port}"


def _build_desktop_pet_runtime_payload() -> Dict[str, Any]:
    mgr = _get_p_config()
    mgr.reload_if_changed()
    current = _read_desktop_pet_runtime_file()
    status = _desktop_pet_status()
    return {
        **current,
        "backend_url": _resolve_backend_url(),
        "auth_token": str(mgr.get("webui.webui_token", "") or ""),
        "running": status["running"],
        "pid": status["pid"],
        "started_at": status["started_at"],
        "updated_at": int(time.time() * 1000),
    }


def _refresh_desktop_pet_runtime(payload: Dict[str, Any] | None = None) -> Dict[str, Any]:
    data = payload if payload is not None else _build_desktop_pet_runtime_payload()
    _write_json_file(DESKTOP_PET_RUNTIME_FILE, data)
    return data


def _desktop_pet_settings_owned_by_electron() -> bool:
    runtime = _read_desktop_pet_runtime_file()
    if not bool(runtime.get("electron_running")):
        return False
    if str(runtime.get("settings_owner", "")).strip().lower() != "electron":
        return False
    pid = int(runtime.get("electron_pid") or 0)
    return _process_exists(pid)


def _tail_text_file(path: Path, max_lines: int = 40) -> str:
    if not path.exists() or not path.is_file():
        return ""
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return ""
    lines = [line for line in text.splitlines() if line.strip()]
    if not lines:
        return ""
    return "\n".join(lines[-max_lines:])


def _build_widget_tips_payload(settings: Dict[str, Any] | None = None, models: List[Dict[str, Any]] | None = None) -> Dict[str, Any]:
    settings = settings or _read_desktop_pet_settings()
    models = models or _scan_live2d_models()
    persona = settings.get("persona", {}) if isinstance(settings.get("persona"), dict) else {}
    name = str(persona.get("name", "")).strip() or "桌宠"
    tone = str(persona.get("tone", "")).strip()
    greeting = str(persona.get("greeting", "")).strip()
    tips_models: List[Dict[str, Any]] = []
    selected_index = 0
    selected_model_id = str(settings.get("model_id", "")).strip()
    for idx, item in enumerate(models):
        model_id = str(item.get("model_id", "")).strip()
        model_json_url = str(item.get("model_json_url", "")).strip()
        if not model_id or not model_json_url:
            continue
        if model_id == selected_model_id:
            selected_index = len(tips_models)
        tips_models.append(
            {
                "name": model_id,
                "paths": [model_json_url],
                "message": f"已切换到 {model_id}",
            }
        )

    return {
        "mouseover": [
            {"selector": "#waifu-tool-switch-model", "text": ["切换到另一个模型"]},
            {"selector": "#waifu-tool-switch-texture", "text": ["尝试切换服装或动作"]},
            {"selector": "#waifu-tool-photo", "text": ["给我拍一张照片吧"]},
            {"selector": "#waifu-tool-quit", "text": ["先暂时隐藏我"]},
        ],
        "click": [],
        "seasons": [],
        "time": [
            {"hour": "6-11", "text": f"早上好，我是{name}，今天也一起把事情做好。"},
            {"hour": "12-17", "text": (f"下午好，我会用\\u201c{tone}\\u201d的风格陪你。" if tone else f"下午好，我是{name}。")},
            {"hour": "18-23", "text": "晚上好，记得适当休息。"},
            {"hour": "0-5", "text": "夜深了，注意护眼。"},
        ],
        "message": {
            "default": ([greeting] if greeting else []) + [f"{name} 已上线。", "双击我可以打开设置面板。"],
            "console": "欢迎调试。",
            "copy": "复制完成。",
            "visibilitychange": "欢迎回来。",
            "changeSuccess": "切换完成。",
            "changeFail": "当前模型没有可切换资源。",
            "photo": "拍照完成。",
            "goodbye": "下次见。",
            "hitokoto": "来自 $1 · $2",
            "welcome": "欢迎来到 $1",
            "referrer": "来自 $1 的朋友你好。",
            "hoverBody": ["可以双击我打开设置。", "有问题就直接问我。"],
            "tapBody": ["我在。", "继续。"],
        },
        "models": tips_models,
        "selected_index": selected_index,
    }


# ── P-config 读写 ──

@router.get("/p-config", dependencies=[Depends(require_admin)])
async def get_p_config():
    mgr = _get_p_config()
    mgr.reload_if_changed()
    return {"success": True, "data": mgr.config}


class PConfigUpdateRequest(BaseModel):
    updates: Dict[str, Any]  # {"logging.log_rotation_days": 30, ...}


@router.post("/p-config", dependencies=[Depends(require_admin)])
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

@router.get("/token/current", dependencies=[Depends(require_admin)])
async def get_current_token():
    mgr = _get_p_config()
    mgr.reload_if_changed()
    token = mgr.get("webui.webui_token", "")
    _refresh_desktop_pet_runtime()
    return {"success": True, "token": token}


class TokenChangeRequest(BaseModel):
    new_token: str = ""


@router.post("/token/change", dependencies=[Depends(require_admin)])
async def change_token(req: TokenChangeRequest):
    token = req.new_token.strip()
    if not token:
        token = secrets.token_hex(16)
    if len(token) < 8:
        raise HTTPException(400, "Token 长度不能少于 8 个字符")
    mgr = _get_p_config()
    mgr.set("webui.webui_token", token)
    mgr.save()
    _refresh_desktop_pet_runtime()
    return {"success": True, "token": token}


# ── 背景文件管理 ──

def _safe_filename(filename: str) -> str:
    return os.path.basename(filename).strip()


def _safe_file_path(base_dir: str, filename: str) -> str:
    fp = os.path.join(base_dir, filename)
    real_fp = os.path.realpath(fp)
    real_base = os.path.realpath(base_dir)
    if not real_fp.startswith(real_base + os.sep):
        raise HTTPException(400, "非法文件路径")
    return fp


def _resolve_ffmpeg_path() -> str | None:
    candidates = [
        PROJECT_ROOT / "bin" / "ffmpeg.exe",
        PROJECT_ROOT / "bin" / "ffmpeg",
    ]
    for candidate in candidates:
        if candidate.is_file():
            return str(candidate)
    return shutil.which("ffmpeg")


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


@router.post("/backgrounds/upload", dependencies=[Depends(require_admin)])
async def upload_background(file: UploadFile = File(...)):
    safe_name = _safe_filename(file.filename or "upload")
    if not safe_name:
        raise HTTPException(400, "非法文件名")
    ext = os.path.splitext(safe_name)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"不支持的文件类型: {ext}")

    max_file_size = MAX_VIDEO_FILE_SIZE if ext in VIDEO_EXTENSIONS else MAX_IMAGE_FILE_SIZE
    os.makedirs(BACKGROUNDS_DIR, exist_ok=True)
    dest = _safe_file_path(BACKGROUNDS_DIR, safe_name)
    written = 0
    chunk_size = 1024 * 1024  # 1MB

    try:
        with open(dest, "wb") as f:
            while True:
                chunk = await file.read(chunk_size)
                if not chunk:
                    break
                written += len(chunk)
                if written > max_file_size:
                    raise HTTPException(400, "视频文件大小超过600MB限制" if ext in VIDEO_EXTENSIONS else "图片文件大小超过50MB限制")
                f.write(chunk)
    except Exception:
        if os.path.exists(dest):
            try:
                os.remove(dest)
            except OSError:
                pass
        raise
    finally:
        await file.close()

    return {"success": True, "filename": safe_name}


@router.get("/backgrounds/thumbnail/{filename}")
async def get_background_thumbnail(
    filename: str,
    w: int = Query(320, ge=THUMB_MIN_SIZE, le=THUMB_MAX_SIZE),
    h: int = Query(180, ge=THUMB_MIN_SIZE, le=THUMB_MAX_SIZE),
):
    safe_name = _safe_filename(filename)
    if not safe_name:
        raise HTTPException(400, "非法文件名")
    ext = os.path.splitext(safe_name)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"不支持的文件类型: {ext}")
    is_video = ext in VIDEO_EXTENSIONS

    os.makedirs(BACKGROUNDS_DIR, exist_ok=True)
    os.makedirs(THUMB_CACHE_DIR, exist_ok=True)

    src = _safe_file_path(BACKGROUNDS_DIR, safe_name)
    if not os.path.isfile(src):
        raise HTTPException(404, "文件不存在")

    src_stat = os.stat(src)
    thumb_ext = "jpg" if is_video else "webp"
    cache_name = f"{safe_name}.{int(src_stat.st_mtime)}.{src_stat.st_size}.{w}x{h}.{thumb_ext}"
    thumb_path = _safe_file_path(THUMB_CACHE_DIR, cache_name)

    if not os.path.exists(thumb_path):
        if is_video:
            ffmpeg_path = _resolve_ffmpeg_path()
            if not ffmpeg_path:
                raise HTTPException(500, "未找到ffmpeg，无法生成视频缩略图")
            vf = f"select=eq(n\\,0),scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}"
            cmd = [
                ffmpeg_path,
                "-y",
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                src,
                "-vf",
                vf,
                "-frames:v",
                "1",
                thumb_path,
            ]
            try:
                subprocess.run(cmd, check=True, capture_output=True, text=True)
            except subprocess.CalledProcessError as e:
                logger.warning("视频缩略图生成失败: %s (%s)", safe_name, (e.stderr or e.stdout or str(e)).strip())
                raise HTTPException(500, "视频缩略图生成失败")
            if not os.path.isfile(thumb_path) or os.path.getsize(thumb_path) == 0:
                raise HTTPException(500, "视频缩略图生成失败")
        else:
            try:
                with Image.open(src) as im:
                    frame = ImageOps.exif_transpose(im)
                    if getattr(frame, "is_animated", False):
                        frame.seek(0)
                    thumb = ImageOps.fit(frame.convert("RGB"), (w, h), method=Image.Resampling.LANCZOS)
                    thumb.save(thumb_path, format="WEBP", quality=82, method=6)
            except Exception as e:
                logger.warning("生成背景缩略图失败: %s (%s)", safe_name, e)
                raise HTTPException(500, "缩略图生成失败")

    return FileResponse(thumb_path, media_type="image/jpeg" if is_video else "image/webp")


@router.delete("/backgrounds/{filename}", dependencies=[Depends(require_admin)])
async def delete_background(filename: str):
    safe_name = _safe_filename(filename)
    if not safe_name:
        raise HTTPException(400, "非法文件名")
    fp = _safe_file_path(BACKGROUNDS_DIR, safe_name)
    if not os.path.isfile(fp):
        raise HTTPException(404, "文件不存在")
    os.remove(fp)
    if os.path.isdir(THUMB_CACHE_DIR):
        prefix = f"{safe_name}."
        for name in os.listdir(THUMB_CACHE_DIR):
            if not name.startswith(prefix):
                continue
            thumb_fp = _safe_file_path(THUMB_CACHE_DIR, name)
            if os.path.isfile(thumb_fp):
                try:
                    os.remove(thumb_fp)
                except OSError:
                    pass
    return {"success": True, "deleted": safe_name}


# ── Live2D 模型管理 ──

@router.get("/live2d/widget/tips.json")
async def get_live2d_widget_tips():
    settings = _read_desktop_pet_settings()
    models = _scan_live2d_models()
    return _build_widget_tips_payload(settings, models)


@router.get("/live2d/models", dependencies=[Depends(require_action("misc.desktop-pet.access"))])
async def list_live2d_models():
    models = _refresh_desktop_pet_models_cache()
    return {"success": True, "models": models}


@router.post("/live2d/import", dependencies=[Depends(require_admin)])
async def import_live2d_model(
    files: List[UploadFile] = File(...),
    folder_name: str = Form(""),
):
    if not files:
        raise HTTPException(400, "未提供文件")

    LIVE2D_ROOT.mkdir(parents=True, exist_ok=True)
    temp_root = LIVE2D_ROOT / f".import_{uuid4().hex}"
    temp_root.mkdir(parents=True, exist_ok=True)

    normalized_names: List[str] = []
    for f in files:
        name = (f.filename or "").replace("\\", "/").strip("/")
        if name and not name.endswith("/"):
            normalized_names.append(name)
    if not normalized_names:
        shutil.rmtree(temp_root, ignore_errors=True)
        raise HTTPException(400, "文件列表为空")

    inferred_root = normalized_names[0].split("/")[0] if "/" in normalized_names[0] else Path(normalized_names[0]).stem
    model_name = _safe_folder_name(folder_name or inferred_root)
    import_dir = temp_root / model_name
    import_dir.mkdir(parents=True, exist_ok=True)

    try:
        for up in files:
            raw_name = (up.filename or "").replace("\\", "/").strip("/")
            if not raw_name or raw_name.endswith("/"):
                await up.close()
                continue
            parts = [p for p in raw_name.split("/") if p not in {"", ".", ".."}]
            if not parts:
                await up.close()
                continue

            if len(parts) > 1 and parts[0] == inferred_root:
                rel_parts = parts[1:]
            elif len(parts) > 1:
                rel_parts = parts
            else:
                rel_parts = [parts[0]]
            if not rel_parts:
                await up.close()
                continue

            dest = import_dir.joinpath(*rel_parts)
            resolved_dest = dest.resolve()
            if not str(resolved_dest).startswith(str(import_dir.resolve())):
                await up.close()
                raise HTTPException(400, "检测到非法路径")
            dest.parent.mkdir(parents=True, exist_ok=True)

            written = 0
            with open(dest, "wb") as out:
                while True:
                    chunk = await up.read(1024 * 1024)
                    if not chunk:
                        break
                    written += len(chunk)
                    if written > LIVE2D_IMPORT_MAX_FILE_SIZE:
                        raise HTTPException(400, f"文件过大: {raw_name}")
                    out.write(chunk)
            await up.close()

        if not _is_valid_live2d_folder(import_dir):
            raise HTTPException(400, "导入失败：文件夹内未检测到 .moc 或 .moc3 文件")

        target_dir = LIVE2D_ROOT / model_name
        if target_dir.exists():
            idx = 1
            while (LIVE2D_ROOT / f"{model_name}_{idx}").exists():
                idx += 1
            target_dir = LIVE2D_ROOT / f"{model_name}_{idx}"

        shutil.move(str(import_dir), str(target_dir))
        model = _extract_live2d_metadata(target_dir)
        _refresh_desktop_pet_models_cache()
        return {"success": True, "model": model}
    finally:
        shutil.rmtree(temp_root, ignore_errors=True)


@router.post("/live2d/models/{model_id}/cover", dependencies=[Depends(require_admin)])
async def upload_live2d_cover(model_id: str, file: UploadFile = File(...)):
    model_dir = _resolve_live2d_model_dir(model_id)
    safe_name = _safe_filename(file.filename or "cover.png")
    ext = Path(safe_name).suffix.lower()
    if ext not in LIVE2D_COVER_EXTENSIONS:
        raise HTTPException(400, f"不支持的封面类型: {ext}")
    for old_ext in LIVE2D_COVER_EXTENSIONS:
        old = model_dir / f"{LIVE2D_CUSTOM_COVER_PREFIX}{old_ext}"
        if old.exists():
            try:
                old.unlink()
            except OSError:
                pass
    target = model_dir / f"{LIVE2D_CUSTOM_COVER_PREFIX}{ext}"
    try:
        with open(target, "wb") as f:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                f.write(chunk)
    finally:
        await file.close()
    _refresh_desktop_pet_models_cache()
    return {"success": True, "cover_url": _to_live2d_public_url(target)}


@router.delete("/live2d/models/{model_id}", dependencies=[Depends(require_admin)])
async def delete_live2d_model(model_id: str):
    model_dir = _resolve_live2d_model_dir(model_id)
    try:
        shutil.rmtree(model_dir)
    except OSError as exc:
        raise HTTPException(500, f"删除模型失败: {exc}") from exc
    _refresh_desktop_pet_models_cache()
    return {"success": True, "deleted": model_dir.name}


class DesktopPetSettingsBody(BaseModel):
    value: Dict[str, Any]


@router.get("/live2d/settings", dependencies=[Depends(require_action("misc.desktop-pet.access"))])
async def get_desktop_pet_settings():
    return {"success": True, "value": _read_desktop_pet_settings()}


@router.put("/live2d/settings", dependencies=[Depends(require_admin)])
async def update_desktop_pet_settings(body: DesktopPetSettingsBody):
    if _desktop_pet_settings_owned_by_electron():
        raise HTTPException(409, "桌宠运行中，请在桌宠内置面板中修改配置")
    current = _read_stored_desktop_pet_settings()
    merged = _deep_merge(current, body.value or {})
    normalized = _write_desktop_pet_settings(merged)
    return {"success": True, "value": _resolve_effective_desktop_pet_settings(normalized)}


class DesktopPetOverlaySettingsBody(BaseModel):
    model_id: str = ""
    ai_enabled: bool | None = None
    persona: Dict[str, Any] = {}
    scale: float | None = None


@router.post("/live2d/overlay/settings", dependencies=[Depends(require_action("misc.desktop-pet.access"))])
async def update_desktop_pet_overlay_settings(body: DesktopPetOverlaySettingsBody):
    if _desktop_pet_settings_owned_by_electron():
        raise HTTPException(409, "桌宠运行中，请在桌宠内置面板中修改配置")
    current = _read_stored_desktop_pet_settings()
    next_model_id = (body.model_id or "").strip()
    if next_model_id:
        _resolve_live2d_model_dir(next_model_id)
        current["model_id"] = next_model_id
    if body.ai_enabled is not None:
        current["ai_enabled"] = bool(body.ai_enabled)
    if body.scale is not None:
        current["scale"] = float(body.scale)

    persona_patch = body.persona if isinstance(body.persona, dict) else {}
    target_model_id = str(current.get("model_id", "")).strip()
    if target_model_id and persona_patch:
        current["model_overrides"] = current.get("model_overrides", {}) if isinstance(current.get("model_overrides"), dict) else {}
        override = current["model_overrides"].get(target_model_id, {}) if isinstance(current["model_overrides"].get(target_model_id), dict) else {}
        persona = override.get("persona", current.get("persona", {})) if isinstance(override.get("persona"), dict) else current.get("persona", {})
        persona = _normalize_persona_settings(persona)
        if "name" in persona_patch:
            persona["name"] = str(persona_patch.get("name", "")).strip()
        if "tone" in persona_patch:
            persona["tone"] = str(persona_patch.get("tone", "")).strip()
        if "greeting" in persona_patch:
            persona["greeting"] = str(persona_patch.get("greeting", "")).strip()
        if "system_prompt" in persona_patch:
            persona["system_prompt"] = str(persona_patch.get("system_prompt", "")).strip()
        override["persona"] = persona
        current["model_overrides"][target_model_id] = override

    normalized = _write_desktop_pet_settings(current)
    return {"success": True, "value": _resolve_effective_desktop_pet_settings(normalized)}


class DesktopPetChatBody(BaseModel):
    message: str


def _build_persona_reply(message: str, settings: Dict[str, Any]) -> str:
    persona = settings.get("persona", {})
    name = str(persona.get("name", "")).strip() or "桌宠"
    tone = str(persona.get("tone", "")).strip()
    style_text = f"我会用“{tone}”的风格陪你一起完成任务。" if tone else "我会陪你一起把事情推进下去。"
    prefix = f"{name}（{tone}）" if tone else name
    msg = (message or "").strip()
    if not msg:
        return f"{name}：我在呢，你可以直接告诉我你想做什么。"
    lowered = msg.lower()
    if any(key in lowered for key in ("你好", "hello", "hi")):
        return f"{name}：你好呀，{style_text}"
    if any(key in lowered for key in ("谢谢", "thanks", "thx")):
        return f"{name}：不客气，继续把今天的目标推进下去吧。"
    return f"{prefix}：我收到了\u300c{msg}\u300d。如果你愿意，我可以把它拆成可执行步骤。"


@router.post("/live2d/chat", dependencies=[Depends(require_action("misc.desktop-pet.access"))])
async def desktop_pet_chat(body: DesktopPetChatBody):
    settings = _read_desktop_pet_settings()
    if not settings.get("ai_enabled", True):
        raise HTTPException(400, "AI 交互当前已关闭")

    # 尝试使用新的AI聊天服务
    try:
        from src.core.p_config import p_config_manager
        from src.core.llm_client import LLMClient
        from src.core.pet_database import PetDatabase
        from src.services.pet_chat_service import PetChatService

        llm_config = p_config_manager.get_llm_config()
        llm_client = LLMClient(llm_config)

        # 如果LLM已配置，使用AI服务
        if llm_client.is_configured():
            pet_db = PetDatabase()
            chat_service = PetChatService(llm_client, pet_db)
            result = await chat_service.chat(body.message, settings)
            return {"success": True, "reply": result["reply"], "actions": result.get("actions", [])}
    except Exception as e:
        logger.warning("AI聊天服务失败，降级到规则匹配: %s", e)

    # 降级到原有的规则匹配
    reply = _build_persona_reply(body.message, settings)
    return {"success": True, "reply": reply}


class FaceCaptureFrameBody(BaseModel):
    yaw: float = 0.0
    pitch: float = 0.0
    roll: float = 0.0
    eye_open_left: float = 1.0
    eye_open_right: float = 1.0
    mouth_open: float = 0.0


@router.post("/live2d/face-capture/frame", dependencies=[Depends(require_action("misc.desktop-pet.access"))])
async def push_face_capture_frame(body: FaceCaptureFrameBody):
    _face_capture_state.update(
        {
            "timestamp": int(time.time() * 1000),
            "yaw": float(body.yaw),
            "pitch": float(body.pitch),
            "roll": float(body.roll),
            "eye_open_left": float(_clamp(body.eye_open_left, 0.0, 1.0)),
            "eye_open_right": float(_clamp(body.eye_open_right, 0.0, 1.0)),
            "mouth_open": float(_clamp(body.mouth_open, 0.0, 1.0)),
        }
    )
    return {"success": True}


@router.get("/live2d/face-capture/state", dependencies=[Depends(require_action("misc.desktop-pet.access"))])
async def get_face_capture_state():
    return {"success": True, "state": _face_capture_state}


class RuntimePositionBody(BaseModel):
    x: int
    y: int


@router.post("/live2d/runtime/position", dependencies=[Depends(require_action("misc.desktop-pet.access"))])
async def update_runtime_position(body: RuntimePositionBody):
    settings = _read_stored_desktop_pet_settings()
    settings["position"]["x"] = int(body.x)
    settings["position"]["y"] = int(body.y)
    normalized = _write_desktop_pet_settings(settings)
    return {"success": True, "position": normalized["position"]}


@router.get("/live2d/runtime/status", dependencies=[Depends(require_action("misc.desktop-pet.access"))])
async def desktop_pet_runtime_status():
    runtime = _refresh_desktop_pet_runtime()
    return {"success": True, **runtime}


@router.post("/live2d/runtime/start", dependencies=[Depends(require_admin)])
async def start_desktop_pet_runtime():
    global _desktop_pet_process, _desktop_pet_started_at
    if _desktop_pet_process_running():
        return {"success": True, "already_running": True, **_desktop_pet_status()}

    settings = _read_desktop_pet_settings()
    mgr = _get_p_config()
    auth_token = mgr.get("webui.webui_token", "")
    backend_url = _resolve_backend_url()

    window = settings.get("window", {})
    pos = settings.get("position", {})

    # 检测 Electron 可执行文件（使用智能查找）
    electron_exe = _find_electron_exe()

    env = None
    if electron_exe is not None:
        # 启动 Electron 应用
        # --no-sandbox: Electron 作为 Python 子进程运行时必须绕过 Chromium 沙盒
        cmd = [
            str(electron_exe),
            "--no-sandbox",
        ]
        env = os.environ.copy()
        env["MAICORE_BACKEND_URL"] = backend_url
        env["MAICORE_PET_POSITION"] = f"{int(pos.get('x', 80))},{int(pos.get('y', 120))}"
        env["MAICORE_PET_SIZE"] = f"{int(window.get('width', 360))}x{int(window.get('height', 520))}"
        if auth_token:
            env["MAICORE_AUTH_TOKEN"] = auth_token
        logger.info("启动Electron桌宠: %s", " ".join(cmd))
    else:
        # Fallback 到 pywebview（开发模式或未构建）
        logger.warning("Electron应用未构建，使用pywebview fallback")
        cmd = [
            sys.executable,
            "-m",
            "src.modules.desktop_pet_overlay",
            "--url",
            f"{backend_url}/desktop-pet/index.html?v={int(time.time() * 1000)}",
            "--x",
            str(int(pos.get("x", 80))),
            "--y",
            str(int(pos.get("y", 120))),
            "--width",
            str(int(window.get("width", 360))),
            "--height",
            str(int(window.get("height", 520))),
            "--position-report-url",
            f"{backend_url}/api/settings/live2d/runtime/position",
        ]
        if window.get("always_on_top", True):
            cmd.append("--always-on-top")
        if window.get("transparent", True):
            cmd.append("--transparent")

    creationflags = 0
    if os.name == "nt":
        creationflags = subprocess.CREATE_NEW_PROCESS_GROUP

    try:
        DESKTOP_PET_OVERLAY_LOG.parent.mkdir(parents=True, exist_ok=True)
        with open(DESKTOP_PET_OVERLAY_LOG, "a", encoding="utf-8") as log_fp:
            log_fp.write(f"\n==== desktop pet start {time.strftime('%Y-%m-%d %H:%M:%S')} ====\n")
            log_fp.write("cmd: " + " ".join(cmd) + "\n")
            log_fp.flush()
            _desktop_pet_process = subprocess.Popen(
                cmd,
                cwd=str(PROJECT_ROOT),
                stdin=subprocess.DEVNULL,
                stdout=log_fp,
                stderr=log_fp,
                env=env,
                creationflags=creationflags,
            )
    except Exception as exc:
        raise HTTPException(500, f"启动桌宠窗口失败: {exc}") from exc

    # Electron 启动比 pywebview 慢，等待时间需要更长
    wait_time = 1.5 if electron_exe is not None else 0.35
    time.sleep(wait_time)
    if _desktop_pet_process.poll() is not None:
        code = _desktop_pet_process.returncode
        _desktop_pet_process = None
        tail = _tail_text_file(DESKTOP_PET_OVERLAY_LOG)
        detail = f"桌宠窗口启动失败（退出码: {code}）。"
        if tail:
            detail += f"\n最近日志：\n{tail}"
        else:
            detail += "请确认已安装 pywebview 并可用。"
        raise HTTPException(500, detail)

    _desktop_pet_started_at = time.time()
    settings["enabled"] = True
    _write_desktop_pet_settings(settings)
    _refresh_desktop_pet_runtime()
    _append_usage_session_start()
    return {"success": True, **_desktop_pet_status()}


@router.post("/live2d/runtime/stop", dependencies=[Depends(require_admin)])
async def stop_desktop_pet_runtime():
    global _desktop_pet_process
    if not _desktop_pet_process_running():
        return {"success": True, "already_stopped": True}
    assert _desktop_pet_process is not None
    try:
        _desktop_pet_process.terminate()
        _desktop_pet_process.wait(timeout=3)
    except Exception:
        try:
            _desktop_pet_process.kill()
        except Exception:
            pass
    finally:
        _desktop_pet_process = None

    settings = _read_stored_desktop_pet_settings()
    settings["enabled"] = False
    _write_desktop_pet_settings(settings)
    _refresh_desktop_pet_runtime()
    _update_usage_session_end()
    return {"success": True}


@router.get("/live2d/electron/status", dependencies=[Depends(require_admin)])
async def get_electron_build_status():
    """检查Electron应用是否已构建（兼容旧端点）"""
    exe = _find_electron_exe()
    return {
        "success": True,
        "built": exe is not None,
        "path": str(exe) if exe else None,
        "message": "Electron 应用已构建" if exe else "请运行: cd desktop_pet_frontend && npm run build"
    }


@router.get("/live2d/electron/find", dependencies=[Depends(require_admin)])
async def find_electron_exe_endpoint():
    """智能查找 Electron exe 路径"""
    exe = _find_electron_exe()
    return {
        "success": True,
        "found": exe is not None,
        "path": str(exe) if exe else None,
    }


class ElectronExePathBody(BaseModel):
    path: str


@router.post("/live2d/electron/set-path", dependencies=[Depends(require_admin)])
async def set_electron_exe_path(body: ElectronExePathBody):
    """手动设置 Electron exe 路径"""
    p = Path(body.path.strip())
    if not p.exists():
        raise HTTPException(400, f"路径不存在: {p}")
    mgr = _get_p_config()
    mgr.set("desktop_pet.exe_path", str(p))
    mgr.save()
    return {"success": True, "path": str(p)}


@router.get("/live2d/usage-stats", dependencies=[Depends(require_action("misc.desktop-pet.access"))])
async def get_usage_stats():
    """获取桌宠使用时长统计"""
    from datetime import datetime, timezone, timedelta

    data = _read_usage_log()
    sessions = data.get("sessions", [])
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    recent_cutoff = today_start - timedelta(days=210)

    def parse_dt(s: str | None):
        if not s:
            return None
        try:
            return datetime.fromisoformat(s)
        except Exception:
            return None

    def session_minutes(start_str, end_str):
        start = parse_dt(start_str)
        if not start:
            return 0.0
        end = parse_dt(end_str) if end_str else now
        delta = (end - start).total_seconds()
        return max(0.0, delta / 60)

    week_start = today_start - timedelta(days=today_start.weekday())
    month_start = today_start.replace(day=1)

    today_minutes = 0.0
    week_minutes = 0.0
    month_minutes = 0.0
    current_session_minutes = 0.0
    recent_sessions: list[dict[str, Any]] = []

    # 7日每天统计
    daily_map: dict[str, float] = {}
    for i in range(7):
        day = (today_start - timedelta(days=6 - i)).date()
        daily_map[str(day)] = 0.0

    for sess in sessions:
        start = parse_dt(sess.get("start"))
        if not start:
            continue
        end_str = sess.get("end")
        end = parse_dt(end_str) if end_str else now
        mins = max(0.0, (end - start).total_seconds() / 60)

        if start.date() >= today_start.date():
            today_minutes += mins
        if start >= week_start:
            week_minutes += mins
        if start >= month_start:
            month_minutes += mins

        if not end_str and _desktop_pet_started_at:
            current_session_minutes = (time.time() - _desktop_pet_started_at) / 60

        # 按日拆分（跨天简化处理：归属到开始日期）
        day_key = str(start.date())
        if day_key in daily_map:
            daily_map[day_key] += mins

        if start >= recent_cutoff:
            recent_sessions.append({
                "start": start.isoformat(),
                "end": end.isoformat() if end_str else None,
                "minutes": round(mins),
            })

    daily = [{"date": d, "minutes": round(m)} for d, m in sorted(daily_map.items())]

    return {
        "success": True,
        "today_minutes": round(today_minutes),
        "week_minutes": round(week_minutes),
        "month_minutes": round(month_minutes),
        "daily": daily,
        "daily_stats": daily,
        "sessions": recent_sessions,
        "running": _desktop_pet_process_running(),
        "current_session_minutes": round(current_session_minutes),
    }


# ==================== LLM配置管理 ====================

class LLMConfigBody(BaseModel):
    value: Dict[str, Any]


@router.get("/llm-config", dependencies=[Depends(require_admin)])
async def get_llm_config():
    """获取LLM配置"""
    from src.core.p_config import p_config_manager
    config = deepcopy(p_config_manager.get_llm_config())
    # 隐藏 API Key，只显示是否已配置
    if config.get("api_key"):
        config["api_key"] = "***已配置***"
    else:
        config["api_key"] = ""
    return {"success": True, "value": config}


@router.put("/llm-config", dependencies=[Depends(require_admin)])
async def update_llm_config(body: LLMConfigBody):
    """更新LLM配置"""
    from src.core.p_config import p_config_manager

    current_config = deepcopy(p_config_manager.get_llm_config())
    next_config = deepcopy(body.value or {})

    # 如果 api_key 是占位符，保留原有值
    if next_config.get("api_key") == "***已配置***":
        next_config["api_key"] = current_config.get("api_key", "")

    api_key = str(next_config.get("api_key", "") or "").strip()
    if api_key and not api_key.isascii():
        raise HTTPException(400, "API Key 只能包含 ASCII 字符，请重新粘贴原始密钥")
    next_config["api_key"] = api_key

    # 更新配置
    for key, value in next_config.items():
        p_config_manager.set(f"llm.{key}", value)

    # 保存到文件
    p_config_manager.save()

    # 广播给所有 Electron 桌宠 WebSocket 客户端
    await settings_ws_manager.broadcast({"type": "pet_settings_updated"})

    return {"success": True, "message": "LLM 配置已更新"}
