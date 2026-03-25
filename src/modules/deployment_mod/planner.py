from __future__ import annotations

from typing import Any, Dict, List, Optional

from ..deployment_core import MaiBotDeployer, MoFoxBotDeployer, NeoMoFoxDeployer, NapCatDeployer
from ...core.config import config_manager
from .models import (
    ComponentBinding,
    DeploymentPlan,
    DeploymentProfileBinding,
    ModBinding,
    TemplateDefinition,
)


class DeploymentModPlanner:
    """把模板定义与用户输入转换为标准部署计划。"""

    def __init__(self):
        self.maibot_deployer = MaiBotDeployer()
        self.mofox_deployer = MoFoxBotDeployer()
        self.neo_mofox_deployer = NeoMoFoxDeployer()
        self.napcat_deployer = NapCatDeployer()

    def build_plan(self, template: TemplateDefinition, user_inputs: Dict[str, Any]) -> DeploymentPlan:
        inputs = dict(user_inputs or {})
        serial_number = (inputs.get("serial_number") or "").strip()
        nickname = (inputs.get("nickname") or "").strip()
        install_dir = (inputs.get("install_dir") or "").strip()
        if not serial_number:
            raise ValueError("serial_number 不能为空")
        if not nickname:
            raise ValueError("nickname 不能为空")
        if not install_dir:
            raise ValueError("install_dir 不能为空")

        bot_type = inputs.get("bot_type") or self._profile_to_bot_type(template.builtin_profile)
        selected_version = self._resolve_version(template, inputs, bot_type)
        deployment_id = inputs.get("deployment_id") or (template.deployments[0].name if template.deployments else bot_type)
        launch_id = inputs.get("launch_id") or (template.launches[0].name if template.launches else deployment_id)

        component_bindings: List[ComponentBinding] = []
        for component in template.components:
            key = f"component::{component.name}"
            enabled = bool(inputs.get(key, component.install))
            component_bindings.append(ComponentBinding(component_id=component.name, enabled=enabled, selected_value=inputs.get(key)))

        deploy_config = {
            "bot_type": bot_type,
            "selected_version": selected_version,
            "install_adapter": bool(inputs.get("install_adapter", template.builtin_profile == "maibot")),
            "install_napcat": bool(inputs.get("install_napcat", False)),
            "napcat_version": self._resolve_napcat_version(inputs),
            "install_mongodb": bool(inputs.get("install_mongodb", False)),
            "mongodb_path": "",
            "install_webui": bool(inputs.get("install_webui", True)),
            "install_mofox_admin_ui": False,
            "install_mofox_webui": False,
            "install_dir": install_dir,
            "nickname": nickname,
            "qq_account": inputs.get("qq_account", "") or "",
            "serial_number": serial_number,
            "absolute_serial_number": config_manager.generate_unique_serial(),
            "from_webui": bool(inputs.get("from_webui", True)),
            "deployment_plan": {
                "template_id": template.metadata.mod_id,
                "deployment_id": deployment_id,
                "launch_id": launch_id,
            },
        }

        mod_binding = ModBinding(
            template_id=template.metadata.mod_id,
            template_version=template.metadata.version,
            schema_version=template.metadata.schema_version,
            source=template.metadata.source,
        )
        profile_binding = DeploymentProfileBinding(deployment_id=deployment_id, launch_id=launch_id)

        summary = {
            "template_name": template.metadata.mod_name,
            "bot_type": bot_type,
            "version": selected_version.get("display_name") or selected_version.get("name"),
            "components_enabled": [item.component_id for item in component_bindings if item.enabled],
        }

        return DeploymentPlan(
            template_id=template.metadata.mod_id,
            template_version=template.metadata.version,
            builtin_profile=template.builtin_profile,
            mod_binding=mod_binding,
            deployment_profile=profile_binding,
            component_bindings=component_bindings,
            template_inputs=inputs,
            deploy_config=deploy_config,
            summary=summary,
            launches=template.launches,
            configs=template.configs,
        )

    def _resolve_version(self, template: TemplateDefinition, inputs: Dict[str, Any], bot_type: str) -> Dict[str, Any]:
        manual_version = inputs.get("selected_version")
        if isinstance(manual_version, dict) and manual_version.get("name"):
            return manual_version

        version_name = (inputs.get("version_name") or "").strip()
        deployer = self._get_deployer(bot_type)
        versions = deployer.version_manager.get_versions()
        if version_name:
            for version in versions:
                if version.get("name") == version_name or version.get("display_name") == version_name:
                    return version
            raise ValueError(f"未找到版本: {version_name}")

        preferred_names = [
            item.raw.get("github_repo", "") for item in template.deployments if item.github_repo
        ]
        _ = preferred_names
        return versions[0] if versions else {"name": "main", "display_name": "main分支", "type": "branch", "download_url": ""}

    def _resolve_napcat_version(self, inputs: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        explicit = inputs.get("napcat_version")
        if isinstance(explicit, dict) and explicit:
            return explicit
        if not inputs.get("install_napcat"):
            return None
        versions = self.napcat_deployer.get_napcat_versions(False)
        return versions[0] if versions else None

    @staticmethod
    def _profile_to_bot_type(profile: str) -> str:
        mapping = {
            "maibot": "MaiBot",
            "mofox-core": "MoFox-Core",
            "neo-mofox": "Neo-MoFox",
        }
        return mapping.get(profile, "MaiBot")

    def _get_deployer(self, bot_type: str):
        if bot_type == "MoFox-Core":
            return self.mofox_deployer
        if bot_type == "Neo-MoFox":
            return self.neo_mofox_deployer
        return self.maibot_deployer
