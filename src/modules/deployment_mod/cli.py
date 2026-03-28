from __future__ import annotations

import os
import time
from collections import deque
from typing import Any, Callable, Deque, Dict, Iterable, List, Optional

from rich.box import Box
from rich.console import Group
from rich.live import Live
from rich.panel import Panel
from rich.progress import BarColumn, DownloadColumn, Progress, TaskID, TextColumn, TimeRemainingColumn, TransferSpeedColumn
from rich.table import Table
from rich.text import Text

from ...ui.interface import ui
from ...utils.common import setup_console
from .models import DeploymentPlan, TemplateDefinition, TemplateFormField
from .parser import DeploymentModParser
from .planner import DeploymentModPlanner
from .runtime import DeploymentModRuntime


class _TemplateExecutionDisplay:
    """命令行模板执行期的 Rich 动画与进度条展示器。"""

    HISTORY_LIMIT = 8
    DOT_FRAMES = (
        "●○○○○○",
        "○●○○○○",
        "○○●○○○",
        "○○○●○○",
        "○○○○●○",
        "○○○○○●",
    )

    def __init__(self, title: str) -> None:
        self.title = title
        self.current_step = 0
        self.total_steps = 0
        self.current_stage = "等待执行"
        self.current_message = "准备开始..."
        self.history: Deque[tuple[str, str]] = deque(maxlen=self.HISTORY_LIMIT)
        self.download_tasks: Dict[str, TaskID] = {}
        self.command_output_label = ""
        self.command_output_lines: Deque[str] = deque(maxlen=12)
        self.progress = Progress(
            TextColumn("[bold cyan]{task.fields[prefix]}", justify="right"),
            TextColumn("{task.description}", style="bold"),
            BarColumn(bar_width=None),
            DownloadColumn(),
            TransferSpeedColumn(),
            TimeRemainingColumn(),
            console=ui.console,
            expand=True,
        )
        self.live = Live(self, console=ui.console, refresh_per_second=12, transient=False)
        self._started = False

    def __enter__(self) -> "_TemplateExecutionDisplay":
        self.start()
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        self.stop()

    def start(self) -> None:
        if self._started:
            return
        self.live.start()
        self._started = True

    def stop(self) -> None:
        if not self._started:
            return
        self.live.stop()
        self._started = False

    def __rich__(self) -> Group:
        renderables = [self._render_status_panel()]
        if self.download_tasks:
            renderables.append(
                Panel(
                    self.progress,
                    title="[bold]下载进度[/bold]",
                    title_align="left",
                    border_style=ui.colors["border"],
                )
            )
        if self.command_output_lines:
            renderables.append(
                Panel(
                    self._render_command_output(),
                    title=f"[bold]命令输出: {self.command_output_label}[/bold]" if self.command_output_label else "[bold]命令输出[/bold]",
                    title_align="left",
                    border_style=ui.colors["border"],
                    box=Box.ASCII,
                )
            )
        if self.history:
            renderables.append(
                Panel(
                    self._render_history(),
                    title="[bold]最近事件[/bold]",
                    title_align="left",
                    border_style=ui.colors["border"],
                )
            )
        return Group(*renderables)

    def update(
        self,
        *,
        step: int,
        total_steps: int,
        step_name: str,
        status: str,
        message: str,
        event: str = "stage",
        **payload: Any,
    ) -> None:
        if event == "download":
            self._update_download(step_name=step_name, status=status, message=message, **payload)
        elif event == "command_output":
            self._update_command_output(step_name=step_name, message=message, **payload)
        else:
            self._update_stage(step=step, total_steps=total_steps, step_name=step_name, status=status, message=message)
        self._refresh()

    def _update_command_output(self, *, step_name: str, message: str, **payload: Any) -> None:
        """处理命令输出的流式更新。"""
        if step_name:
            self.command_output_label = step_name
        if message:
            lines = message.splitlines()
            for line in lines:
                stripped = line.strip()
                if stripped:
                    self.command_output_lines.append(stripped)

    def _update_stage(self, *, step: int, total_steps: int, step_name: str, status: str, message: str) -> None:
        detail = self._format_detail(step, total_steps, step_name, message)
        compact_message = self._compact_message(message)

        if status == "running":
            if step and total_steps:
                self.current_step = step
                self.total_steps = total_steps
            if step_name:
                self.current_stage = step_name
            if compact_message:
                self.current_message = compact_message
            return

        self._append_history(status, detail)
        if step and total_steps:
            self.current_step = step
            self.total_steps = total_steps
        if step_name:
            self.current_stage = step_name
        if compact_message:
            self.current_message = compact_message
        if status == "failed":
            self.current_message = compact_message or detail

    def _update_download(self, *, step_name: str, status: str, message: str, **payload: Any) -> None:
        download_id = str(payload.get("download_id") or step_name)
        filename = str(payload.get("filename") or download_id)
        download_status = str(payload.get("download_status") or status or "progress")
        total_bytes = self._safe_int(payload.get("total_bytes"))
        downloaded_bytes = self._safe_int(payload.get("downloaded_bytes"))
        task_id = self.download_tasks.get(download_id)

        if task_id is None and download_status in {"started", "progress", "completed"}:
            task_id = self.progress.add_task(
                filename,
                total=total_bytes or None,
                completed=downloaded_bytes,
                prefix="[下载]",
            )
            self.download_tasks[download_id] = task_id

        if task_id is not None:
            update_kwargs: Dict[str, Any] = {"description": filename, "completed": downloaded_bytes}
            if total_bytes > 0:
                update_kwargs["total"] = total_bytes
            elif download_status == "completed":
                update_kwargs["total"] = max(downloaded_bytes, 1)
                update_kwargs["completed"] = max(downloaded_bytes, 1)
            self.progress.update(task_id, **update_kwargs)

        self.current_stage = step_name or self.current_stage
        self.current_message = self._compact_message(message) or f"{filename} 正在下载"

        if download_status == "completed":
            self._append_history("completed", f"{step_name}: {self.current_message}")
            self._remove_download_task(download_id)
            return

        if download_status == "failed":
            error_message = self._compact_message(str(payload.get("error", "") or ""))
            if error_message:
                self.current_message = f"{self.current_message} ({error_message})"
            self._append_history("failed", f"{step_name}: {self.current_message}")
            self._remove_download_task(download_id)

    def _render_status_panel(self) -> Panel:
        headline = Text()
        headline.append(f"{self._frame()} ", style=ui.colors["primary"])
        prefix = f"[{self.current_step}/{self.total_steps}] " if self.current_step and self.total_steps else ""
        headline.append(f"{prefix}{self.current_stage}", style=f"bold {ui.colors['primary']}")

        body = Text()
        if self.current_message:
            body.append(self.current_message, style="white")
        if self.download_tasks:
            if body:
                body.append("\n")
            body.append(f"活跃下载: {len(self.download_tasks)}", style="dim")

        content = Text()
        content.append_text(headline)
        if body:
            content.append("\n")
            content.append_text(body)

        return Panel(
            content,
            title=f"[bold]{self.title}[/bold]",
            title_align="left",
            border_style=ui.colors["primary"],
        )

    def _render_history(self) -> Text:
        result = Text()
        for index, (status, detail) in enumerate(self.history):
            if index:
                result.append("\n")
            prefix, style = self._history_style(status)
            result.append(f"{prefix} ", style=style)
            result.append(detail, style=style)
        return result

    def _render_command_output(self) -> Text:
        """渲染命令输出区域。"""
        result = Text()
        for index, line in enumerate(self.command_output_lines):
            if index:
                result.append("\n")
            result.append(f"│ {line}", style="dim")
        if not self.command_output_lines:
            result.append("[dim]等待输出...[/dim]", style="dim")
        return result

    def _append_history(self, status: str, detail: str) -> None:
        compact_detail = self._compact_message(detail)
        if not compact_detail:
            return
        self.history.append((status, compact_detail))

    def _remove_download_task(self, download_id: str) -> None:
        task_id = self.download_tasks.pop(download_id, None)
        if task_id is not None:
            self.progress.remove_task(task_id)

    def _refresh(self) -> None:
        if self._started:
            self.live.refresh()

    def _frame(self) -> str:
        frame_index = int(time.monotonic() * 8) % len(self.DOT_FRAMES)
        return self.DOT_FRAMES[frame_index]

    @staticmethod
    def _format_detail(step: int, total_steps: int, step_name: str, message: str) -> str:
        prefix = f"[{step}/{total_steps}] " if step and total_steps else ""
        detail = f"{prefix}{step_name}"
        compact_message = _TemplateExecutionDisplay._compact_message(message)
        if compact_message:
            return f"{detail}: {compact_message}"
        return detail

    @staticmethod
    def _compact_message(message: str, limit: int = 220) -> str:
        lines = [line.strip() for line in str(message or "").splitlines() if line.strip()]
        if not lines:
            return ""
        compact = " | ".join(lines[-3:])
        if len(compact) > limit:
            return f"{compact[: limit - 3]}..."
        return compact

    @staticmethod
    def _history_style(status: str) -> tuple[str, str]:
        return {
            "completed": ("[OK]", ui.colors["success"]),
            "failed": ("[ERR]", ui.colors["error"]),
            "skipped": ("[SKIP]", ui.colors["warning"]),
        }.get(status, ("[INFO]", ui.colors["info"]))

    @staticmethod
    def _safe_int(value: Any) -> int:
        try:
            return int(value or 0)
        except (TypeError, ValueError):
            return 0


class DeploymentModCliRunner:
    """命令行模式下的本地模板部署入口。"""

    AUTO_FILLED_KEYS = {"launcher_version"}
    MODE_TO_STAGE = {
        "deploy": "full",
        "component": "components",
        "launch": "launches",
        "config": "configs",
        "uninstall": "uninstalls",
    }

    def __init__(self) -> None:
        self.parser = DeploymentModParser()
        self.planner = DeploymentModPlanner()
        self.runtime = DeploymentModRuntime()
        self._display: Optional[_TemplateExecutionDisplay] = None

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
        if normalized_mode in {"launch", "config", "uninstall"}:
            return self._run_existing_instance_stage(template, normalized_mode)
        raise ValueError(f"不支持的命令行模板模式: {mode}")

    def _run_full_deploy(self, template: TemplateDefinition) -> int:
        inputs = self._collect_inputs(template, field_filter=self._is_full_deploy_field)
        inputs = self._resolve_version_selections(template, inputs)
        plan = self.planner.build_plan(template, inputs)
        self._show_plan_summary(template, plan, "完整部署")
        if not self._prompt_boolean("确认开始完整部署", True):
            ui.print_warning("已取消模板部署。")
            return 1
        result = self._execute_with_display(
            f"{template.metadata.mod_name} / 完整部署",
            lambda: self.runtime.execute(template, plan, progress_callback=self._progress_callback),
        )
        return self._finalize_result(result, "完整部署")

    def _run_component_stage(self, template: TemplateDefinition) -> int:
        inputs = self._collect_inputs(template, field_filter=self._is_component_field)
        inputs = self._resolve_version_selections(template, inputs)
        plan = self.planner.build_plan(template, inputs)
        self._show_plan_summary(template, plan, "组件阶段")
        if not self._prompt_boolean("确认执行组件阶段", True):
            ui.print_warning("已取消组件阶段执行。")
            return 1
        result = self._execute_with_display(
            f"{template.metadata.mod_name} / 组件阶段",
            lambda: self.runtime.execute_stage(
                template,
                plan,
                stage=self.MODE_TO_STAGE["component"],
                progress_callback=self._progress_callback,
            ),
        )
        return self._finalize_result(result, "组件阶段")

    def _run_existing_instance_stage(self, template: TemplateDefinition, mode: str) -> int:
        serial_number = self._prompt_existing_instance_serial(mode)
        config_name, config = self.runtime.find_instance_config(serial_number)
        stored_inputs = dict(config.get("template_inputs", {}) or {})
        stored_inputs["serial_number"] = serial_number

        if mode == "launch":
            field_filter = self._is_launch_field
            stage_label = "启动阶段"
        elif mode == "config":
            field_filter = self._is_config_field
            stage_label = "配置阶段"
        else:
            field_filter = self._is_uninstall_field
            stage_label = "卸载阶段"

        inputs = self._collect_inputs(template, field_filter=field_filter, initial_values=stored_inputs)
        inputs["serial_number"] = serial_number

        plan = self.planner.build_plan(template, inputs)
        ui.print_info(f"目标实例: {config_name} / 序列号 {serial_number}")
        self._show_plan_summary(template, plan, stage_label)
        if not self._prompt_boolean(f"确认执行{stage_label}", True):
            ui.print_warning(f"已取消{stage_label}执行。")
            return 1

        result = self._execute_with_display(
            f"{template.metadata.mod_name} / {stage_label}",
            lambda: self.runtime.execute_stage(
                template,
                plan,
                stage=self.MODE_TO_STAGE[mode],
                progress_callback=self._progress_callback,
                serial_number=serial_number,
            ),
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
        # hidden 字段不参与交互式表单填写，由 CLI 在 _resolve_version_selections 中单独处理
        if field.field_type == "hidden":
            return default_value if default_value is not None else ""

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
        if mode == "launch":
            label = "启动"
        elif mode == "config":
            label = "配置"
        else:
            label = "卸载"
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
        table.add_row("卸载项", ", ".join(plan.summary.get("selected_uninstalls", [])) or "-")
        table.add_row("启动器版本", str(plan.summary.get("launcher_version", "") or "-"))
        ui.console.print()
        ui.console.print(table)
        ui.console.print()

    def _finalize_result(self, result, action_name: str) -> int:
        if not result.success:
            ui.print_error(f"{action_name}失败: {result.message}")
            return 1

        ui.print_success(f"{action_name}执行完成。")
        if getattr(result, "removed_paths", None):
            ui.print_info("已移除路径:")
            for path in result.removed_paths:
                ui.console.print(f"  - {path}")
        if result.instance_config_name:
            ui.print_success(f"实例配置已写入: {result.instance_config_name}")
        if result.runtime_env_file:
            ui.print_info(f"运行时环境文件: {result.runtime_env_file}")
        if result.runtime_state_file:
            ui.print_info(f"运行时状态文件: {result.runtime_state_file}")
        return 0

    def _execute_with_display(self, title: str, action: Callable[[], Any]) -> Any:
        ui.console.print()
        with _TemplateExecutionDisplay(title) as display:
            self._display = display
            try:
                return action()
            finally:
                self._display = None

    def _progress_callback(
        self,
        step: int,
        total_steps: int,
        step_name: str,
        status: str,
        message: str,
        event: str = "stage",
        **payload: Any,
    ) -> None:
        if self._display is not None:
            self._display.update(
                step=step,
                total_steps=total_steps,
                step_name=step_name,
                status=status,
                message=message,
                event=event,
                **payload,
            )
            return

        if event == "download":
            if status == "completed":
                ui.print_success(f"{step_name}: {message}")
            elif status == "failed":
                ui.print_error(f"{step_name}: {message}")
            elif str(payload.get("download_status") or "") == "started":
                ui.print_info(f"{step_name}: {message}")
            return

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
        if normalized not in {"deploy", "launch", "config", "component", "uninstall"}:
            raise ValueError(f"不支持的命令行模板模式: {mode}")
        return normalized

    @staticmethod
    def _is_full_deploy_field(field: TemplateFormField) -> bool:
        return field.key != "launcher_version" and not field.key.startswith("uninstall::")

    @staticmethod
    def _has_prefix(key: str, prefixes: Iterable[str]) -> bool:
        return any(key.startswith(prefix) for prefix in prefixes)

    def _is_component_field(self, field: TemplateFormField) -> bool:
        return self._has_prefix(field.key, ("component::", "path::component::", "version::component::", "link::component::"))

    def _is_launch_field(self, field: TemplateFormField) -> bool:
        return field.key.startswith("launch::")

    def _is_config_field(self, field: TemplateFormField) -> bool:
        return field.key.startswith("config::")

    def _is_uninstall_field(self, field: TemplateFormField) -> bool:
        return field.key.startswith("uninstall::")

    def _resolve_version_selections(
        self,
        template: TemplateDefinition,
        inputs: Dict[str, Any],
    ) -> Dict[str, Any]:
        """对需要动态获取版本的字段，从 GitHub 等源获取版本列表并让用户选择。"""
        result = dict(inputs)
        items_to_resolve: List[tuple[str, str, Any]] = []

        for component in template.components:
            # choose=true 时才在表单阶段让用户选择版本（choose=false 强制安装，由 runtime 在 check 后决定）
            if component.choose and component.user_choose and any(isinstance(item, int) for item in component.choose_list):
                items_to_resolve.append(("component", component.id, component))

        for deployment in template.deployments:
            if deployment.user_choose and any(isinstance(item, int) for item in deployment.choose_list):
                items_to_resolve.append(("deployment", deployment.id, deployment))

        if not items_to_resolve:
            return result

        ui.console.print()
        ui.print_info("正在获取版本信息，请稍候...")

        for stage_name, item_id, definition in items_to_resolve:
            version_key = f"version::{stage_name}::{item_id}"
            result[version_key] = self._resolve_single_version_with_fallback(
                template, stage_name, item_id, definition
            )

        return result

    def _resolve_single_version_with_fallback(
        self,
        template: TemplateDefinition,
        stage_name: str,
        item_id: str,
        definition: Any,
    ) -> str:
        """
        获取单个组件/部署项的版本，支持失败后用户选择：
        1. 手动重试
        2. 自行输入版本号
        3. 跳过（使用默认版本）
        """
        version_key = f"version::{stage_name}::{item_id}"
        
        while True:
            ui.console.print()
            ui.print_info(f"正在获取 {item_id} 的版本信息...")
            
            try:
                # 使用带重试的方法获取版本
                candidates, error = self.runtime._fetch_github_candidates_with_retry(
                    self._get_github_repo(definition),
                    max_retries=3,
                    base_delay=1.0,
                )
                
                if error and not candidates:
                    ui.print_warning(f"获取 {item_id} 版本失败: {error}")
                elif not candidates:
                    ui.print_warning(f"无法获取 {item_id} 的版本列表")
                else:
                    # 成功获取版本列表，让用户选择
                    filtered = self._filter_version_candidates(definition, candidates)
                    
                    ui.console.print()
                    ui.console.print(f"[bold cyan]请选择 {item_id} 的版本[/bold cyan]")
                    for idx, item in enumerate(filtered, 1):
                        type_label = {"release": "Release", "tag": "Tag", "branch": "Branch", "file": "文件", "custom": "自定义"}.get(
                            item.get("type", ""), item.get("type", "")
                        )
                        ui.console.print(f"  [{idx}] {item['name']} [{type_label}]")
                    
                    default_idx = 1
                    while True:
                        choice = ui.get_input(f"选择版本 (1-{len(filtered)}, 默认 1)", default="1").strip()
                        if not choice:
                            choice = "1"
                        if choice.isdigit():
                            idx = int(choice) - 1
                            if 0 <= idx < len(filtered):
                                selected = filtered[idx]
                                version = selected.get("raw_name") or selected.get("name", "")
                                ui.print_success(f"已选择版本: {version}")
                                return version
                        ui.print_warning(f"请输入 1 到 {len(filtered)} 之间的数字")
                
                # 获取失败，显示选项让用户选择
                ui.console.print()
                ui.console.print(f"[bold yellow]获取 {item_id} 版本失败，请选择处理方式:[/bold yellow]")
                ui.console.print("  [1] 手动重试")
                ui.console.print("  [2] 自行输入版本号")
                ui.console.print("  [3] 跳过（使用默认版本）")
                
                while True:
                    choice = ui.get_input("请选择 (1-3)", default="3").strip()
                    if not choice:
                        choice = "3"
                    
                    if choice == "1":
                        # 手动重试 - 继续外层循环
                        break
                    elif choice == "2":
                        # 自行输入版本号
                        ui.console.print()
                        version_input = ui.get_input(f"请输入 {item_id} 的版本号或分支名").strip()
                        if version_input:
                            ui.print_success(f"已输入版本: {version_input}")
                            return version_input
                        ui.print_warning("版本号不能为空，请重新选择")
                    elif choice == "3":
                        # 跳过，使用默认版本
                        ui.print_info(f"将跳过 {item_id} 的版本选择，使用默认版本")
                        return ""
                    else:
                        ui.print_warning("请输入 1-3 之间的数字")
                
                # 如果选择了重试，继续外层循环
                continue
                
            except Exception as exc:
                ui.print_error(f"获取 {item_id} 版本列表时发生异常: {exc}")
                
                # 同样显示三个选项
                ui.console.print()
                ui.console.print(f"[bold yellow]获取 {item_id} 版本失败，请选择处理方式:[/bold yellow]")
                ui.console.print("  [1] 手动重试")
                ui.console.print("  [2] 自行输入版本号")
                ui.console.print("  [3] 跳过（使用默认版本）")
                
                while True:
                    choice = ui.get_input("请选择 (1-3)", default="3").strip()
                    if not choice:
                        choice = "3"
                    
                    if choice == "1":
                        break  # 继续外层循环重试
                    elif choice == "2":
                        version_input = ui.get_input(f"请输入 {item_id} 的版本号或分支名").strip()
                        if version_input:
                            return version_input
                        ui.print_warning("版本号不能为空")
                    elif choice == "3":
                        return ""
                
                continue

    def _get_github_repo(self, definition: Any) -> str:
        """从定义中获取 GitHub 仓库地址"""
        return getattr(definition, "github_repo", "") or ""

    def _filter_version_candidates(
        self,
        definition: Any,
        candidates: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """应用模板的 choose_list 过滤规则到版本候选列表。"""
        choose_list = list(getattr(definition, "choose_list", []) or [])
        if not choose_list:
            return candidates

        results: List[Dict[str, Any]] = []
        explicit = [str(item) for item in choose_list if isinstance(item, str)]
        integers = [int(item) for item in choose_list if isinstance(item, int)]

        if explicit:
            explicit_set = {item.lower() for item in explicit}
            for item in candidates:
                if str(item.get("name", "")).lower() in explicit_set:
                    results.append(item)
            seen_names = {str(item.get("name", "")).lower() for item in results}
            for item in explicit:
                if item.lower() not in seen_names:
                    results.append({"name": item, "raw_name": item, "type": "explicit"})

        if integers:
            max_items = max(integers)
            results.extend(candidates if max_items == 0 else candidates[:max_items])

        if not results:
            return candidates

        unique: List[Dict[str, Any]] = []
        seen = set()
        for item in results:
            key = (str(item.get("name", "")).lower(), str(item.get("type", "")).lower())
            if key in seen:
                continue
            seen.add(key)
            unique.append(item)
        return unique


deployment_mod_cli_runner = DeploymentModCliRunner()
