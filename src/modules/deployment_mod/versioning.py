from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path


DEFAULT_MOD_SCHEMA_VERSION = "2.1"


@lru_cache(maxsize=1)
def get_mod_version_file_path() -> Path:
    return Path(__file__).resolve().parents[3] / "MOD" / "MODVersion.json"


@lru_cache(maxsize=1)
def get_current_mod_schema_version() -> str:
    path = get_mod_version_file_path()
    try:
        payload = json.loads(path.read_text(encoding="utf-8-sig"))
    except Exception:
        return DEFAULT_MOD_SCHEMA_VERSION

    value = str(payload.get("MODVersion", "") or "").strip()
    return value or DEFAULT_MOD_SCHEMA_VERSION

