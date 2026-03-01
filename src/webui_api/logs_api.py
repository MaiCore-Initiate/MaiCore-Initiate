# -*- coding: utf-8 -*-
"""日志查看API模块"""
import os
import json
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, HTTPException, Query

router = APIRouter()
LOG_DIR = Path("log")


@router.get("/files", summary="列出所有日志文件")
async def list_log_files():
    if not LOG_DIR.is_dir():
        return {"success": True, "files": []}

    files = []
    for f in LOG_DIR.glob("*.jsonl"):
        name = f.name
        stem = f.stem
        # 判断类型并解析日期
        if stem.startswith("webui_"):
            log_type = "webui"
            try:
                date = datetime.strptime(stem[6:], "%Y-%m-%d").isoformat()
            except ValueError:
                date = ""
        else:
            log_type = "main"
            try:
                date = datetime.strptime(stem, "%Y-%m-%d_%H-%M-%S").isoformat()
            except ValueError:
                date = ""

        files.append({
            "name": name,
            "size": f.stat().st_size,
            "date": date,
            "type": log_type,
        })

    files.sort(key=lambda x: x["date"], reverse=True)
    return {"success": True, "files": files}


def _normalize_main(line: dict) -> dict:
    return {
        "timestamp": line.get("timestamp", ""),
        "level": str(line.get("level", "")).upper(),
        "logger": line.get("logger", ""),
        "message": str(line.get("event", line.get("message", ""))),
    }


def _normalize_webui(line: dict) -> dict:
    msg = line.get("message", "")
    # 尝试解析嵌套JSON
    event = msg
    try:
        inner = json.loads(msg)
        if isinstance(inner, dict):
            event = inner.get("event", msg)
    except (json.JSONDecodeError, TypeError):
        pass
    return {
        "timestamp": line.get("timestamp", ""),
        "level": str(line.get("level", "")).upper(),
        "logger": line.get("logger", ""),
        "message": str(event),
    }


@router.get("/content/{filename}", summary="读取日志内容")
async def get_log_content(
    filename: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=2000),
):
    # 路径穿越防护
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="非法文件名")

    filepath = LOG_DIR / filename
    if not filepath.is_file():
        raise HTTPException(status_code=404, detail="文件不存在")

    is_webui = filename.startswith("webui_")
    normalize = _normalize_webui if is_webui else _normalize_main

    lines = []
    total = 0
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            for i, raw in enumerate(f):
                total += 1
                if i < offset:
                    continue
                if len(lines) >= limit:
                    continue  # 继续计数total
                raw = raw.strip()
                if not raw:
                    continue
                try:
                    lines.append(normalize(json.loads(raw)))
                except json.JSONDecodeError:
                    lines.append({"timestamp": "", "level": "INFO", "logger": "", "message": raw})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"读取失败: {e}")

    return {"success": True, "lines": lines, "total": total, "offset": offset, "limit": limit}
