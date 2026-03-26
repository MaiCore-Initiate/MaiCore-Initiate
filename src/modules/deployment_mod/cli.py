from __future__ import annotations

import os
from typing import Any, Dict, Iterable

from rich.table import Table

from ...ui.interface import ui
from ...utils.common import setup_console
from .models import DeploymentPlan, TemplateDefinition, TemplateFormField
from .parser import DeploymentModParser
from .planner import DeploymentModPlanner
from .runtime import DeploymentModRuntime


class DeploymentModCliRunner:
    """命令行模式下的本地模板部署入口。"""

    AUTO_FILLED_KEYS = {"launcher_version"}
    MODE_TO_STAGE = {
        "deploy": "full",
        "component": "components",
        "launch": "launches",
        "config": "configs",
    }

    def __init__(self) -> None:
        self.parser = DeploymentModParser()
        self.planner = DeploymentModPlanner()
        self.runtime = DeploymentModRuntime()

    def run(self, template_path: str, mode: str = "deploy") -> int:
        setup_console()
        normalized_mode = self._normalize_mode(mode)
        resolved_path = self._resolve_template_path(template_path)
        template = self.parser.parse_file(resolved_path)

        ui.print_info(f"已加载部署模板: {template.metadata.mod_name}")
        ui.print_info(f"模板路径: {resolved_path}")
        if template.metadata.description:
            ui.print_info(template.metadata.description)

        if normalized_mode == "deploy":
            return self._run_full_deploy(template)
        if normalized_mode == "component":
            return self._run_component_stage(template)
        if normalized_mode in {"launch", "config"}:
            return self._run_existing_instance_stage(template, normalized_mode)
        raise ValueError(f"不支持的命令行模板模式: {mode}")

    def _run_full_deploy(self, template: TemplateDefinition) -> int:
        inputs = self._collect_inputs(template, field_filter=self._is_full_deploy_field)
        plan = self.planner.build_plan(template, inputs)
        self._show_plan_summary(template, plan, "完整部署")
        if not self._prompt_boolean("确认开始完整部署", True):
            ui.print_warning("已取消模板部署。")
            return 1
        result = self.runtime.execute(template, plan, progress_callback=self._progress_callback)
        return self._finalize_result(result, "完整部署")

    def _run_component_stage(self, template: TemplateDefinition) -> int:
        inputs = self._collect_inputs(template, field_filter=self._is_component_field)
        plan = self.planner.build_plan(template, inputs)
        self._show_plan_summary(template, plan, "组件阶段")
        if not self._prompt_boolean("确认执行组件阶段", True):
            ui.print_warning("已取消组件阶段执行。")
            return 1
        result = self.runtime.execute_stage(
            template,
            plan,
            stage=self.MODE_TO_STAGE["component"],
            progress_callback=self._progress_callback,
        )
        return self._finalize_result(result, "组件阶段")

    def _run_existing_instance_stage(self, template: TemplateDefinition, mode: str) -> int:
        serial_number = self._prompt_existing_instance_serial(mode)
        config_name, config = self.runtime._find_instance_config(serial_number)
        stored_inputs = dict(config.get("template_inputs", {}) or {})
        stored_inputs["serial_number"] = serial_number

        if mode == "launch":
            field_filter = self._is_launch_field
            stage_label = "启动阶段"
        else:
            field_filter = self._is_config_field
            stage_label = "配置阶段"

        inputs = self._collect_inputs(template, field_filter=field_filter, initial_values=stored_inputs)
        inputs["serial_number"] = serial_number

        plan = self.planner.build_plan(template, inputs)
        ui.print_info(f"目标实例: {config_name} / 序列号 {serial_number}")
        self._show_plan_summary(template, plan, stage_label)
        if not self._prompt_boolean(f"确认执行{stage_label}", True):
            ui.print_warning(f"已取消{stage_label}执行。")
            return 1

        result = self.runtime.execute_stage(
            template,
            plan,
            stage=self.MODE_TO_STAGE[mode],
            progress_callback=self._progress_callback,
            serial_number=serial_number,
        )
        return self._finalize_result(result, stage_label)

    def _collect_inputs(
        self,
        template: TemplateDefinition,
        field_filter,
        initial_values: Dict[str, Any] | None = None,
    ) -> Dict[str, Any]:
        ui.console.print()
        ui.console.print("[bold]请按模板要求填写部署参数[/bold]", style=ui.colors["primary"])
        inputs: Dict[str, Any] = dict(initial_values or {})

        for field in template.form_schema.fields:
            if field.key in self.AUTO_FILLED_KEYS:
                if field.default not in (None, ""):
                    inputs[field.key] = field.default
                continue
            if not field_filter(field):
                continue
            default_value = inputs.get(field.key, field.default)
            inputs[field.key] = self._prompt_field(field, default_value)

        return inputs

    def _prompt_field(self, field: TemplateFormField, default_value: Any) -> Any:
        if field.description:
            ui.print_info(f"{field.label}: {field.description}")

        if field.field_type == "boolean":
            return self._prompt_boolean(field.label, bool(default_value))
        if field.field_type == "select":
            return self._prompt_select(field, default_value)
        return self._prompt_text(field, default_value)

    def _prompt_text(self, field: TemplateFormField, default_value: Any) -> str:
        default = "" if default_value is None else str(default_value)
        while True:
            value = ui.get_input(field.label, default=default).strip()
            if value:
                return value
            if default:
                return default
            if not field.required:
                return ""
            ui.print_warning(f"{field.label} 为必填项，请继续输入。")

    def _prompt_select(self, field: TemplateFormField, default_value: Any) -> str:
        options = list(field.options or [])
        if not options:
            return self._prompt_text(field, default_value)

        default_candidate = default_value if default_value is not None else options[0].get("value", "")
        default_index = 1
        for index, option in enumerate(options, start=1):
            option_value = option.get("value", "")
            if option_value == default_candidate:
                default_index = index
            ui.console.print(f"  [{index}] {option.get('label', option_value)}")

        while True:
            selected = ui.get_input(f"{field.label} (输入序号)", default=str(default_index)).strip()
            if not selected:
                selected = str(default_index)
            if selected.isdigit():
                option_index = int(selected) - 1
                if 0 <= option_index < len(options):
                    return str(options[option_index].get("value", ""))
            ui.print_warning(f"{field.label} 请输入有效序号。")

    def _prompt_boolean(self, label: str, default: bool) -> bool:
        default_hint = "Y/n" if default else "y/N"
        while True:
            raw = ui.get_input(f"{label} [{default_hint}]", default="").strip().lower()
            if not raw:
                return default
            if raw in {"y", "yes", "1", "true"}:
                return True
            if raw in {"n", "no", "0", "false"}:
                return False
            ui.print_warning(f"{label} 请输入 y 或 n。")

    def _prompt_existing_instance_serial(self, mode: str) -> str:
        label = "启动" if mode == "launch" else "配置"
        while True:
            serial_number = ui.get_input(f"请输入要执行{label}阶段的实例序列号").strip()
            if not serial_number:
                ui.print_warning("实例序列号不能为空。")
                continue
            return serial_number

    def _show_plan_summary(self, template: TemplateDefinition, plan: DeploymentPlan, action_name: str) -> None:
        table = Table(
            show_header=True,
            header_style=ui.colors["table_header"],
            title=f"[bold]{template.metadata.mod_name} {action_name}摘要[/bold]",
            title_style=ui.colors["primary"],
            border_style=ui.colors["border"],
        )
        table.add_column("项目", style="cyan", width=18)
        table.add_column("值", style="green", width=80)
        table.add_row("模板 ID", template.metadata.mod_id)
        table.add_row("模板版本", template.metadata.version)
        table.add_row("组件", ", ".join(plan.summary.get("selected_components", [])) or "-")
        table.add_row("部署项", ", ".join(plan.summary.get("selected_deployments", [])) or "-")
        table.add_row("启动项", ", ".join(plan.summary.get("selected_launches", [])) or "-")
        table.add_row("配置项", ", ".join(plan.summary.get("selected_configs", [])) or "-")
        table.add_row("启动器版本", str(plan.summary.get("launcher_version", "") or "-"))
        ui.console.print()
        ui.console.print(table)
        ui.console.print()

    def _finalize_result(self, result, action_name: str) -> int:
        if not result.success:
            ui.print_error(f"{action_name}失败: {result.message}")
            return 1

        ui.print_success(f"{action_name}执行完成。")
        if result.instance_config_name:
            ui.print_success(f"实例配置已写入: {result.instance_config_name}")
        if result.runtime_env_file:
            ui.print_info(f"运行时环境文件: {result.runtime_env_file}")
        if result.runtime_state_file:
            ui.print_info(f"运行时状态文件: {result.runtime_state_file}")
        return 0

    def _progress_callback(self, step: int, total_steps: int, step_name: str, status: str, message: str) -> None:
        prefix = f"[{step}/{total_steps}] " if step and total_steps else ""
        detail = f"{prefix}{step_name}"
        if message:
            detail = f"{detail}: {message}"

        if status == "failed":
            ui.print_error(detail)
            return
        if status == "completed":
            ui.print_success(detail)
            return
        if status == "skipped":
            ui.print_warning(detail)
            return
        ui.print_info(detail)

    def _resolve_template_path(self, template_path: str) -> str:
        raw_path = str(template_path or "").strip().strip('"')
        if not raw_path:
            raise ValueError("缺少部署模板路径")

        expanded_path = os.path.expanduser(os.path.expandvars(raw_path))
        caller_cwd = str(os.environ.get("MCSB_CALLER_CWD", "") or "").strip()
        base_dir = caller_cwd if caller_cwd else os.getcwd()
        if os.path.isabs(expanded_path):
            resolved_path = os.path.abspath(expanded_path)
        else:
            resolved_path = os.path.abspath(os.path.join(base_dir, expanded_path))
        if os.path.isdir(resolved_path):
            resolved_path = os.path.join(resolved_path, "DeploymentMOD.toml")

        if not os.path.isfile(resolved_path):
            raise FileNotFoundError(f"部署模板不存在: {resolved_path}")
        return resolved_path

    @staticmethod
    def _normalize_mode(mode: str) -> str:
        normalized = str(mode or "").strip().lower()
        if normalized not in {"deploy", "launch", "config", "component"}:
            raise ValueError(f"不支持的命令行模板模式: {mode}")
        return normalized

    @staticmethod
    def _is_full_deploy_field(field: TemplateFormField) -> bool:
        return field.key != "launcher_version"

    @staticmethod
    def _has_prefix(key: str, prefixes: Iterable[str]) -> bool:
        return any(key.startswith(prefix) for prefix in prefixes)

    def _is_component_field(self, field: TemplateFormField) -> bool:
        return self._has_prefix(field.key, ("component::", "path::component::", "version::component::", "link::component::"))

    def _is_launch_field(self, field: TemplateFormField) -> bool:
        return field.key.startswith("launch::")

    def _is_config_field(self, field: TemplateFormField) -> bool:
        return field.key.startswith("config::")


deployment_mod_cli_runner = DeploymentModCliRunner()
