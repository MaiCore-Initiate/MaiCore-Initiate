# -*- coding: utf-8 -*-
"""日志查看 API。"""

from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException, Query

router = APIRouter()
LOG_DIR = Path("log")

_ELECTRON_LINE_RE = re.compile(r"^\[(?P<timestamp>[^\]]+)\]\s+(?P<message>.*)$")


def _safe_filename(filename: str) -> str:
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="非法文件名")
    return filename


def _detect_log_type(path: Path) -> str:
    if path.suffix == ".jsonl":
        return "webui" if path.stem.startswith("webui_") else "main"
    if path.name in {"desktop_pet_electron.log", "desktop_pet_overlay.log"}:
        return "desktop_pet"
    return "misc"


def _parse_log_date(path: Path) -> str:
    stem = path.stem
    if path.suffix == ".jsonl" and stem.startswith("webui_"):
        try:
            return datetime.strptime(stem[6:], "%Y-%m-%d").isoformat()
        except ValueError:
            return ""
    if path.suffix == ".jsonl":
        try:
            return datetime.strptime(stem, "%Y-%m-%d_%H-%M-%S").isoformat()
        except ValueError:
            return ""
    return datetime.fromtimestamp(path.stat().st_mtime).isoformat()


@router.get("/files", summary="列出所有日志文件")
async def list_log_files():
    if not LOG_DIR.is_dir():
        return {"success": True, "files": []}

    files: List[Dict[str, Any]] = []
    for path in sorted(LOG_DIR.iterdir()):
        if not path.is_file() or path.suffix not in {".jsonl", ".log"}:
            continue
        files.append(
            {
                "name": path.name,
                "size": path.stat().st_size,
                "date": _parse_log_date(path),
                "type": _detect_log_type(path),
            }
        )

    files.sort(key=lambda item: item["date"], reverse=True)
    return {"success": True, "files": files}


def _normalize_main(line: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "timestamp": line.get("timestamp", ""),
        "level": str(line.get("level", "")).upper() or "INFO",
        "logger": line.get("logger", ""),
        "message": str(line.get("event", line.get("message", ""))),
    }


def _normalize_webui(line: Dict[str, Any]) -> Dict[str, Any]:
    msg = line.get("message", "")
    event = msg
    try:
        inner = json.loads(msg)
        if isinstance(inner, dict):
            event = inner.get("event", msg)
    except (json.JSONDecodeError, TypeError):
        pass
    return {
        "timestamp": line.get("timestamp", ""),
        "level": str(line.get("level", "")).upper() or "INFO",
        "logger": line.get("logger", ""),
        "message": str(event),
    }


def _guess_text_level(message: str) -> str:
    lowered = message.lower()
    if any(key in lowered for key in (
        "error",
        "exception",
        "traceback",
        "did-fail-load",
        "render-process-gone",
        "load error",
        "could not find cubism 4 runtime",
        "checkmaxifstatementsinshader",
        "failed to load",
    )):
        return "ERROR"
    if any(key in lowered for key in ("warn", "warning", "fallback", "unresponsive", "skipped")):
        return "WARNING"
    if "debug" in lowered:
        return "DEBUG"
    return "INFO"


def _normalize_text_line(raw: str, filename: str) -> Dict[str, Any]:
    match = _ELECTRON_LINE_RE.match(raw)
    if match:
        timestamp = match.group("timestamp")
        body = match.group("message").strip()
    else:
        timestamp = ""
        body = raw.strip()

    tag, detail = body, body
    if " " in body:
        first, rest = body.split(" ", 1)
        if ":" in first or first in {"startup", "uncaughtException", "unhandledRejection"}:
            tag = first
            detail = rest.strip() or first

    logger = Path(filename).stem
    if filename == "desktop_pet_electron.log" and tag != body:
        logger = tag

    return {
        "timestamp": timestamp,
        "level": _guess_text_level(body),
        "logger": logger,
        "message": detail,
        "raw": body,
    }


def _build_desktop_pet_analysis(lines: List[Dict[str, Any]]) -> Dict[str, Any]:
    findings: List[Dict[str, Any]] = []

    checks = [
        (
            "error",
            "Cubism Core 未加载",
            lambda text: "Could not find Cubism 4 runtime" in text or "Failed to load Cubism Core" in text,
            "桌宠渲染依赖的 Cubism Core 没有成功注入，模型一定无法显示。",
        ),
        (
            "error",
            "WebGL 纹理单元异常",
            lambda text: "checkMaxIfStatementsInShader" in text or "MAX_TEXTURE_IMAGE_UNITS returned 0" in text or "Renderer texture units: 0" in text,
            "显卡或透明窗口上下文返回了异常的纹理单元数量，Pixi 会在批处理着色器初始化阶段失败。",
        ),
        (
            "error",
            "模型资源加载失败",
            lambda text: "Live2D model load error" in text or "Network error" in text or "did-fail-load" in text,
            "模型 JSON、贴图或相关资源文件没有被正确读取。",
        ),
        (
            "error",
            "渲染进程崩溃",
            lambda text: "render-process-gone" in text,
            "Electron 渲染进程发生崩溃，需要继续看具体崩溃前的控制台输出。",
        ),
        (
            "warning",
            "回退到外网 Cubism Core",
            lambda text: "CDN fallback" in text or "Failed to load bundled Cubism Core" in text,
            "本地 Cubism Core 资源没有被成功加载，当前可能退回到了外网地址。",
        ),
    ]

    last_model_url = ""
    last_backend_url = ""
    for line in lines:
        raw = str(line.get("raw", line.get("message", "")))
        if "Loading Live2D model from:" in raw:
            match = re.search(r"Loading Live2D model from:\s*(\S+)", raw)
            if match:
                last_model_url = match.group(1)
        if "startup args" in raw and "backendUrl" in raw:
            match = re.search(r'"backendUrl"\s*:\s*"([^"]+)"', raw)
            if match:
                last_backend_url = match.group(1)

    for severity, title, matcher, hint in checks:
        matched = [line for line in lines if matcher(str(line.get("raw", line.get("message", ""))))]
        if not matched:
            continue
        findings.append(
            {
                "severity": severity,
                "title": title,
                "count": len(matched),
                "last_seen": matched[-1].get("timestamp", ""),
                "hint": hint,
            }
        )

    if findings:
        summary = f"已识别到 {len(findings)} 类桌宠渲染问题线索。"
    else:
        summary = "暂未识别到明确的桌宠渲染错误关键词。"

    return {
        "kind": "desktop_pet_electron",
        "summary": summary,
        "findings": findings,
        "last_model_url": last_model_url,
        "last_backend_url": last_backend_url,
    }


@router.get("/content/{filename}", summary="读取日志内容")
async def get_log_content(
    filename: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=2000),
):
    filename = _safe_filename(filename)
    filepath = LOG_DIR / filename
    if not filepath.is_file():
        raise HTTPException(status_code=404, detail="文件不存在")

    log_type = _detect_log_type(filepath)
    normalize_json = _normalize_webui if log_type == "webui" else _normalize_main

    page_lines: List[Dict[str, Any]] = []
    all_lines: List[Dict[str, Any]] = []
    total = 0

    try:
        with open(filepath, "r", encoding="utf-8", errors="replace") as f:
            for index, raw in enumerate(f):
                total += 1
                raw = raw.strip()
                if not raw:
                    continue

                if filepath.suffix == ".jsonl":
                    try:
                        normalized = normalize_json(json.loads(raw))
                    except json.JSONDecodeError:
                        normalized = {"timestamp": "", "level": "INFO", "logger": filepath.stem, "message": raw, "raw": raw}
                else:
                    normalized = _normalize_text_line(raw, filename)

                if log_type == "desktop_pet":
                    all_lines.append(normalized)

                if index < offset:
                    continue
                if len(page_lines) >= limit:
                    continue
                page_lines.append(normalized)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"读取失败: {exc}") from exc

    analysis = None
    if filename == "desktop_pet_electron.log":
        analysis = _build_desktop_pet_analysis(all_lines)

    return {
        "success": True,
        "lines": page_lines,
        "total": total,
        "offset": offset,
        "limit": limit,
        "analysis": analysis,
        "type": log_type,
    }
