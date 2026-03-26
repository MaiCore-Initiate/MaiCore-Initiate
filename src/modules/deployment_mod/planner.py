from __future__ import annotations

from typing import Any, Dict

from .models import DeploymentPlan, TemplateDefinition
from .parser import DeploymentModParser


class DeploymentModPlanner:
    """根据模板定义和用户输入构造执行计划。"""

    def __init__(self, parser: DeploymentModParser | None = None):
        self.parser = parser or DeploymentModParser()

    def build_plan(self, template: TemplateDefinition, user_inputs: Dict[str, Any]) -> DeploymentPlan:
        return self.parser.build_plan(template, user_inputs)
