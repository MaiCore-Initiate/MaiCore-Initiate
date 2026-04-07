from __future__ import annotations

import os
import platform
import re
from typing import Any, Dict, List, Optional

import toml

from ...core.p_config import p_config_manager
from .models import (
    ComponentBinding,
    ComponentDefinition,
    ConfigDefinition,
    CustomInstallRule,
    DeploymentDefinition,
    DeploymentPlan,
    DeploymentProfileBinding,
    EnvBinding,
    LaunchDefinition,
    ModBinding,
    StageSection,
    TemplateDefinition,
    TemplateFormField,
    TemplateFormSchema,
    TemplateMetadata,
    UninstallDefinition,
    VersionFormattingRule,
)


class DeploymentModParser:
    """解析并规范化 DeploymentMOD.toml。"""

    ARRAY_SECTIONS = {"Component", "Deployment", "LaunchItem", "ConfigItem", "UninstallItem"}

    def parse_file(self, file_path: str) -> TemplateDefinition:
        with open(file_path, "r", encoding="utf-8") as handle:
            raw = toml.load(handle)
        return self.parse(raw, template_root=os.path.dirname(file_path))

    def parse(self, raw: Dict[str, Any], template_root: str = "") -> TemplateDefinition:
        mcstart = raw.get("MCStart", {})
        if not bool(mcstart.get("MCStart")):
            raise ValueError("缺少 MCStart.MCStart=true 标记，无法注册模板")

        modinfo = raw.get("MODINFO", {})
        metadata = TemplateMetadata(
            mod_id=self._required_str(modinfo, "mod_id"),
            mod_name=self._required_str(modinfo, "mod_name"),
            version=self._required_str(modinfo, "version"),
            description=str(modinfo.get("description", "") or ""),
            author=str(modinfo.get("author", "") or ""),
            tags=self._ensure_list(modinfo.get("tags")),
            min_version=str(modinfo.get("min_version", "") or ""),
            max_version=str(modinfo.get("max_version", "") or ""),
            file_import=bool(modinfo.get("file_import", False)),
            file_import_list=self._ensure_list(modinfo.get("file_import_list")),
            runtime=str(modinfo.get("runtime", "powershell") or "powershell").strip().lower(),
            platforms=[str(item).strip().lower() for item in self._ensure_list(modinfo.get("platforms")) if str(item).strip()],
            schema_version=str(modinfo.get("schema_version", "1.0") or "1.0"),
            template_root=template_root,
        )

        self._validate_metadata(metadata)

        components_section = self._parse_stage_section(raw.get("COMPONENTS", {}))
        deployments_section = self._parse_stage_section(raw.get("DEPLOY", {}))
        launches_section = self._parse_stage_section(raw.get("LAUNCH", {}))
        configs_section = self._parse_stage_section(raw.get("CONFIG", {}))
        uninstalls_section = self._parse_stage_section(raw.get("UNINSTALL", {}))

        components = [self._parse_component(item) for item in raw.get("Component", [])]
        deployments = [self._parse_deployment(item) for item in raw.get("Deployment", [])]
        launches = [self._parse_launch(item) for item in raw.get("LaunchItem", [])]
        configs = [self._parse_config(item) for item in raw.get("ConfigItem", [])]
        uninstalls = [self._parse_uninstall(item) for item in raw.get("UninstallItem", [])]

        self._validate_stage_ids("COMPONENTS.list", components_section.list, [item.id for item in components])
        self._validate_stage_ids("DEPLOY.list", deployments_section.list, [item.id for item in deployments])
        self._validate_stage_ids("LAUNCH.list", launches_section.list, [item.id for item in launches])
        self._validate_stage_ids(
            "CONFIG.list",
            configs_section.list,
            [item.id or item.name for item in configs],
        )
        self._validate_stage_ids("UNINSTALL.list", uninstalls_section.list, [item.id for item in uninstalls])

        builtin_profile = self._infer_builtin_profile(deployments, launches)
        form_schema = self._build_form_schema(
            metadata,
            components,
            deployments,
            launches,
            configs,
            uninstalls,
            builtin_profile,
        )

        return TemplateDefinition(
            metadata=metadata,
            components_section=components_section,
            deployments_section=deployments_section,
            launches_section=launches_section,
            configs_section=configs_section,
            uninstalls_section=uninstalls_section,
            components=components,
            deployments=deployments,
            launches=launches,
            configs=configs,
            uninstalls=uninstalls,
            form_schema=form_schema,
            builtin_profile=builtin_profile,
            raw=raw,
        )

    def build_plan(self, template: TemplateDefinition, user_inputs: Dict[str, Any]) -> DeploymentPlan:
        inputs = dict(user_inputs or {})
        self.validate_runtime_constraints(template)

        component_bindings = [
            ComponentBinding(
                component_id=item.id,
                enabled=self._component_enabled(item, inputs),
                selected_value=inputs.get(f"component::{item.id}"),
            )
            for item in self._ordered_items(template.components_section.list, template.components)
        ]

        selected_deployments = [
            item.id
            for item in self._ordered_items(template.deployments_section.list, template.deployments)
            if bool(inputs.get(f"deployment::{item.id}", item.deploy if item.choose else item.deploy))
        ]
        selected_launches = [
            item.id
            for item in self._ordered_items(template.launches_section.list, template.launches)
            if bool(inputs.get(f"launch::{item.id}", item.launch if item.choose else item.launch))
        ]
        selected_configs = [
            (item.id or item.name)
            for item in self._ordered_items(template.configs_section.list, template.configs)
            if bool(inputs.get(f"config::{item.id or item.name}", True if item.choose else True))
        ]
        selected_uninstalls = [
            item.id
            for item in self._ordered_items(template.uninstalls_section.list, template.uninstalls)
            if bool(inputs.get(f"uninstall::{item.id}", item.uninstall if item.choose else item.uninstall))
        ]

        summary = {
            "template_name": template.metadata.mod_name,
            "runtime": template.metadata.runtime,
            "selected_components": [binding.component_id for binding in component_bindings if binding.enabled],
            "selected_deployments": selected_deployments,
            "selected_launches": selected_launches,
            "selected_configs": selected_configs,
            "selected_uninstalls": selected_uninstalls,
            "launcher_version": p_config_manager.get("launcher.version", ""),
        }

        deployment_profile = DeploymentProfileBinding(
            deployment_id=",".join(selected_deployments),
            launch_id=",".join(selected_launches),
            config_id=",".join(selected_configs),
            uninstall_id=",".join(selected_uninstalls),
        )

        return DeploymentPlan(
            template_id=template.metadata.mod_id,
            template_version=template.metadata.version,
            builtin_profile=template.builtin_profile,
            mod_binding=ModBinding(
                template_id=template.metadata.mod_id,
                template_version=template.metadata.version,
                schema_version=template.metadata.schema_version,
                source=template.metadata.source,
            ),
            deployment_profile=deployment_profile,
            component_bindings=component_bindings,
            template_inputs=inputs,
            summary=summary,
            launches=template.launches,
            configs=template.configs,
            uninstalls=template.uninstalls,
        )

    def validate_runtime_constraints(self, template: TemplateDefinition) -> None:
        current_platform = self._current_platform()
        platforms = set(template.metadata.platforms)
        if platforms and current_platform not in platforms:
            raise ValueError(f"当前平台为 {current_platform}，模板仅支持: {', '.join(sorted(platforms))}")

        launcher_version = str(p_config_manager.get("launcher.version", "") or "").strip()
        if launcher_version:
            if template.metadata.min_version and self._compare_versions(launcher_version, template.metadata.min_version) < 0:
                raise ValueError(
                    f"当前启动器版本 {launcher_version} 低于模板最低要求 {template.metadata.min_version}"
                )
            if template.metadata.max_version and self._compare_versions(launcher_version, template.metadata.max_version) > 0:
                raise ValueError(
                    f"当前启动器版本 {launcher_version} 高于模板最高支持版本 {template.metadata.max_version}"
                )

    def _parse_stage_section(self, raw: Dict[str, Any]) -> StageSection:
        return StageSection(
            env_output=bool(raw.get("env_output", False)),
            env_input=bool(raw.get("env_input", False)),
            list=[str(item) for item in self._ensure_list(raw.get("list")) if str(item).strip()],
        )

    def _parse_component(self, item: Dict[str, Any]) -> ComponentDefinition:
        get_method_val = str(item.get("get_method", "") or "").strip().lower()
        install_operate_val = str(item.get("install_operate", "") or "").strip().lower()
        get_version_val = str(item.get("get_version", "") or "").strip().lower()
        get_link_val = str(item.get("get_link", "") or "").strip().lower()

        self._validate_enum_field("get_method", get_method_val, ["", "direct", "get_version", "get_link"])
        self._validate_enum_field("install_operate", install_operate_val, ["", "auto", "no", "custom"])
        self._validate_enum_field("get_version", get_version_val, ["", "github_repo", "filelink", "custom"])
        self._validate_enum_field("get_link", get_link_val, ["", "filelink", "custom", "user_input"])

        return ComponentDefinition(
            id=self._required_str(item, "id"),
            name=self._optional_name(item),
            choose=bool(item.get("choose", False)),
            install=bool(item.get("install", True)),
            check=bool(item.get("check", False)),
            command_install=bool(item.get("command_install", False)),
            check_command=self._ensure_str_list(item.get("check_command")),
            check_version_contains=self._ensure_str_list(item.get("check_version_contains")),
            install_command_list=self._ensure_str_list(item.get("install_command_list")),
            get_method=get_method_val,
            direct_link=str(item.get("direct_link", "") or ""),
            get_version=get_version_val,
            get_link=get_link_val,
            get_link_provide_list=self._ensure_str_list(item.get("get_link_provide_list")),
            github_repo=str(item.get("github_repo", "") or ""),
            user_choose=bool(item.get("user_choose", False)),
            choose_list=self._ensure_list(item.get("choose_list")),
            format_version=bool(item.get("format_version", False)),
            version_formatting_formula=self._parse_version_formatting_formula(item.get("version_formatting_formula")),
            install_operate=install_operate_val,
            install_custom_list=self._parse_install_custom_list(item.get("install_custom_list")),
            install_path=str(item.get("install_path", "") or ""),
            custom_path=str(item.get("custom_path", "") or ""),
            before_command=bool(item.get("before_command", False)),
            before_command_list=self._ensure_str_list(item.get("before_command_list")),
            after_command=bool(item.get("after_command", False)),
            after_command_list=self._ensure_str_list(item.get("after_command_list")),
            env_output=bool(item.get("env_output", False)),
            env_output_list=self._parse_env_bindings(item.get("env_output_list")),
            env_input=bool(item.get("env_input", False)),
            env_input_list=self._parse_env_bindings(item.get("env_input_list")),
            splicing_link=str(item.get("splicing_link", "") or ""),
            raw=item,
        )

    def _parse_deployment(self, item: Dict[str, Any]) -> DeploymentDefinition:
        deploy_method_val = str(item.get("deploy_method", "") or "").strip().lower()
        get_method_val = str(item.get("get_method", "") or "").strip().lower()
        get_version_val = str(item.get("get_version", "") or "").strip().lower()
        get_link_val = str(item.get("get_link", "") or "").strip().lower()

        self._validate_enum_field("deploy_method", deploy_method_val, ["", "auto", "gitclone", "!gitclone", "getfile"])
        self._validate_enum_field("get_method", get_method_val, ["", "direct", "get_version", "get_link"])
        self._validate_enum_field("get_version", get_version_val, ["", "github_repo", "filelink", "custom"])
        self._validate_enum_field("get_link", get_link_val, ["", "filelink", "custom", "user_input"])

        return DeploymentDefinition(
            id=self._required_str(item, "id"),
            name=self._optional_name(item),
            choose=bool(item.get("choose", False)),
            deploy=bool(item.get("deploy", True)),
            command_deploy=bool(item.get("command_deploy", False)),
            deploy_command_list=self._ensure_str_list(item.get("deploy_command_list")),
            deploy_method=deploy_method_val,
            base_link=str(item.get("base_link", "") or ""),
            deploy_path=str(item.get("deploy_path", "") or ""),
            custom_path=str(item.get("custom_path", "") or ""),
            get_method=get_method_val,
            direct_link=str(item.get("direct_link", "") or ""),
            get_version=get_version_val,
            get_link=get_link_val,
            get_link_provide_list=self._ensure_str_list(item.get("get_link_provide_list")),
            github_repo=str(item.get("github_repo", "") or ""),
            user_choose=bool(item.get("user_choose", False)),
            choose_list=self._ensure_list(item.get("choose_list")),
            format_version=bool(item.get("format_version", False)),
            version_formatting_formula=self._parse_version_formatting_formula(item.get("version_formatting_formula")),
            splicing_link=str(item.get("splicing_link", "") or ""),
            before_command=bool(item.get("before_command", False)),
            before_command_list=self._ensure_str_list(item.get("before_command_list")),
            after_command=bool(item.get("after_command", False)),
            after_command_list=self._ensure_str_list(item.get("after_command_list")),
            env_output=bool(item.get("env_output", False)),
            env_output_list=self._parse_env_bindings(item.get("env_output_list")),
            env_input=bool(item.get("env_input", False)),
            env_input_list=self._parse_env_bindings(item.get("env_input_list")),
            raw=item,
        )

    def _parse_launch(self, item: Dict[str, Any]) -> LaunchDefinition:
        return LaunchDefinition(
            id=self._required_str(item, "id"),
            name=self._optional_name(item),
            choose=bool(item.get("choose", False)),
            launch=bool(item.get("launch", True)),
            launch_command=self._ensure_str_list(item.get("launch_command")),
            env_output=bool(item.get("env_output", False)),
            env_output_list=self._parse_env_bindings(item.get("env_output_list")),
            env_input=bool(item.get("env_input", False)),
            env_input_list=self._parse_env_bindings(item.get("env_input_list")),
            raw=item,
        )

    def _parse_config(self, item: Dict[str, Any]) -> ConfigDefinition:
        config_id = str(item.get("id", "") or item.get("name", "") or "").strip()
        return ConfigDefinition(
            id=config_id,
            name=self._optional_name(item),
            file_path=str(item.get("file_path", "") or ""),
            choose=bool(item.get("choose", False)),
            env_input=bool(item.get("env_input", False)),
            env_input_list=self._parse_env_bindings(item.get("env_input_list")),
            env_output=bool(item.get("env_output", False)),
            env_output_list=self._parse_env_bindings(item.get("env_output_list")),
            raw=item,
        )

    def _parse_uninstall(self, item: Dict[str, Any]) -> UninstallDefinition:
        return UninstallDefinition(
            id=self._required_str(item, "id"),
            name=self._optional_name(item),
            choose=bool(item.get("choose", False)),
            uninstall=bool(item.get("uninstall", True)),
            stop_before_uninstall=bool(item.get("stop_before_uninstall", False)),
            stop_command_list=self._ensure_str_list(item.get("stop_command_list")),
            remove_instance_config=bool(item.get("remove_instance_config", True)),
            remove_runtime_files=bool(item.get("remove_runtime_files", True)),
            remove_deploy_root=bool(item.get("remove_deploy_root", True)),
            remove_component=bool(item.get("remove_component", False)),
            deployment_targets=self._ensure_str_list(item.get("deployment_targets")),
            component_targets=self._ensure_str_list(item.get("component_targets")),
            before_command=bool(item.get("before_command", False)),
            before_command_list=self._ensure_str_list(item.get("before_command_list")),
            after_command=bool(item.get("after_command", False)),
            after_command_list=self._ensure_str_list(item.get("after_command_list")),
            env_input=bool(item.get("env_input", False)),
            env_input_list=self._parse_env_bindings(item.get("env_input_list")),
            env_output=bool(item.get("env_output", False)),
            env_output_list=self._parse_env_bindings(item.get("env_output_list")),
            raw=item,
        )

    def _build_form_schema(
        self,
        metadata: TemplateMetadata,
        components: List[ComponentDefinition],
        deployments: List[DeploymentDefinition],
        launches: List[LaunchDefinition],
        configs: List[ConfigDefinition],
        uninstalls: List[UninstallDefinition],
        builtin_profile: str,
    ) -> TemplateFormSchema:
        fields: List[TemplateFormField] = [
            TemplateFormField(
                key="nickname",
                label="实例名称",
                field_type="text",
                required=True,
                default="",
                description="用于保存实例配置和显示名称。",
            ),
            TemplateFormField(
                key="serial_number",
                label="实例序列号",
                field_type="text",
                required=True,
                default="",
                description="实例的唯一业务序列号。",
            ),
            TemplateFormField(
                key="qq_account",
                label="QQ账号",
                field_type="text",
                required=False,
                default="",
                description="可选，仅用于实例附加信息。",
            ),
            TemplateFormField(
                key="bot_type",
                label="部署画像",
                field_type="select",
                required=True,
                default=self._profile_to_bot_type(builtin_profile),
                options=[
                    {"label": "MaiBot", "value": "MaiBot"},
                    {"label": "MoFox-Core", "value": "MoFox-Core"},
                    {"label": "Neo-MoFox", "value": "Neo-MoFox"},
                    {"label": "Custom", "value": "Custom"},
                ],
                description="用于和现有实例配置兼容；不会回退到旧部署器。",
            ),
            TemplateFormField(
                key="launcher_version",
                label="启动器版本",
                field_type="text",
                required=False,
                default=str(p_config_manager.get("launcher.version", "") or ""),
                description=f"当前模板要求版本范围: {metadata.min_version or '*'} ~ {metadata.max_version or '*'}",
            ),
        ]

        for item in components:
            if item.choose and item.install:
                fields.append(
                    TemplateFormField(
                        key=f"component::{item.id}",
                        label=f"安装组件 {item.name}",
                        field_type="boolean",
                        default=item.install,
                        description="组件级可选开关。",
                    )
                )
            fields.extend(
                self._build_runtime_fields(
                    "component",
                    item.id,
                    item.install_path,
                    item.custom_path,
                    item.user_choose,
                    item.choose_list,
                    item.get_method,
                    item.get_link,
                    item.get_link_provide_list,
                )
            )

        for item in deployments:
            if item.choose:
                fields.append(
                    TemplateFormField(
                        key=f"deployment::{item.id}",
                        label=f"部署 {item.name}",
                        field_type="boolean",
                        default=item.deploy,
                        description="部署项级可选开关。",
                    )
                )
            fields.extend(
                self._build_runtime_fields(
                    "deployment",
                    item.id,
                    item.deploy_path,
                    item.custom_path,
                    item.user_choose,
                    item.choose_list,
                    item.get_method,
                    item.get_link,
                    item.get_link_provide_list,
                )
            )

        for item in launches:
            if item.choose:
                fields.append(
                    TemplateFormField(
                        key=f"launch::{item.id}",
                        label=f"启动 {item.name}",
                        field_type="boolean",
                        default=item.launch,
                        description="启动项级可选开关。",
                    )
                )

        for item in configs:
            if item.choose:
                fields.append(
                    TemplateFormField(
                        key=f"config::{item.id or item.name}",
                        label=f"打开配置 {item.name}",
                        field_type="boolean",
                        default=True,
                        description="配置文件打开开关。",
                    )
                )

        for item in uninstalls:
            if item.choose:
                fields.append(
                    TemplateFormField(
                        key=f"uninstall::{item.id}",
                        label=f"卸载 {item.name}",
                        field_type="boolean",
                        default=item.uninstall,
                        description="卸载项级可选开关。",
                    )
                )

        return TemplateFormSchema(fields=fields)

    def _build_runtime_fields(
        self,
        stage_name: str,
        item_id: str,
        path_value: str,
        custom_path: str,
        user_choose: bool,
        choose_list: List[Any],
        get_method: str,
        get_link: str,
        get_link_provide_list: List[str],
    ) -> List[TemplateFormField]:
        fields: List[TemplateFormField] = []
        if str(path_value or "").strip() == "$CustomPath" and str(custom_path or "").strip() == "$input$":
            fields.append(
                TemplateFormField(
                    key=f"path::{stage_name}::{item_id}",
                    label=f"{item_id} 路径",
                    field_type="text",
                    required=True,
                    default="",
                    description="模板要求用户输入的自定义路径。",
                )
            )
        if user_choose:
            string_choices = [str(item) for item in choose_list if isinstance(item, str)]
            has_integer_choices = any(isinstance(item, int) for item in choose_list)
            version_source = str(get_method or "").strip().lower()

            if string_choices and len(string_choices) == len(choose_list):
                fields.append(
                    TemplateFormField(
                        key=f"version::{stage_name}::{item_id}",
                        label=f"{item_id} 版本",
                        field_type="select",
                        required=False,
                        default=string_choices[0],
                        options=[{"label": item, "value": item} for item in string_choices],
                        description="模板声明了固定版本列表，可直接选择。",
                    )
                )
            elif version_source == "get_version" and (has_integer_choices or not choose_list):
                fields.append(
                    TemplateFormField(
                        key=f"version::{stage_name}::{item_id}",
                        label=f"{item_id} 版本",
                        field_type="hidden",
                        required=False,
                        default="",
                        options=[],
                        description="将从运行时数据源自动获取版本列表。",
                    )
                )
            else:
                fields.append(
                    TemplateFormField(
                        key=f"version::{stage_name}::{item_id}",
                        label=f"{item_id} 版本",
                        field_type="text",
                        required=False,
                        default="",
                        description="可留空使用自动选择，也可手动指定版本/分支/标签。",
                    )
                )
        link_mode = str(get_link or "").strip().lower()
        link_options = [str(item) for item in get_link_provide_list if str(item).strip()]
        if link_options:
            fields.append(
                TemplateFormField(
                    key=f"link::{stage_name}::{item_id}",
                    label=f"{item_id} 下载链接",
                    field_type="select",
                    required=False,
                    default=link_options[0],
                    options=[{"label": item, "value": item} for item in link_options],
                    description="模板声明了固定下载链接候选列表，可直接选择。",
                )
            )
        elif link_mode == "user_input":
            fields.append(
                TemplateFormField(
                    key=f"link::{stage_name}::{item_id}",
                    label=f"{item_id} 下载链接",
                    field_type="text",
                    required=True,
                    default="",
                    description="模板要求用户输入完整下载链接。",
                )
            )
        elif str(get_method or "").strip().lower() == "get_link" and link_mode in {"filelink", "custom"}:
            fields.append(
                TemplateFormField(
                    key=f"link::{stage_name}::{item_id}",
                    label=f"{item_id} 下载链接",
                    field_type="hidden",
                    required=False,
                    default="",
                    options=[],
                    description="将从运行时数据源自动获取下载链接列表。",
                )
            )
        return fields

    def _infer_builtin_profile(
        self,
        deployments: List[DeploymentDefinition],
        launches: List[LaunchDefinition],
    ) -> str:
        names = {item.name.lower() for item in deployments + launches if item.name}
        ids = {item.id.lower() for item in deployments + launches if item.id}
        tokens = names | ids
        if any("neo-mofox" in token for token in tokens):
            return "neo-mofox"
        if any(token in {"mofox-core", "mofox_bot", "adapter"} or "mofox" in token for token in tokens):
            if any("maibot" in token for token in tokens):
                return "maibot"
            return "mofox-core"
        if any("maibot" in token for token in tokens):
            return "maibot"
        return "custom"

    @staticmethod
    def _profile_to_bot_type(profile: str) -> str:
        mapping = {
            "maibot": "MaiBot",
            "mofox-core": "MoFox-Core",
            "neo-mofox": "Neo-MoFox",
            "custom": "Custom",
        }
        return mapping.get(profile, "Custom")

    def _validate_metadata(self, metadata: TemplateMetadata) -> None:
        if metadata.file_import and not metadata.file_import_list:
            raise ValueError("启用 file_import 时必须提供 file_import_list")
        if metadata.template_root and metadata.file_import:
            for filename in metadata.file_import_list:
                file_path = os.path.join(metadata.template_root, filename)
                if not os.path.isfile(file_path):
                    raise ValueError(f"文件导入项不存在: {filename}")
        if metadata.runtime not in {"powershell", "cmd", "bash", "python3"}:
            raise ValueError(f"暂不支持的 runtime: {metadata.runtime}")

    def _validate_stage_ids(self, label: str, ordered_ids: List[str], actual_ids: List[str]) -> None:
        actual_set = set(actual_ids)
        for item_id in ordered_ids:
            if item_id not in actual_set:
                raise ValueError(f"{label} 中声明了未定义的条目: {item_id}")

    @staticmethod
    def _component_enabled(item: ComponentDefinition, inputs: Dict[str, Any]) -> bool:
        if item.install:
            default_value = item.install
            if item.choose:
                return bool(inputs.get(f"component::{item.id}", default_value))
            return default_value
        if item.check:
            return True
        return False

    @staticmethod
    def _required_str(item: Dict[str, Any], key: str) -> str:
        value = str(item.get(key, "") or "").strip()
        if not value:
            raise ValueError(f"缺少必填字段: {key}")
        return value

    @staticmethod
    def _optional_name(item: Dict[str, Any]) -> str:
        return str(item.get("name", item.get("id", "")) or "").strip()

    @staticmethod
    def _validate_enum_field(field_name: str, value: str, valid_options: List[str]) -> None:
        if value not in valid_options:
            raise ValueError(f"字段 {field_name} 的值 '{value}' 非法，可选值: {', '.join(repr(v) for v in valid_options)}")

    @staticmethod
    def _ensure_list(value: Any) -> List[Any]:
        if value is None:
            return []
        if isinstance(value, list):
            return value
        return [value]

    def _ensure_str_list(self, value: Any) -> List[str]:
        return [str(item) for item in self._ensure_list(value)]

    def _parse_env_bindings(self, value: Any) -> List[EnvBinding]:
        bindings: List[EnvBinding] = []
        for item in self._ensure_list(value):
            if not isinstance(item, dict):
                continue
            name = str(item.get("name", "") or "").strip()
            if not name:
                continue
            bindings.append(EnvBinding(name=name, value=str(item.get("value", "") or "")))
        return bindings

    def _parse_version_formatting_formula(self, value: Any) -> List[VersionFormattingRule]:
        items: List[VersionFormattingRule] = []
        for item in self._ensure_list(value):
            if not isinstance(item, dict):
                continue
            items.append(
                VersionFormattingRule(
                    match=str(item.get("match", "") or ""),
                    replace=str(item.get("replace", "") or ""),
                )
            )
        return items

    def _parse_install_custom_list(self, value: Any) -> List[CustomInstallRule]:
        items: List[CustomInstallRule] = []
        for item in self._ensure_list(value):
            if not isinstance(item, dict):
                continue
            extension = str(item.get("extension", "") or "").strip().lower()
            if not extension:
                continue
            items.append(CustomInstallRule(extension=extension, operate=bool(item.get("operate", False))))
        return items

    @staticmethod
    def _ordered_items(order: List[str], items: List[Any]) -> List[Any]:
        if not order:
            return items
        item_map = {item.id if getattr(item, "id", "") else item.name: item for item in items}
        return [item_map[item_id] for item_id in order if item_id in item_map]

    @staticmethod
    def _current_platform() -> str:
        system_name = platform.system().lower()
        if system_name.startswith("win"):
            return "windows"
        if system_name == "darwin":
            return "macos"
        return "linux"

    @staticmethod
    def _compare_versions(left: str, right: str) -> int:
        def normalize(value: str) -> List[Any]:
            parts = re.split(r"[.\-+_]", str(value or "").strip().lower())
            normalized: List[Any] = []
            for part in parts:
                if not part:
                    continue
                normalized.append(int(part) if part.isdigit() else part)
            return normalized

        left_parts = normalize(left)
        right_parts = normalize(right)
        max_len = max(len(left_parts), len(right_parts))
        for index in range(max_len):
            left_part = left_parts[index] if index < len(left_parts) else 0
            right_part = right_parts[index] if index < len(right_parts) else 0
            if left_part == right_part:
                continue
            if isinstance(left_part, int) and isinstance(right_part, str):
                return 1
            if isinstance(left_part, str) and isinstance(right_part, int):
                return -1
            return 1 if left_part > right_part else -1
        return 0
