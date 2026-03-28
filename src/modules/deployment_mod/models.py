from __future__ import annotations

from dataclasses import asdict, dataclass, field, is_dataclass
from typing import Any, Dict, List, Literal, Optional


BuiltinProfile = Literal["maibot", "mofox-core", "neo-mofox", "custom"]


def _to_plain(value: Any) -> Any:
    if is_dataclass(value):
        return {key: _to_plain(item) for key, item in asdict(value).items()}
    if isinstance(value, dict):
        return {key: _to_plain(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_to_plain(item) for item in value]
    return value


@dataclass
class EnvBinding:
    name: str
    value: str

    def to_dict(self) -> Dict[str, Any]:
        return _to_plain(self)


@dataclass
class VersionFormattingRule:
    match: str
    replace: str

    def to_dict(self) -> Dict[str, Any]:
        return _to_plain(self)


@dataclass
class CustomInstallRule:
    extension: str
    operate: bool

    def to_dict(self) -> Dict[str, Any]:
        return _to_plain(self)


@dataclass
class StageSection:
    env_output: bool = False
    env_input: bool = False
    list: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return _to_plain(self)


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
    runtime: str = "powershell"
    platforms: List[str] = field(default_factory=list)
    schema_version: str = "1.0"
    template_root: str = ""
    source: str = "local"

    def to_dict(self) -> Dict[str, Any]:
        return _to_plain(self)


@dataclass
class BaseTaskDefinition:
    id: str
    name: str
    choose: bool = False
    env_output: bool = False
    env_output_list: List[EnvBinding] = field(default_factory=list)
    env_input: bool = False
    env_input_list: List[EnvBinding] = field(default_factory=list)
    raw: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return _to_plain(self)


@dataclass
class ComponentDefinition(BaseTaskDefinition):
    install: bool = True
    check: bool = False
    command_install: bool = False
    check_command: List[str] = field(default_factory=list)
    check_version_contains: List[str] = field(default_factory=list)
    install_command_list: List[str] = field(default_factory=list)
    get_method: str = ""
    direct_link: str = ""
    get_version: str = ""
    get_link: str = ""
    get_link_provide_list: List[str] = field(default_factory=list)
    github_repo: str = ""
    user_choose: bool = False
    choose_list: List[Any] = field(default_factory=list)
    format_version: bool = False
    version_formatting_formula: List[VersionFormattingRule] = field(default_factory=list)
    install_operate: str = ""
    install_custom_list: List[CustomInstallRule] = field(default_factory=list)
    install_path: str = ""
    custom_path: str = ""
    before_command: bool = False
    before_command_list: List[str] = field(default_factory=list)
    after_command: bool = False
    after_command_list: List[str] = field(default_factory=list)
    splicing_link: str = ""


@dataclass
class DeploymentDefinition(BaseTaskDefinition):
    deploy: bool = True
    command_deploy: bool = False
    deploy_command_list: List[str] = field(default_factory=list)
    deploy_method: str = ""
    base_link: str = ""
    deploy_path: str = ""
    custom_path: str = ""
    get_method: str = ""
    direct_link: str = ""
    get_version: str = ""
    get_link: str = ""
    get_link_provide_list: List[str] = field(default_factory=list)
    github_repo: str = ""
    user_choose: bool = False
    choose_list: List[Any] = field(default_factory=list)
    format_version: bool = False
    version_formatting_formula: List[VersionFormattingRule] = field(default_factory=list)
    splicing_link: str = ""
    before_command: bool = False
    before_command_list: List[str] = field(default_factory=list)
    after_command: bool = False
    after_command_list: List[str] = field(default_factory=list)


@dataclass
class LaunchDefinition(BaseTaskDefinition):
    launch: bool = True
    launch_command: List[str] = field(default_factory=list)


@dataclass
class ConfigDefinition(BaseTaskDefinition):
    file_path: str = ""


@dataclass
class UninstallDefinition(BaseTaskDefinition):
    uninstall: bool = True
    stop_before_uninstall: bool = False
    stop_command_list: List[str] = field(default_factory=list)
    remove_instance_config: bool = True
    remove_runtime_files: bool = True
    remove_deploy_root: bool = True
    remove_component: bool = False
    deployment_targets: List[str] = field(default_factory=list)
    component_targets: List[str] = field(default_factory=list)
    before_command: bool = False
    before_command_list: List[str] = field(default_factory=list)
    after_command: bool = False
    after_command_list: List[str] = field(default_factory=list)


@dataclass
class TemplateFormField:
    key: str
    label: str
    field_type: Literal["text", "select", "boolean", "hidden"]
    required: bool = False
    default: Any = None
    options: List[Dict[str, Any]] = field(default_factory=list)
    description: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return _to_plain(self)


@dataclass
class TemplateFormSchema:
    fields: List[TemplateFormField] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return _to_plain(self)


@dataclass
class TemplateDefinition:
    metadata: TemplateMetadata
    components_section: StageSection = field(default_factory=StageSection)
    deployments_section: StageSection = field(default_factory=StageSection)
    launches_section: StageSection = field(default_factory=StageSection)
    configs_section: StageSection = field(default_factory=StageSection)
    uninstalls_section: StageSection = field(default_factory=StageSection)
    components: List[ComponentDefinition] = field(default_factory=list)
    deployments: List[DeploymentDefinition] = field(default_factory=list)
    launches: List[LaunchDefinition] = field(default_factory=list)
    configs: List[ConfigDefinition] = field(default_factory=list)
    uninstalls: List[UninstallDefinition] = field(default_factory=list)
    form_schema: TemplateFormSchema = field(default_factory=TemplateFormSchema)
    builtin_profile: BuiltinProfile = "custom"
    raw: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return _to_plain(self)


@dataclass
class ModBinding:
    template_id: str
    template_version: str
    schema_version: str = "1.0"
    source: str = "local"

    def to_dict(self) -> Dict[str, Any]:
        return _to_plain(self)


@dataclass
class DeploymentProfileBinding:
    deployment_id: str
    launch_id: str
    config_id: str = ""
    uninstall_id: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return _to_plain(self)


@dataclass
class ComponentBinding:
    component_id: str
    enabled: bool
    selected_value: Any = None

    def to_dict(self) -> Dict[str, Any]:
        return _to_plain(self)


@dataclass
class DeploymentPlan:
    template_id: str
    template_version: str
    builtin_profile: BuiltinProfile
    mod_binding: ModBinding
    deployment_profile: DeploymentProfileBinding
    component_bindings: List[ComponentBinding]
    template_inputs: Dict[str, Any]
    deploy_config: Dict[str, Any] = field(default_factory=dict)
    summary: Dict[str, Any] = field(default_factory=dict)
    launches: List[LaunchDefinition] = field(default_factory=list)
    configs: List[ConfigDefinition] = field(default_factory=list)
    uninstalls: List[UninstallDefinition] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return _to_plain(self)


@dataclass
class RuntimeResult:
    success: bool
    message: str = ""
    stage: str = "full"
    instance_config_name: str = ""
    instance_config: Dict[str, Any] = field(default_factory=dict)
    exported_env: Dict[str, str] = field(default_factory=dict)
    selected_versions: Dict[str, str] = field(default_factory=dict)
    install_paths: Dict[str, str] = field(default_factory=dict)
    deploy_paths: Dict[str, str] = field(default_factory=dict)
    deployment_roots: Dict[str, str] = field(default_factory=dict)
    opened_files: List[str] = field(default_factory=list)
    launched_items: List[str] = field(default_factory=list)
    removed_paths: List[str] = field(default_factory=list)
    runtime_env_file: str = ""
    runtime_state_file: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return _to_plain(self)
