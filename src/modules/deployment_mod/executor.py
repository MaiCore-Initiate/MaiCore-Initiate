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
