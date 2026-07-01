from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

@lru_cache(maxsize=1)
def get_mod_version_file_path() -> Path:
    return Path(__file__).resolve().parents[3] / "MOD" / "MODVersion.json"


@lru_cache(maxsize=1)
def get_current_mod_schema_version() -> str:
    path = get_mod_version_file_path()
    try:
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
    except FileNotFoundError as exc:
        raise RuntimeError(f"未找到 DeploymentMOD 标准版本文件: {path}") from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"DeploymentMOD 标准版本文件不是合法 JSON: {path} ({exc})") from exc
    except Exception as exc:
        raise RuntimeError(f"读取 DeploymentMOD 标准版本文件失败: {path} ({exc})") from exc

    value = str(payload.get("MODVersion", "") or "").strip()
    if not value:
        raise RuntimeError(f"DeploymentMOD 标准版本文件缺少非空 `MODVersion`: {path}")
    return value
