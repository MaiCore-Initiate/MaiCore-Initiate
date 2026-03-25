from __future__ import annotations

import os
from typing import Any, Dict, List

import toml

from .models import (
    ComponentDefinition,
    ConfigDefinition,
    DeploymentDefinition,
    LaunchDefinition,
    TemplateDefinition,
    TemplateFormField,
    TemplateFormSchema,
    TemplateMetadata,
)


class DeploymentModParser:
    """解析 DeploymentMOD.toml。"""

    def parse_file(self, file_path: str) -> TemplateDefinition:
        with open(file_path, "r", encoding="utf-8") as handle:
            raw = toml.load(handle)
        return self.parse(raw, template_root=os.path.dirname(file_path))

    def parse(self, raw: Dict[str, Any], template_root: str = "") -> TemplateDefinition:
        mcstart = raw.get("MCStart", {})
        if not mcstart.get("MCStart"):
            raise ValueError("缺少 MCStart.MCStart=true 标记，无法注册模板")

        modinfo = raw.get("MODINFO", {})
        mod_id = (modinfo.get("mod_id") or "").strip()
        mod_name = (modinfo.get("mod_name") or "").strip()
        version = (modinfo.get("version") or "").strip()
        if not mod_id or not mod_name or not version:
            raise ValueError("模板必须提供 mod_id / mod_name / version")

        metadata = TemplateMetadata(
            mod_id=mod_id,
            mod_name=mod_name,
            version=version,
            description=modinfo.get("description", "") or "",
            author=modinfo.get("author", "") or "",
            tags=self._ensure_list(modinfo.get("tags")),
            min_version=modinfo.get("min_version", "") or "",
            max_version=modinfo.get("max_version", "") or "",
            file_import=bool(modinfo.get("file_import", False)),
            file_import_list=self._ensure_list(modinfo.get("file_import_list")),
            template_root=template_root,
        )

        components = [self._parse_component(item) for item in raw.get("Component", [])]
        deployments = [self._parse_deployment(item) for item in raw.get("Deployment", [])]
        launches = [self._parse_launch(item) for item in raw.get("LaunchItem", [])]
        configs = [self._parse_config(item) for item in raw.get("ConfigItem", [])]

        builtin_profile = self._infer_builtin_profile(deployments)
        form_schema = self._build_form_schema(raw, deployments, launches, components, builtin_profile)

        return TemplateDefinition(
            metadata=metadata,
            components=components,
            deployments=deployments,
            launches=launches,
            configs=configs,
            form_schema=form_schema,
            builtin_profile=builtin_profile,
            raw=raw,
        )

    def _parse_component(self, item: Dict[str, Any]) -> ComponentDefinition:
        return ComponentDefinition(
            name=item.get("name", ""),
            choose=bool(item.get("choose", False)),
            install=bool(item.get("install", True)),
            check=bool(item.get("check", False)),
            command_install=bool(item.get("command_install", False)),
            install_method=item.get("install_method", "") or "",
            installation_method=item.get("Installation_method", "") or item.get("installation_method", "") or "",
            direct_link=item.get("direct_link", "") or "",
            install_operate=item.get("install_operate", "") or "",
            install_path=item.get("install_path", "") or "",
            custom_path=item.get("custom_path", "") or "",
            env_output=bool(item.get("env_outpot", False)),
            env_input=bool(item.get("env_input", False)),
            raw=item,
        )

    def _parse_deployment(self, item: Dict[str, Any]) -> DeploymentDefinition:
        return DeploymentDefinition(
            name=item.get("name", ""),
            choose=bool(item.get("choose", False)),
            deploy=bool(item.get("deploy", True)),
            command_deploy=bool(item.get("command_deploy", False)),
            deploy_method=item.get("deploy_method", "") or "",
            base_link=item.get("base_link", "") or "",
            deploy_path=item.get("deploy_path", "") or "",
            custom_path=item.get("custom_path", "") or "",
            install_method=item.get("install_method", "") or "",
            get_version=item.get("get_version", "") or "",
            github_repo=item.get("github_repo", "") or "",
            user_choose=bool(item.get("user_choose", False)),
            choose_list=self._ensure_list(item.get("choose_list")),
            env_output=bool(item.get("env_outpot", False)),
            env_input=bool(item.get("env_input", False)),
            raw=item,
        )

    def _parse_launch(self, item: Dict[str, Any]) -> LaunchDefinition:
        return LaunchDefinition(
            name=item.get("name", ""),
            choose=bool(item.get("choose", False)),
            launch=bool(item.get("launch", True)),
            launch_command=self._ensure_list(item.get("launch_command")),
            env_input=bool(item.get("env_input", False)),
            raw=item,
        )

    def _parse_config(self, item: Dict[str, Any]) -> ConfigDefinition:
        return ConfigDefinition(
            name=item.get("name", ""),
            file_path=item.get("file_path", "") or "",
            choose=bool(item.get("choose", False)),
            env_input=bool(item.get("env_input", False)),
            raw=item,
        )

    def _infer_builtin_profile(self, deployments: List[DeploymentDefinition]) -> str:
        names = {item.name.lower() for item in deployments}
        if "neo-mofox" in names:
            return "neo-mofox"
        if "mofox-core" in names or "mofox_bot" in names:
            return "mofox-core"
        return "maibot"

    def _build_form_schema(
        self,
        raw: Dict[str, Any],
        deployments: List[DeploymentDefinition],
        launches: List[LaunchDefinition],
        components: List[ComponentDefinition],
        builtin_profile: str,
    ) -> TemplateFormSchema:
        fields: List[TemplateFormField] = [
            TemplateFormField(key="nickname", label="实例名称", field_type="text", required=True, default=""),
            TemplateFormField(key="serial_number", label="实例序列号", field_type="text", required=True, default=""),
            TemplateFormField(key="install_dir", label="安装目录", field_type="text", required=True, default=os.path.join(os.getcwd(), "instances")),
            TemplateFormField(key="qq_account", label="QQ 账号", field_type="text", required=False, default=""),
        ]

        profile_options = {
            "maibot": "MaiBot",
            "mofox-core": "MoFox-Core",
            "neo-mofox": "Neo-MoFox",
        }
        fields.append(
            TemplateFormField(
                key="bot_type",
                label="部署画像",
                field_type="select",
                required=True,
                default=profile_options[builtin_profile],
                options=[{"label": profile_options[builtin_profile], "value": profile_options[builtin_profile]}],
                description="当前模板映射到现有内建部署画像。",
            )
        )

        deployment_names = [item.name for item in deployments if item.name]
        if deployment_names:
            fields.append(
                TemplateFormField(
                    key="deployment_id",
                    label="部署方案",
                    field_type="select",
                    required=True,
                    default=deployment_names[0],
                    options=[{"label": name, "value": name} for name in deployment_names],
                )
            )

        launch_names = [item.name for item in launches if item.name]
        if launch_names:
            fields.append(
                TemplateFormField(
                    key="launch_id",
                    label="启动方案",
                    field_type="select",
                    required=True,
                    default=launch_names[0],
                    options=[{"label": name, "value": name} for name in launch_names],
                )
            )

        fields.extend([
            TemplateFormField(key="install_adapter", label="安装适配器", field_type="boolean", default=builtin_profile == "maibot"),
            TemplateFormField(key="install_napcat", label="安装 NapCat", field_type="boolean", default=False),
            TemplateFormField(key="install_webui", label="启用 WebUI", field_type="boolean", default=True),
            TemplateFormField(key="install_mongodb", label="安装 MongoDB", field_type="boolean", default=False),
        ])

        for component in components:
            if component.choose:
                fields.append(
                    TemplateFormField(
                        key=f"component::{component.name}",
                        label=f"组件：{component.name}",
                        field_type="boolean",
                        default=component.install,
                        description="是否启用该模板组件。",
                    )
                )

        return TemplateFormSchema(fields=fields)

    @staticmethod
    def _ensure_list(value: Any) -> List[Any]:
        if value is None:
            return []
        if isinstance(value, list):
            return value
        return [value]
