# -*- coding: utf-8 -*-
"""Deployment MOD WebUI API。"""
import asyncio
import threading
import uuid
from datetime import datetime
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..modules.deployment import deployment_manager
from ..modules.deployment_mod import deployment_mod_executor, deployment_mod_registry
from .auth_core import require_action
from .deploy_api import _deploy_tasks, _dispatch_progress, _remember_main_event_loop

router = APIRouter()


class TemplatePreviewRequest(BaseModel):
    template_id: str
    user_inputs: Dict[str, Any]


class TemplateDeployRequest(BaseModel):
    template_id: str
    user_inputs: Dict[str, Any]


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
        "form": template.form_schema.to_dict(),
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


@router.get("/progress/{task_id}", summary="查询模板部署进度")
async def get_template_progress(task_id: str):
    task = _deploy_tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    return {"success": True, **task}
