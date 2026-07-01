# -*- coding: utf-8 -*-
"""Deployment MOD WebUI API。"""
import asyncio
import json
import threading
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..core.config import config_manager
from ..modules.deployment import deployment_manager
from ..modules.deployment_mod import deployment_mod_executor, deployment_mod_registry
from ..modules.deployment_mod.debug_session import DebugMonitorUnavailable, DebugSessionStopped, debug_session_manager
from .auth_core import require_action
from . import deploy_api as deploy_api_module
from .deploy_api import _deploy_tasks, _dispatch_progress, _remember_main_event_loop
from .published_templates import (
    PUBLISHED_SOURCE,
    ensure_instance_publish_active,
    get_instance_publish_state,
    get_published_template,
    list_published_templates,
    unpublish_template,
    upsert_published_template,
)

router = APIRouter()


class TemplatePreviewRequest(BaseModel):
    template_id: str
    user_inputs: Dict[str, Any]


class TemplateDeployRequest(BaseModel):
    template_id: str
    user_inputs: Dict[str, Any]


class TemplateStageRequest(BaseModel):
    template_id: str
    stage: str
    user_inputs: Dict[str, Any] = {}
    serial_number: str = ""


class WorkbenchRunRequest(BaseModel):
    mode: str = "full"
    stage: str = ""
    user_inputs: Dict[str, Any] = {}
    serial_number: str = ""


class WorkbenchDebugStartRequest(BaseModel):
    scope: str = "full"
    stage: str = ""
    block_key: str = ""
    monitor_level: str = "normal"
    hydrate_context: bool = True
    user_inputs: Dict[str, Any] = {}
    serial_number: str = ""


class PublishedDeployRequest(BaseModel):
    user_inputs: Dict[str, Any] = Field(default_factory=dict)


class PublishedInstanceStageRequest(BaseModel):
    stage: str
    user_inputs: Dict[str, Any] = Field(default_factory=dict)


PROJECT_ROOT = Path(__file__).resolve().parents[2]
WORKBENCH_INDEX_PATH = PROJECT_ROOT / "config" / "MOD.json"


def _load_workbench_index() -> Dict[str, Dict[str, Any]]:
    try:
        with WORKBENCH_INDEX_PATH.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="工作台索引不存在") from exc
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"读取工作台索引失败: {exc}") from exc
    return data if isinstance(data, dict) else {}


def _save_workbench_index(data: Dict[str, Dict[str, Any]]) -> None:
    try:
        WORKBENCH_INDEX_PATH.parent.mkdir(parents=True, exist_ok=True)
        with WORKBENCH_INDEX_PATH.open("w", encoding="utf-8") as handle:
            json.dump(data, handle, ensure_ascii=False, indent=4)
            handle.write("\n")
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"保存工作台索引失败: {exc}") from exc


def _resolve_workbench_project(sequence: str) -> tuple[Dict[str, Any], Path]:
    data = _load_workbench_index()
    if sequence not in data:
        raise HTTPException(status_code=404, detail=f"工作台项目 '{sequence}' 未找到")

    project = data[sequence]
    raw_path = str(project.get("path", "") or "").strip()
    if not raw_path:
        raise HTTPException(status_code=400, detail=f"工作台项目 '{sequence}' 未配置 path")

    project_path = Path(raw_path)
    if not project_path.is_absolute():
        project_path = PROJECT_ROOT / project_path
    project_path = project_path.resolve()
    if project_path.suffix.lower() == ".toml":
        project_dir = project_path.parent
    else:
        project_dir = project_path
    if not project_dir.exists() or not project_dir.is_dir():
        raise HTTPException(status_code=404, detail=f"工作台项目目录不存在: {project_dir}")
    return project, project_dir


def _resolve_workbench_template_path(sequence: str) -> tuple[Dict[str, Any], Path]:
    project, project_dir = _resolve_workbench_project(sequence)
    mod_id = str(project.get("mod_id") or project.get("workbench_meta", {}).get("modId") or "").strip()
    candidates = []
    if mod_id:
        candidates.append(project_dir / f"{mod_id}.toml")
    candidates.append(project_dir / "DeploymentMOD.toml")

    for path in candidates:
        if path.is_file():
            return project, path

    toml_files = sorted(project_dir.glob("*.toml"))
    if toml_files:
        return project, toml_files[0]

    raise HTTPException(status_code=404, detail=f"工作台项目未找到可运行的 TOML 模板: {project_dir}")


def _published_payload(record: Dict[str, Any], template: Optional[Any] = None) -> Dict[str, Any]:
    payload = dict(record)
    if template is not None:
        payload["metadata"] = template.metadata.to_dict()
        payload["components"] = [item.to_dict() for item in template.components]
        payload["deployments"] = [item.to_dict() for item in template.deployments]
        payload["launches"] = [item.to_dict() for item in template.launches]
        payload["configs"] = [item.to_dict() for item in template.configs]
        payload["uninstalls"] = [item.to_dict() for item in template.uninstalls]
        payload["form"] = _enrich_form_schema(template)
        payload["builtin_profile"] = template.builtin_profile
    return payload


def _parse_published_template(record: Dict[str, Any]):
    template_path = Path(str(record.get("template_path") or ""))
    if not template_path.is_absolute():
        template_path = PROJECT_ROOT / template_path
    if not template_path.is_file():
        raise HTTPException(status_code=404, detail="发布模板文件不存在")
    template = deployment_mod_executor.planner.parser.parse_file(str(template_path))
    template.metadata.source = PUBLISHED_SOURCE
    return template, template_path


def _find_config_by_serial(serial_number: str) -> tuple[str, Dict[str, Any]]:
    for name, config in config_manager.get_all_configurations().items():
        if str(config.get("serial_number", "") or "") == str(serial_number):
            return name, config
    raise HTTPException(status_code=404, detail=f"未找到实例序列号: {serial_number}")


def _mark_instance_flow_source(result: Any, sequence: str) -> None:
    if not result or not getattr(result, "success", False):
        return
    config_name = str(getattr(result, "instance_config_name", "") or "")
    if not config_name:
        return
    configs = config_manager.get_all_configurations()
    config = configs.get(config_name)
    if not isinstance(config, dict):
        return
    mod_binding = dict(config.get("mod_binding", {}) or {})
    mod_binding["source"] = PUBLISHED_SOURCE
    mod_binding["workbench_sequence"] = sequence
    config["mod_binding"] = mod_binding
    template_inputs = dict(config.get("template_inputs", {}) or {})
    template_inputs["deployment_flow_sequence"] = sequence
    template_inputs["__published_sequence"] = sequence
    config["template_inputs"] = template_inputs
    config["source"] = "deployment-flow"
    configs[config_name] = config
    config_manager.save()


def _append_task_log(task_id: str, kwargs: Dict[str, Any]) -> None:
    msg = kwargs.get("message", "")
    if not msg:
        return
    step_name = kwargs.get("step_name", "")
    status = kwargs.get("status", "running")
    event = kwargs.get("event", "stage")
    prefix = f"[{datetime.now().strftime('%H:%M:%S')}]"
    if event:
        prefix += f" [{event}]"
    if step_name:
        prefix += f" [{step_name}]"
    if status:
        prefix += f" [{status}]"
    logs = _deploy_tasks[task_id].setdefault("logs", [])
    logs.append(f"{prefix} {msg}")
    if len(logs) > 2000:
        _deploy_tasks[task_id]["logs"] = logs[-2000:]


def _record_task_progress(task_id: str, serial_number: str, kwargs: Dict[str, Any]) -> None:
    _deploy_tasks[task_id].update(kwargs)
    _append_task_log(task_id, kwargs)
    _dispatch_progress(serial_number, {"task_id": task_id, **kwargs, "logs": _deploy_tasks[task_id].get("logs", [])[-500:]})


def _get_debug_broadcast_func():
    from webui.backend.main import broadcast_deployment_debug
    return broadcast_deployment_debug


def _dispatch_debug(session_id: str, payload: Dict[str, Any]) -> None:
    loop = deploy_api_module._main_event_loop
    if loop is None or loop.is_closed() or not loop.is_running():
        return
    try:
        future = asyncio.run_coroutine_threadsafe(
            _get_debug_broadcast_func()(session_id, payload),
            loop,
        )
        future.add_done_callback(deploy_api_module._consume_future_exception)
    except Exception:
        pass


def _find_template_item(template, stage_name: str, item_id: str):
    stage_map = {
        "component": template.components,
        "deployment": template.deployments,
    }
    for item in stage_map.get(stage_name, []):
        if str(getattr(item, "id", "") or "") == item_id:
            return item
    return None


def _candidate_label(candidate: Dict[str, Any]) -> str:
    type_label = {
        "release": "Release",
        "tag": "Tag",
        "branch": "Branch",
        "file": "文件",
        "custom": "自定义",
        "explicit": "显式",
        "provided": "模板",
    }.get(str(candidate.get("type", "") or ""), str(candidate.get("type", "") or "候选"))
    name = str(candidate.get("name", "") or candidate.get("raw_name", "") or "")
    return f"{name} [{type_label}]".strip()


def _enrich_form_schema(template) -> Dict[str, Any]:
    form = template.form_schema.to_dict()
    runtime = deployment_mod_executor.runtime

    for field in form.get("fields", []):
        if str(field.get("field_type", "") or "") != "hidden":
            continue
        key = str(field.get("key", "") or "")
        parts = key.split("::")
        if len(parts) != 3:
            continue
        kind, stage_name, item_id = parts
        definition = _find_template_item(template, stage_name, item_id)
        if definition is None:
            continue

        try:
            if kind == "version":
                candidates = runtime.fetch_version_candidates(template, stage_name, item_id, definition)
                candidates = runtime._filter_candidates(definition, candidates)
            elif kind == "link":
                candidates = runtime.fetch_link_candidates(template, stage_name, item_id, definition)
            else:
                continue
        except Exception as exc:
            field["field_type"] = "text"
            field["description"] = f"{field.get('description', '')} 自动获取失败，可手动输入。原因: {exc}".strip()
            continue

        if candidates:
            field["field_type"] = "select"
            field["options"] = [{"label": _candidate_label(item), "value": str(item.get("raw_name") or item.get("name", ""))} for item in candidates]
            field["default"] = str(candidates[0].get("raw_name") or candidates[0].get("name", ""))
            field["description"] = f"{field.get('description', '')} 已自动加载候选项。".strip()
        else:
            field["field_type"] = "text"
            if kind == "version":
                field["description"] = f"{field.get('description', '')} 当前未能获取候选版本，可手动输入版本/分支。".strip()
            else:
                field["description"] = f"{field.get('description', '')} 当前未能获取候选链接，可手动输入完整链接。".strip()

    return form


@router.get("/templates", summary="列出本地模板")
async def list_templates():
    templates = deployment_mod_registry.get_all(refresh=True)
    return {
        "success": True,
        "templates": [
            {
                "template_id": template.metadata.mod_id,
                "name": template.metadata.mod_name,
                "version": template.metadata.version,
                "description": template.metadata.description,
                "author": template.metadata.author,
                "tags": template.metadata.tags,
                "source": template.metadata.source,
                "builtin_profile": template.builtin_profile,
            }
            for template in templates
        ],
    }


@router.get("/templates/{template_id}", summary="获取模板详情")
async def get_template_detail(template_id: str):
    template = deployment_mod_registry.get(template_id, refresh=True)
    if not template:
        raise HTTPException(status_code=404, detail="模板不存在")
    return {"success": True, "template": template.to_dict()}


@router.get("/templates/{template_id}/form", summary="获取模板表单 schema")
async def get_template_form(template_id: str):
    template = deployment_mod_registry.get(template_id, refresh=True)
    if not template:
        raise HTTPException(status_code=404, detail="模板不存在")
    return {
        "success": True,
        "template_id": template_id,
        "form": _enrich_form_schema(template),
        "launches": [item.to_dict() for item in template.launches],
    }


@router.post("/preview", summary="预览模板部署计划", dependencies=[Depends(require_action("deploy.manage"))])
async def preview_template_plan(request: TemplatePreviewRequest):
    try:
        plan = deployment_mod_executor.build_plan(request.template_id, request.user_inputs)
        return {"success": True, "plan": plan.to_dict()}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/deploy", summary="执行模板部署", dependencies=[Depends(require_action("deploy.manage"))])
async def deploy_from_template(request: TemplateDeployRequest):
    task_id = f"deployment_mod_{uuid.uuid4().hex[:8]}"
    serial_number = (request.user_inputs or {}).get("serial_number", task_id)
    _deploy_tasks[task_id] = {"status": "running", "step": 0, "total_steps": 6, "logs": [], "template_id": request.template_id}
    _remember_main_event_loop()

    def _run_deploy():
        def progress_cb(**kwargs):
            _deploy_tasks[task_id].update(kwargs)
            msg = kwargs.get("message", "")
            step_name = kwargs.get("step_name", "")
            status = kwargs.get("status", "running")
            if msg:
                prefix = f"[{datetime.now().strftime('%H:%M:%S')}]"
                if step_name:
                    prefix += f" [{step_name}]"
                if status:
                    prefix += f" [{status}]"
                logs = _deploy_tasks[task_id].setdefault("logs", [])
                logs.append(f"{prefix} {msg}")
                if len(logs) > 2000:
                    _deploy_tasks[task_id]["logs"] = logs[-2000:]
            _dispatch_progress(serial_number, {"task_id": task_id, **kwargs, "logs": _deploy_tasks[task_id].get("logs", [])[-500:]})

        try:
            result = deployment_manager.deploy_instance_from_template_webui(
                request.template_id,
                request.user_inputs,
                progress_callback=progress_cb,
            )
            _deploy_tasks[task_id]["status"] = "completed" if result else "failed"
            progress_cb(
                step=6,
                total_steps=6,
                step_name="模板部署完成" if result else "模板部署失败",
                status="completed" if result else "failed",
                message="模板部署成功！" if result else "模板部署过程中出现错误",
            )
        except Exception as exc:
            _deploy_tasks[task_id]["status"] = "failed"
            progress_cb(step=0, total_steps=6, step_name="模板部署失败", status="failed", message=str(exc))

    threading.Thread(target=_run_deploy, daemon=True).start()
    return {"success": True, "task_id": task_id, "message": "模板部署任务已启动"}


@router.post("/stage", summary="执行模板单独阶段", dependencies=[Depends(require_action("deploy.manage"))])
async def run_template_stage(request: TemplateStageRequest):
    task_id = f"deployment_mod_stage_{uuid.uuid4().hex[:8]}"
    serial_number = request.serial_number or (request.user_inputs or {}).get("serial_number", task_id)
    _deploy_tasks[task_id] = {
        "status": "running",
        "step": 0,
        "total_steps": 1,
        "logs": [],
        "template_id": request.template_id,
        "stage": request.stage,
    }
    _remember_main_event_loop()

    def _run_stage():
        def progress_cb(**kwargs):
            _deploy_tasks[task_id].update(kwargs)
            msg = kwargs.get("message", "")
            step_name = kwargs.get("step_name", "")
            status = kwargs.get("status", "running")
            if msg:
                prefix = f"[{datetime.now().strftime('%H:%M:%S')}]"
                if step_name:
                    prefix += f" [{step_name}]"
                if status:
                    prefix += f" [{status}]"
                logs = _deploy_tasks[task_id].setdefault("logs", [])
                logs.append(f"{prefix} {msg}")
                if len(logs) > 2000:
                    _deploy_tasks[task_id]["logs"] = logs[-2000:]
            _dispatch_progress(serial_number, {"task_id": task_id, **kwargs, "logs": _deploy_tasks[task_id].get("logs", [])[-500:]})

        try:
            if request.serial_number:
                result = deployment_mod_executor.execute_stage_for_instance(
                    request.template_id,
                    request.serial_number,
                    request.stage,
                    user_inputs=request.user_inputs,
                    progress_callback=progress_cb,
                )
            else:
                result = deployment_mod_executor.execute_stage(
                    request.template_id,
                    request.stage,
                    request.user_inputs,
                    progress_callback=progress_cb,
                    serial_number=serial_number,
                )
            _deploy_tasks[task_id]["status"] = "completed" if result.success else "failed"
            _deploy_tasks[task_id]["result"] = result.to_dict()
            progress_cb(
                step=1,
                total_steps=1,
                step_name=f"{request.stage} 阶段完成" if result.success else f"{request.stage} 阶段失败",
                status="completed" if result.success else "failed",
                message=result.message,
            )
        except Exception as exc:
            _deploy_tasks[task_id]["status"] = "failed"
            progress_cb(step=1, total_steps=1, step_name=f"{request.stage} 阶段失败", status="failed", message=str(exc))

    threading.Thread(target=_run_stage, daemon=True).start()
    return {"success": True, "task_id": task_id, "message": "模板阶段任务已启动"}


@router.post("/workbench/{sequence}/run", summary="执行工作台试运行", dependencies=[Depends(require_action("deploy.manage"))])
async def run_workbench_template(sequence: str, request: WorkbenchRunRequest):
    _, template_path = _resolve_workbench_template_path(sequence)
    mode = str(request.mode or "full").strip().lower()
    if mode not in {"full", "stage"}:
        raise HTTPException(status_code=400, detail=f"不支持的工作台运行模式: {request.mode}")
    if mode == "stage" and not str(request.stage or "").strip():
        raise HTTPException(status_code=400, detail="阶段运行缺少 stage")

    task_id = f"workbench_mod_{uuid.uuid4().hex[:8]}"
    user_inputs = dict(request.user_inputs or {})
    serial_number = str(request.serial_number or user_inputs.get("serial_number") or "").strip()
    if mode == "full" and not serial_number:
        serial_number = f"workbench_{uuid.uuid4().hex[:8]}"
    if serial_number:
        user_inputs["serial_number"] = serial_number
    if mode == "full":
        user_inputs.setdefault("nickname", str(user_inputs.get("nickname") or f"工作台试运行 {serial_number}").strip())
        user_inputs.setdefault("bot_type", "Custom")
    _deploy_tasks[task_id] = {
        "status": "running",
        "step": 0,
        "total_steps": 6 if mode == "full" else 1,
        "logs": [],
        "template_path": str(template_path),
        "project_sequence": sequence,
        "mode": mode,
        "stage": request.stage if mode == "stage" else "full",
    }
    _remember_main_event_loop()

    def _run_workbench():
        def progress_cb(**kwargs):
            _record_task_progress(task_id, serial_number, kwargs)

        try:
            progress_cb(
                step=0,
                total_steps=6 if mode == "full" else 1,
                step_name="准备工作台试运行",
                status="running",
                message=f"模板文件: {template_path}",
                event="detail",
            )
            template = deployment_mod_executor.planner.parser.parse_file(str(template_path))
            template.metadata.source = "workbench"
            plan = deployment_mod_executor.planner.build_plan(template, user_inputs)

            if mode == "stage":
                result = deployment_mod_executor.runtime.execute_stage(
                    template,
                    plan,
                    request.stage,
                    progress_callback=progress_cb,
                    serial_number=serial_number,
                )
            else:
                result = deployment_mod_executor.runtime.execute(
                    template,
                    plan,
                    progress_callback=progress_cb,
                )

            _deploy_tasks[task_id]["status"] = "completed" if result.success else "failed"
            _deploy_tasks[task_id]["result"] = result.to_dict()
            progress_cb(
                step=6 if mode == "full" else 1,
                total_steps=6 if mode == "full" else 1,
                step_name="工作台试运行完成" if result.success else "工作台试运行失败",
                status="completed" if result.success else "failed",
                message=result.message,
            )
        except Exception as exc:
            _deploy_tasks[task_id]["status"] = "failed"
            progress_cb(
                step=0,
                total_steps=6 if mode == "full" else 1,
                step_name="工作台试运行失败",
                status="failed",
                message=str(exc),
            )

    threading.Thread(target=_run_workbench, daemon=True).start()
    return {"success": True, "task_id": task_id, "message": "工作台试运行任务已启动"}


@router.get("/published", summary="列出已发布部署流")
async def list_published_deployment_flows(include_inactive: bool = False):
    templates = []
    for record in list_published_templates(include_inactive=include_inactive):
        payload = dict(record)
        try:
            template, _ = _parse_published_template(record)
            payload.update(
                {
                    "template_id": template.metadata.mod_id,
                    "name": template.metadata.mod_name,
                    "version": template.metadata.version,
                    "description": template.metadata.description,
                    "author": template.metadata.author,
                    "tags": template.metadata.tags,
                    "builtin_profile": template.builtin_profile,
                    "component_count": len(template.components),
                    "deployment_count": len(template.deployments),
                    "launch_count": len(template.launches),
                    "config_count": len(template.configs),
                    "uninstall_count": len(template.uninstalls),
                }
            )
        except Exception as exc:
            payload["invalid"] = True
            payload["invalid_reason"] = str(exc)
        templates.append(payload)
    return {"success": True, "templates": templates}


@router.get("/published/{sequence}", summary="获取已发布部署流详情")
async def get_published_deployment_flow(sequence: str):
    record = get_published_template(sequence)
    if not record:
        raise HTTPException(status_code=404, detail="部署流未发布")
    try:
        template, _ = _parse_published_template(record)
        return {"success": True, "template": _published_payload(record, template)}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/workbench/{sequence}/publish", summary="发布工作台项目", dependencies=[Depends(require_action("deploy.manage"))])
async def publish_workbench_template(sequence: str):
    project, template_path = _resolve_workbench_template_path(sequence)
    try:
        template = deployment_mod_executor.planner.parser.parse_file(str(template_path))
        template.metadata.source = PUBLISHED_SOURCE
        deployment_mod_executor.planner.build_plan(template, {})
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"模板校验失败: {exc}") from exc

    record = upsert_published_template(
        sequence,
        {
            "template_id": template.metadata.mod_id,
            "name": template.metadata.mod_name,
            "version": template.metadata.version,
            "description": template.metadata.description,
            "author": template.metadata.author,
            "cover": project.get("cover"),
            "project_path": str(Path(str(project.get("path", ""))).resolve()),
            "template_path": str(template_path),
            "source": "MaiCoreStart",
            "schema_version": template.metadata.schema_version,
        },
    )

    index = _load_workbench_index()
    item = index.get(sequence)
    if isinstance(item, dict):
        item["published"] = True
        item["published_at"] = record.get("published_at")
        item["published_version"] = template.metadata.version
        _save_workbench_index(index)

    return {"success": True, "template": _published_payload(record, template)}


@router.post("/workbench/{sequence}/unpublish", summary="取消发布工作台项目", dependencies=[Depends(require_action("deploy.manage"))])
async def unpublish_workbench_template(sequence: str):
    record = unpublish_template(sequence)
    if not record:
        raise HTTPException(status_code=404, detail="部署流未发布")

    index = _load_workbench_index()
    item = index.get(sequence)
    if isinstance(item, dict):
        item["published"] = False
        item["unpublished_at"] = record.get("unpublished_at")
        _save_workbench_index(index)

    return {"success": True, "template": record}


@router.post("/published/{sequence}/deploy", summary="执行已发布部署流", dependencies=[Depends(require_action("deploy.manage"))])
async def deploy_published_flow(sequence: str, request: PublishedDeployRequest):
    record = get_published_template(sequence)
    if not record or not record.get("published"):
        raise HTTPException(status_code=400, detail="部署流未发布或已取消发布")

    try:
        template, template_path = _parse_published_template(record)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    task_id = f"published_mod_{uuid.uuid4().hex[:8]}"
    user_inputs = dict(request.user_inputs or {})
    user_inputs["deployment_flow_sequence"] = sequence
    user_inputs["__published_sequence"] = sequence
    serial_number = str(user_inputs.get("serial_number") or task_id)
    _deploy_tasks[task_id] = {
        "status": "running",
        "step": 0,
        "total_steps": 4,
        "logs": [],
        "template_path": str(template_path),
        "project_sequence": sequence,
        "mode": "published",
    }
    _remember_main_event_loop()

    def _run_published_deploy():
        def progress_cb(**kwargs):
            _record_task_progress(task_id, serial_number, kwargs)

        try:
            progress_cb(step=0, total_steps=4, step_name="准备部署流", status="running", message=f"部署流: {template.metadata.mod_name}", event="detail")
            plan = deployment_mod_executor.planner.build_plan(template, user_inputs)
            result = deployment_mod_executor.runtime.execute_deployment_setup(template, plan, progress_callback=progress_cb)
            _mark_instance_flow_source(result, sequence)
            _deploy_tasks[task_id]["status"] = "completed" if result.success else "failed"
            _deploy_tasks[task_id]["result"] = result.to_dict()
            progress_cb(
                step=4,
                total_steps=4,
                step_name="部署流完成" if result.success else "部署流失败",
                status="completed" if result.success else "failed",
                message=result.message,
            )
        except Exception as exc:
            _deploy_tasks[task_id]["status"] = "failed"
            progress_cb(step=0, total_steps=4, step_name="部署流失败", status="failed", message=str(exc))

    threading.Thread(target=_run_published_deploy, daemon=True).start()
    return {"success": True, "task_id": task_id, "message": "部署流任务已启动"}


@router.post("/instances/{serial_number}/stage", summary="执行已发布实例阶段", dependencies=[Depends(require_action("deploy.manage"))])
async def run_published_instance_stage(serial_number: str, request: PublishedInstanceStageRequest):
    _, config = _find_config_by_serial(serial_number)
    try:
        publish_state = ensure_instance_publish_active(config)
    except RuntimeError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    if not publish_state["is_published_template"]:
        raise HTTPException(status_code=400, detail="该实例不是发布部署流创建的实例")

    sequence = publish_state["deployment_flow_sequence"]
    record = get_published_template(sequence)
    if not record:
        raise HTTPException(status_code=404, detail="部署流发布记录不存在")
    try:
        template, template_path = _parse_published_template(record)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    stage = str(request.stage or "").strip().lower()
    if stage not in {"launch", "launches", "config", "configs", "uninstall", "uninstalls"}:
        raise HTTPException(status_code=400, detail="发布实例仅支持启动、配置和卸载阶段")

    task_id = f"published_stage_{uuid.uuid4().hex[:8]}"
    user_inputs = dict(config.get("template_inputs", {}) or {})
    user_inputs.update(request.user_inputs or {})
    user_inputs["serial_number"] = serial_number
    user_inputs["deployment_flow_sequence"] = sequence
    user_inputs["__published_sequence"] = sequence
    _deploy_tasks[task_id] = {
        "status": "running",
        "step": 0,
        "total_steps": 1,
        "logs": [],
        "template_path": str(template_path),
        "project_sequence": sequence,
        "serial_number": serial_number,
        "mode": "published-stage",
        "stage": stage,
    }
    _remember_main_event_loop()

    def _run_published_stage():
        def progress_cb(**kwargs):
            _record_task_progress(task_id, serial_number, kwargs)

        try:
            plan = deployment_mod_executor.planner.build_plan(template, user_inputs)
            result = deployment_mod_executor.runtime.execute_stage(
                template,
                plan,
                stage=stage,
                progress_callback=progress_cb,
                serial_number=serial_number,
            )
            _deploy_tasks[task_id]["status"] = "completed" if result.success else "failed"
            _deploy_tasks[task_id]["result"] = result.to_dict()
            progress_cb(
                step=1,
                total_steps=1,
                step_name=f"{stage} 阶段完成" if result.success else f"{stage} 阶段失败",
                status="completed" if result.success else "failed",
                message=result.message,
            )
        except Exception as exc:
            _deploy_tasks[task_id]["status"] = "failed"
            progress_cb(step=1, total_steps=1, step_name=f"{stage} 阶段失败", status="failed", message=str(exc))

    threading.Thread(target=_run_published_stage, daemon=True).start()
    return {"success": True, "task_id": task_id, "message": "实例阶段任务已启动"}


@router.post("/workbench/{sequence}/debug/start", summary="启动工作台调试", dependencies=[Depends(require_action("deploy.manage"))])
async def start_workbench_debug(sequence: str, request: WorkbenchDebugStartRequest):
    _, template_path = _resolve_workbench_template_path(sequence)
    scope = str(request.scope or "full").strip().lower()
    if scope not in {"full", "stage", "block"}:
        raise HTTPException(status_code=400, detail=f"不支持的调试范围: {request.scope}")
    if scope == "stage" and not str(request.stage or "").strip():
        raise HTTPException(status_code=400, detail="分区调试缺少 stage")
    if scope == "block" and not str(request.block_key or "").strip():
        raise HTTPException(status_code=400, detail="单块调试缺少 block_key")

    monitor_level = str(request.monitor_level or "normal").strip().lower()
    if monitor_level not in {"normal", "strict"}:
        raise HTTPException(status_code=400, detail=f"不支持的监控级别: {request.monitor_level}")

    task_id = f"workbench_debug_{uuid.uuid4().hex[:8]}"
    user_inputs = dict(request.user_inputs or {})
    serial_number = str(request.serial_number or user_inputs.get("serial_number") or "").strip()
    if scope == "full" and not serial_number:
        serial_number = f"workbench_debug_{uuid.uuid4().hex[:8]}"
    if serial_number:
        user_inputs["serial_number"] = serial_number
    if scope == "full":
        user_inputs.setdefault("nickname", str(user_inputs.get("nickname") or f"工作台调试 {serial_number}").strip())
        user_inputs.setdefault("bot_type", "Custom")

    _remember_main_event_loop()

    try:
        session = debug_session_manager.create(
            task_id=task_id,
            project_sequence=sequence,
            template_path=str(template_path),
            scope=scope,
            stage=request.stage if scope == "stage" else "",
            block_key=request.block_key if scope == "block" else "",
            monitor_level=monitor_level,
            hydrate_context=bool(request.hydrate_context),
            on_update=lambda payload: _dispatch_debug(payload["session_id"], payload),
        )
    except DebugMonitorUnavailable as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    _deploy_tasks[task_id] = {
        "status": "running",
        "step": 0,
        "total_steps": 6 if scope == "full" else 1,
        "logs": [],
        "template_path": str(template_path),
        "project_sequence": sequence,
        "mode": "debug",
        "debug_session_id": session.session_id,
        "scope": scope,
        "stage": request.stage,
        "block_key": request.block_key,
    }

    def _run_debug():
        def progress_cb(**kwargs):
            _record_task_progress(task_id, serial_number or session.session_id, kwargs)
            session.record_runtime_event({"task_id": task_id, **kwargs})

        try:
            session.mark_running("工作台调试任务已启动")
            progress_cb(
                step=0,
                total_steps=6 if scope == "full" else 1,
                step_name="准备工作台调试",
                status="running",
                message=f"模板文件: {template_path}",
                event="detail",
            )
            template = deployment_mod_executor.planner.parser.parse_file(str(template_path))
            template.metadata.source = "workbench"
            plan = deployment_mod_executor.planner.build_plan(template, user_inputs)

            if scope == "stage":
                result = deployment_mod_executor.runtime.execute_stage(
                    template,
                    plan,
                    request.stage,
                    progress_callback=progress_cb,
                    serial_number=serial_number,
                    debug_controller=session,
                )
            elif scope == "block":
                result = deployment_mod_executor.runtime.execute_block(
                    template,
                    plan,
                    request.block_key,
                    progress_callback=progress_cb,
                    serial_number=serial_number,
                    hydrate_context=bool(request.hydrate_context),
                    debug_controller=session,
                )
            else:
                result = deployment_mod_executor.runtime.execute(
                    template,
                    plan,
                    progress_callback=progress_cb,
                    debug_controller=session,
                )

            _deploy_tasks[task_id]["status"] = "completed" if result.success else "failed"
            _deploy_tasks[task_id]["result"] = result.to_dict()
            progress_cb(
                step=6 if scope == "full" else 1,
                total_steps=6 if scope == "full" else 1,
                step_name="工作台调试完成" if result.success else "工作台调试失败",
                status="completed" if result.success else "failed",
                message=result.message,
            )
            session.finish(success=result.success, message=result.message, result=result.to_dict())
        except DebugSessionStopped:
            _deploy_tasks[task_id]["status"] = "stopped"
            session.finish(success=False, message="调试会话已停止")
        except Exception as exc:
            _deploy_tasks[task_id]["status"] = "failed"
            progress_cb(
                step=0,
                total_steps=6 if scope == "full" else 1,
                step_name="工作台调试失败",
                status="failed",
                message=str(exc),
            )
            session.finish(success=False, message=str(exc), error=str(exc))

    threading.Thread(target=_run_debug, daemon=True).start()
    return {"success": True, "session_id": session.session_id, "task_id": task_id, "message": "工作台调试任务已启动", "session": session.to_dict()}


@router.get("/debug/{session_id}", summary="获取工作台调试会话", dependencies=[Depends(require_action("deploy.manage"))])
async def get_workbench_debug_session(session_id: str):
    session = debug_session_manager.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="调试会话不存在")
    return {"success": True, "session": session.to_dict()}


@router.post("/debug/{session_id}/pause", summary="暂停工作台调试", dependencies=[Depends(require_action("deploy.manage"))])
async def pause_workbench_debug_session(session_id: str):
    session = debug_session_manager.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="调试会话不存在")
    session.pause()
    return {"success": True, "session": session.to_dict()}


@router.post("/debug/{session_id}/resume", summary="恢复工作台调试", dependencies=[Depends(require_action("deploy.manage"))])
async def resume_workbench_debug_session(session_id: str):
    session = debug_session_manager.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="调试会话不存在")
    session.resume()
    return {"success": True, "session": session.to_dict()}


@router.post("/debug/{session_id}/stop", summary="停止工作台调试", dependencies=[Depends(require_action("deploy.manage"))])
async def stop_workbench_debug_session(session_id: str):
    session = debug_session_manager.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="调试会话不存在")
    session.stop()
    return {"success": True, "session": session.to_dict()}


@router.get("/workbench/{sequence}/form", summary="获取工作台试运行表单")
async def get_workbench_template_form(sequence: str):
    _, template_path = _resolve_workbench_template_path(sequence)
    try:
        template = deployment_mod_executor.planner.parser.parse_file(str(template_path))
        template.metadata.source = "workbench"
        return {
            "success": True,
            "template_path": str(template_path),
            "form": _enrich_form_schema(template),
            "launches": [item.to_dict() for item in template.launches],
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/progress/{task_id}", summary="查询模板部署进度")
async def get_template_progress(task_id: str):
    task = _deploy_tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    return {"success": True, **task}
