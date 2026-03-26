from __future__ import annotations

from typing import Any, Callable, Dict, Optional

from .models import DeploymentPlan, RuntimeResult
from .planner import DeploymentModPlanner
from .registry import deployment_mod_registry
from .runtime import DeploymentModRuntime


class DeploymentModExecutor:
    """模板部署执行入口。"""

    def __init__(self):
        self.planner = DeploymentModPlanner()
        self.runtime = DeploymentModRuntime()

    def build_plan(self, template_id: str, user_inputs: Dict[str, Any]) -> DeploymentPlan:
        template = deployment_mod_registry.get(template_id, refresh=True)
        if not template:
            raise ValueError(f"未找到模板: {template_id}")
        return self.planner.build_plan(template, user_inputs)

    def execute(
        self,
        template_id: str,
        user_inputs: Dict[str, Any],
        progress_callback: Optional[Callable] = None,
    ) -> RuntimeResult:
        template = deployment_mod_registry.get(template_id, refresh=True)
        if not template:
            raise ValueError(f"未找到模板: {template_id}")
        plan = self.planner.build_plan(template, user_inputs)
        return self.runtime.execute(template, plan, progress_callback=progress_callback)

    def execute_stage(
        self,
        template_id: str,
        stage: str,
        user_inputs: Dict[str, Any],
        progress_callback: Optional[Callable] = None,
        serial_number: str = "",
    ) -> RuntimeResult:
        template = deployment_mod_registry.get(template_id, refresh=True)
        if not template:
            raise ValueError(f"未找到模板: {template_id}")
        plan = self.planner.build_plan(template, user_inputs)
        return self.runtime.execute_stage(
            template,
            plan,
            stage=stage,
            progress_callback=progress_callback,
            serial_number=serial_number,
        )

    def execute_stage_for_instance(
        self,
        template_id: str,
        serial_number: str,
        stage: str,
        user_inputs: Optional[Dict[str, Any]] = None,
        progress_callback: Optional[Callable] = None,
    ) -> RuntimeResult:
        template = deployment_mod_registry.get(template_id, refresh=True)
        if not template:
            raise ValueError(f"未找到模板: {template_id}")
        config_name, config = self.runtime._find_instance_config(serial_number)
        _ = config_name
        stored_inputs = dict(config.get("template_inputs", {}) or {})
        merged_inputs = dict(stored_inputs)
        merged_inputs.update(user_inputs or {})
        merged_inputs["serial_number"] = serial_number
        plan = self.planner.build_plan(template, merged_inputs)
        return self.runtime.execute_stage(
            template,
            plan,
            stage=stage,
            progress_callback=progress_callback,
            serial_number=serial_number,
        )

    def deploy(
        self,
        deployment_manager: Any,
        template_id: str,
        user_inputs: Dict[str, Any],
        progress_callback: Optional[Callable] = None,
    ) -> bool:
        _ = deployment_manager
        result = self.execute(template_id, user_inputs, progress_callback=progress_callback)
        return result.success


deployment_mod_executor = DeploymentModExecutor()
