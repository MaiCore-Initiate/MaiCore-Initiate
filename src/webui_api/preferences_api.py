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

def _get_conn() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("""
        CREATE TABLE IF NOT EXISTS preferences (
            user_id TEXT NOT NULL DEFAULT 'default',
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            PRIMARY KEY (user_id, key)
        )
    """)
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
