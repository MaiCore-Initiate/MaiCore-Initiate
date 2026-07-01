# -*- coding: utf-8 -*-
"""工作台模板发布状态注册表。"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


PROJECT_ROOT = Path(__file__).resolve().parents[2]
PUBLISHED_TEMPLATES_PATH = PROJECT_ROOT / "config" / "published_templates.json"
PUBLISHED_SOURCE = "published-workbench"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def load_published_registry() -> Dict[str, Dict[str, Any]]:
    try:
        with PUBLISHED_TEMPLATES_PATH.open("r", encoding="utf-8") as handle:
            raw = json.load(handle)
    except FileNotFoundError:
        return {}
    except json.JSONDecodeError:
        return {}

    if isinstance(raw, dict) and isinstance(raw.get("templates"), dict):
        return {str(k): dict(v) for k, v in raw["templates"].items() if isinstance(v, dict)}
    if isinstance(raw, dict):
        return {str(k): dict(v) for k, v in raw.items() if isinstance(v, dict)}
    return {}


def save_published_registry(registry: Dict[str, Dict[str, Any]]) -> None:
    PUBLISHED_TEMPLATES_PATH.parent.mkdir(parents=True, exist_ok=True)
    with PUBLISHED_TEMPLATES_PATH.open("w", encoding="utf-8") as handle:
        json.dump({"templates": registry}, handle, ensure_ascii=False, indent=4)
        handle.write("\n")


def upsert_published_template(sequence: str, record: Dict[str, Any]) -> Dict[str, Any]:
    registry = load_published_registry()
    previous = dict(registry.get(sequence, {}) or {})
    now = utc_now_iso()
    next_record = {
        **previous,
        **record,
        "sequence": sequence,
        "published": True,
        "published_at": previous.get("published_at") or now,
        "updated_at": now,
    }
    registry[sequence] = next_record
    save_published_registry(registry)
    return next_record


def unpublish_template(sequence: str) -> Optional[Dict[str, Any]]:
    registry = load_published_registry()
    record = registry.get(sequence)
    if not record:
        return None
    record = dict(record)
    record["published"] = False
    record["unpublished_at"] = utc_now_iso()
    record["updated_at"] = record["unpublished_at"]
    registry[sequence] = record
    save_published_registry(registry)
    return record


def get_published_template(sequence: str) -> Optional[Dict[str, Any]]:
    record = load_published_registry().get(sequence)
    return dict(record) if isinstance(record, dict) else None


def list_published_templates(include_inactive: bool = False) -> List[Dict[str, Any]]:
    records = [dict(item) for item in load_published_registry().values()]
    if not include_inactive:
        records = [item for item in records if bool(item.get("published"))]
    return sorted(records, key=lambda item: str(item.get("updated_at") or item.get("published_at") or ""), reverse=True)


def find_published_by_template_id(template_id: str, include_inactive: bool = False) -> Optional[Dict[str, Any]]:
    normalized = str(template_id or "").strip()
    if not normalized:
        return None
    for record in list_published_templates(include_inactive=include_inactive):
        if str(record.get("template_id") or "") == normalized:
            return record
    return None


def get_instance_publish_state(config: Dict[str, Any]) -> Dict[str, Any]:
    mod_binding = dict(config.get("mod_binding", {}) or {})
    template_inputs = dict(config.get("template_inputs", {}) or {})
    sequence = str(
        template_inputs.get("deployment_flow_sequence")
        or template_inputs.get("__published_sequence")
        or mod_binding.get("workbench_sequence")
        or ""
    ).strip()
    template_id = str(mod_binding.get("template_id") or "").strip()
    is_published_instance = (
        str(mod_binding.get("source") or "") == PUBLISHED_SOURCE
        or bool(sequence)
    )

    record = get_published_template(sequence) if sequence else None
    if record is None and is_published_instance and template_id:
        record = find_published_by_template_id(template_id, include_inactive=True)
        if record:
            sequence = str(record.get("sequence") or sequence)

    active = bool(record and record.get("published"))
    return {
        "is_published_template": is_published_instance,
        "published_active": active if is_published_instance else True,
        "deployment_flow_sequence": sequence,
        "deployment_flow_template_id": template_id,
        "deployment_flow_name": str((record or {}).get("name") or template_id or ""),
        "deployment_flow_version": str((record or {}).get("version") or mod_binding.get("template_version") or ""),
        "deployment_flow_record": record or {},
    }


def ensure_instance_publish_active(config: Dict[str, Any]) -> Dict[str, Any]:
    state = get_instance_publish_state(config)
    if state["is_published_template"] and not state["published_active"]:
        raise RuntimeError("该实例所属部署流已取消发布，不能继续操作")
    return state
