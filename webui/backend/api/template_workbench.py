import json
import secrets
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

CONFIG_FILE_PATH = Path("config") / "MOD.json"


class WorkbenchProject(BaseModel):
    sequence: str
    mod_name: str
    path: str
    files: List[Dict[str, Any]] = []


class CreateWorkbenchProjectPayload(BaseModel):
    mod_name: str
    path: str
    sequence: Optional[str] = None


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
        files=files if isinstance(files, list) else [],
    )


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


@router.post("/projects", summary="创建工作台项目索引")
def create_project(payload: CreateWorkbenchProjectPayload):
    data = load_mod_index()
    sequence = payload.sequence or generate_sequence(data)
    if sequence in data:
        raise HTTPException(status_code=400, detail=f"工作台项目序列号 '{sequence}' 已存在。")

    data[sequence] = {
        "mod_name": payload.mod_name,
        "path": payload.path,
        "files": [],
    }
    save_mod_index(data)
    return to_project(sequence, data[sequence])
