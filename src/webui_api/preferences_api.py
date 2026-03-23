# -*- coding: utf-8 -*-
"""用户偏好存储 API - SQLite 键值存储"""
import json
import sqlite3
import logging
from pathlib import Path
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Any

router = APIRouter()
logger = logging.getLogger(__name__)

DB_PATH = Path(__file__).parent.parent.parent / "data" / "user_preferences.db"
DEFAULT_USER_ID = "default"
DEFAULT_BG_SETTINGS = {
    "interval_minutes": 5,
    "pinned_file": "",
    "overlay_opacity": 0.5,
    "overlay_blur": 0,
    "overlay_color": "255,255,255",
    "overlay_color_auto": True,
    "use_custom_background": False,
}
DEFAULT_THEME_SETTINGS = {
    "mode": "system",
}
DEFAULT_PREFERENCES = {
    "bg_settings": DEFAULT_BG_SETTINGS,
    "theme_settings": DEFAULT_THEME_SETTINGS,
}


def _ensure_schema_and_defaults(conn: sqlite3.Connection) -> None:
    conn.execute("""
        CREATE TABLE IF NOT EXISTS preferences (
            user_id TEXT NOT NULL DEFAULT 'default',
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            PRIMARY KEY (user_id, key)
        )
    """)
    for key, value in DEFAULT_PREFERENCES.items():
        conn.execute(
            "INSERT OR IGNORE INTO preferences (user_id, key, value) VALUES (?, ?, ?)",
            (DEFAULT_USER_ID, key, json.dumps(value, ensure_ascii=False))
        )


def _initialize_db_on_startup() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    try:
        _ensure_schema_and_defaults(conn)
        conn.commit()
    finally:
        conn.close()


try:
    _initialize_db_on_startup()
except Exception:
    logger.exception("初始化用户偏好数据库失败")

def _get_conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    _ensure_schema_and_defaults(conn)
    conn.commit()
    return conn

class PrefBody(BaseModel):
    value: Any

@router.get("/{key}")
async def get_preference(key: str, user_id: str = "default"):
    """获取偏好值"""
    conn = _get_conn()
    try:
        row = conn.execute(
            "SELECT value FROM preferences WHERE user_id=? AND key=?",
            (user_id, key)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="not found")
        return {"key": key, "value": json.loads(row[0])}
    finally:
        conn.close()

@router.put("/{key}")
async def set_preference(key: str, body: PrefBody, user_id: str = "default"):
    """设置偏好值"""
    conn = _get_conn()
    try:
        conn.execute(
            "INSERT OR REPLACE INTO preferences (user_id, key, value) VALUES (?, ?, ?)",
            (user_id, key, json.dumps(body.value, ensure_ascii=False))
        )
        conn.commit()
        return {"success": True}
    finally:
        conn.close()

@router.delete("/{key}")
async def delete_preference(key: str, user_id: str = "default"):
    """删除偏好值"""
    conn = _get_conn()
    try:
        conn.execute(
            "DELETE FROM preferences WHERE user_id=? AND key=?",
            (user_id, key)
        )
        conn.commit()
        return {"success": True}
    finally:
        conn.close()
