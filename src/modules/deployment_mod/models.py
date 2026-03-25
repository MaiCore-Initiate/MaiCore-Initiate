from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Literal, Optional


BuiltinProfile = Literal["maibot", "mofox-core", "neo-mofox"]


@dataclass
class TemplateMetadata:
    mod_id: str
    mod_name: str
    version: str
    description: str = ""
    author: str = ""
    tags: List[str] = field(default_factory=list)
    min_version: str = ""
    max_version: str = ""
    file_import: bool = False
    file_import_list: List[str] = field(default_factory=list)
    template_root: str = ""
    schema_version: str = "1.0.0"
    source: str = "local"

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class ComponentDefinition:
    name: str
    choose: bool = False
    install: bool = True
    check: bool = False
    command_install: bool = False
    install_method: str = ""
    installation_method: str = ""
    direct_link: str = ""
    install_operate: str = ""
    install_path: str = ""
    custom_path: str = ""
    env_output: bool = False
    env_input: bool = False
    raw: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class DeploymentDefinition:
    name: str
    choose: bool = False
    deploy: bool = True
    command_deploy: bool = False
    deploy_method: str = ""
    base_link: str = ""
    deploy_path: str = ""
    custom_path: str = ""
    install_method: str = ""
    get_version: str = ""
    github_repo: str = ""
    user_choose: bool = False
    choose_list: List[Any] = field(default_factory=list)
    env_output: bool = False
    env_input: bool = False
    raw: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class LaunchDefinition:
    name: str
    choose: bool = False
    launch: bool = True
    launch_command: List[str] = field(default_factory=list)
    env_input: bool = False
    raw: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class ConfigDefinition:
    name: str
    file_path: str
    choose: bool = False
    env_input: bool = False
    raw: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class TemplateFormField:
    key: str
    label: str
    field_type: Literal["text", "select", "boolean"]
    required: bool = False
    default: Any = None
    options: List[Dict[str, Any]] = field(default_factory=list)
    description: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class TemplateFormSchema:
    fields: List[TemplateFormField] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {"fields": [field.to_dict() for field in self.fields]}


@dataclass
class TemplateDefinition:
    metadata: TemplateMetadata
    components: List[ComponentDefinition] = field(default_factory=list)
    deployments: List[DeploymentDefinition] = field(default_factory=list)
    launches: List[LaunchDefinition] = field(default_factory=list)
    configs: List[ConfigDefinition] = field(default_factory=list)
    form_schema: TemplateFormSchema = field(default_factory=TemplateFormSchema)
    builtin_profile: BuiltinProfile = "maibot"
    raw: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "metadata": self.metadata.to_dict(),
            "components": [item.to_dict() for item in self.components],
            "deployments": [item.to_dict() for item in self.deployments],
            "launches": [item.to_dict() for item in self.launches],
            "configs": [item.to_dict() for item in self.configs],
            "form_schema": self.form_schema.to_dict(),
            "builtin_profile": self.builtin_profile,
        }


@dataclass
class ModBinding:
    template_id: str
    template_version: str
    schema_version: str = "1.0.0"
    source: str = "local"

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class DeploymentProfileBinding:
    deployment_id: str
    launch_id: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class ComponentBinding:
    component_id: str
    enabled: bool
    selected_value: Any = None

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class DeploymentPlan:
    template_id: str
    template_version: str
    builtin_profile: BuiltinProfile
    mod_binding: ModBinding
    deployment_profile: DeploymentProfileBinding
    component_bindings: List[ComponentBinding]
    template_inputs: Dict[str, Any]
    deploy_config: Dict[str, Any]
    summary: Dict[str, Any] = field(default_factory=dict)
    launches: List[LaunchDefinition] = field(default_factory=list)
    configs: List[ConfigDefinition] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "template_id": self.template_id,
            "template_version": self.template_version,
            "builtin_profile": self.builtin_profile,
            "mod_binding": self.mod_binding.to_dict(),
            "deployment_profile": self.deployment_profile.to_dict(),
            "component_bindings": [item.to_dict() for item in self.component_bindings],
            "template_inputs": self.template_inputs,
            "deploy_config": self.deploy_config,
            "summary": self.summary,
            "launches": [item.to_dict() for item in self.launches],
            "configs": [item.to_dict() for item in self.configs],
        }
