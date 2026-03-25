from __future__ import annotations

from typing import Any, Callable, Dict, Optional

from .models import DeploymentPlan
from .planner import DeploymentModPlanner
from .registry import deployment_mod_registry


class DeploymentModExecutor:
    """模板部署执行桥接。"""

    def __init__(self):
        self.planner = DeploymentModPlanner()

    def build_plan(self, template_id: str, user_inputs: Dict[str, Any]) -> DeploymentPlan:
        template = deployment_mod_registry.get(template_id, refresh=True)
        if not template:
            raise ValueError(f"未找到模板: {template_id}")
        return self.planner.build_plan(template, user_inputs)

    def deploy(
        self,
        deployment_manager: Any,
        template_id: str,
        user_inputs: Dict[str, Any],
        progress_callback: Optional[Callable] = None,
    ) -> bool:
        plan = self.build_plan(template_id, user_inputs)
        deploy_config = dict(plan.deploy_config)
        deploy_config["mod_plan"] = plan.to_dict()
        deploy_config["mod_template_id"] = plan.template_id
        return deployment_manager.deploy_instance_webui(deploy_config, progress_callback=progress_callback)


deployment_mod_executor = DeploymentModExecutor()
