from __future__ import annotations

import os
from typing import Dict, List, Optional

import structlog

from .models import TemplateDefinition
from .parser import DeploymentModParser

logger = structlog.get_logger(__name__)


class DeploymentModRegistry:
    """扫描并注册本地 MOD 模板。"""

    def __init__(self, root_dir: Optional[str] = None):
        self.root_dir = root_dir or os.path.join(os.getcwd(), "MOD")
        self.parser = DeploymentModParser()
        self._templates: Dict[str, TemplateDefinition] = {}

    def scan(self) -> Dict[str, TemplateDefinition]:
        templates: Dict[str, TemplateDefinition] = {}
        if not os.path.isdir(self.root_dir):
            self._templates = {}
            return self._templates

        for entry in os.listdir(self.root_dir):
            template_file = os.path.join(self.root_dir, entry, "DeploymentMOD.toml")
            if not os.path.isfile(template_file):
                continue
            try:
                template = self.parser.parse_file(template_file)
                templates[template.metadata.mod_id] = template
            except Exception as exc:
                logger.warning("扫描 MOD 模板失败", template_file=template_file, error=str(exc))

        self._templates = templates
        return self._templates

    def get_all(self, refresh: bool = False) -> List[TemplateDefinition]:
        if refresh or not self._templates:
            self.scan()
        return list(self._templates.values())

    def get(self, template_id: str, refresh: bool = False) -> Optional[TemplateDefinition]:
        if refresh or not self._templates:
            self.scan()
        return self._templates.get(template_id)


deployment_mod_registry = DeploymentModRegistry()
