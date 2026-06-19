from __future__ import annotations

import base64
from contextlib import contextmanager
import json
import os
import re
import shutil
import shlex
import stat
import subprocess
import sys
import tarfile
import tempfile
import time
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, Iterable, List, Optional, Sequence
from urllib.parse import urlparse
from xml.etree import ElementTree

import requests
import structlog
import toml
import urllib3
from urllib3.exceptions import InsecureRequestWarning

from ...core.config import config_manager
from ...core.p_config import p_config_manager
from ...utils.common import make_toml_safe, open_files_in_editor
from .models import (
    ComponentDefinition,
    ConfigDefinition,
    DeploymentDefinition,
    DeploymentPlan,
    EnvBinding,
    LaunchDefinition,
    RuntimeResult,
    TemplateDefinition,
    UninstallDefinition,
)
from .debug_session import DebugSessionStopped

logger = structlog.get_logger(__name__)
urllib3.disable_warnings(InsecureRequestWarning)

PLACEHOLDER_PATTERN = re.compile(r"\{\{(key|env|install_path|deploy_path|version|file_path|file_key)\|([^{}]+)}}")


@dataclass
class RuntimeScope:
    env_values: Dict[str, str] = field(default_factory=dict)


@dataclass
class CommandExecutionResult:
    output: str = ""
    returncode: int = 0
    script_path: str = ""
    detached: bool = False


@dataclass
class RuntimeState:
    template: TemplateDefinition
    plan: DeploymentPlan
    progress_callback: Optional[Callable] = None
    runtime_root: str = ""
    instance_serial_number: str = ""
    instance_root: str = ""
    runtime_env_file: str = ""
    runtime_state_file: str = ""
    runtime_log_file: str = ""
    env_pool: Dict[str, str] = field(default_factory=dict)
    file_paths: Dict[str, str] = field(default_factory=dict)
    file_trees: Dict[str, Any] = field(default_factory=dict)
    versions: Dict[str, str] = field(default_factory=dict)
    version_meta: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    install_paths: Dict[str, str] = field(default_factory=dict)
    deploy_paths: Dict[str, str] = field(default_factory=dict)
    deployment_roots: Dict[str, str] = field(default_factory=dict)
    managed_components: Dict[str, bool] = field(default_factory=dict)
    opened_files: List[str] = field(default_factory=list)
    launched_items: List[str] = field(default_factory=list)
    removed_paths: List[str] = field(default_factory=list)
    debug_controller: Optional[Any] = None


class DeploymentModRuntime:
    """真正执行部署模板的运行时引擎。"""

    RUNTIME_ENV_FILENAME = ".mcstart-template.env"
    RUNTIME_STATE_FILENAME = ".mcstart-template-state.toml"
    LOG_SENSITIVE_KEYWORDS = ("password", "passwd", "token", "secret", "apikey", "api_key", "cookie", "authorization")
    COMMAND_EVENT_PREFIX = "__MCSB_EVT__"
    COMMAND_EVENT_BEGIN = f"{COMMAND_EVENT_PREFIX}BEGIN__"
    COMMAND_EVENT_CWD = f"{COMMAND_EVENT_PREFIX}CWD__"
    COMMAND_EVENT_CLEAR = f"{COMMAND_EVENT_PREFIX}CLEAR__"

    def _get_request_kwargs(self) -> Dict[str, Any]:
        """生成网络请求的统一参数，包含代理和 SSL 配置。"""
        kwargs: Dict[str, Any] = {"verify": False}
        if p_config_manager.is_proxy_enabled():
            proxy_config = p_config_manager.get_proxy_config()
            proxy_type = str(proxy_config.get("type", "http") or "http").lower()
            host = str(proxy_config.get("host", "") or "").strip()
            port = str(proxy_config.get("port", "") or "").strip()
            username = str(proxy_config.get("username", "") or "").strip()
            password = str(proxy_config.get("password", "") or "").strip()
            if host and port:
                proxy_url = f"{proxy_type}://{host}:{port}"
                if username and password:
                    proxy_url = f"{proxy_type}://{username}:{password}@{host}:{port}"
                kwargs["proxies"] = {"http": proxy_url, "https": proxy_url}
        return kwargs

    SPECIAL_PATHS = {
        "$Temporary": lambda: os.path.join(os.getcwd(), "Temporary"),
        "$ProgramFiles": lambda: os.environ.get("ProgramFiles", r"C:\Program Files"),
        "$ProgramFiles(x86)": lambda: os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"),
        "$AppData": lambda: os.environ.get("APPDATA", str(Path.home() / "AppData" / "Roaming")),
        "$LocalAppData": lambda: os.environ.get("LOCALAPPDATA", str(Path.home() / "AppData" / "Local")),
        "$UserProfile": lambda: os.environ.get("USERPROFILE", str(Path.home())),
        "$UserProfile\\Desktop": lambda: str(Path.home() / "Desktop"),
        "$UserProfile\\Documents": lambda: str(Path.home() / "Documents"),
        "$UserProfile\\Downloads": lambda: str(Path.home() / "Downloads"),
        "$UserProfile\\Music": lambda: str(Path.home() / "Music"),
        "$UserProfile\\Pictures": lambda: str(Path.home() / "Pictures"),
        "$UserProfile\\Videos": lambda: str(Path.home() / "Videos"),
    }

    VERSION_FILE_FIELDS = (
        "version_file",
        "version_file_link",
        "get_version_file_link",
        "file_link",
    )
    LINK_FILE_FIELDS = (
        "link_file",
        "get_link_file_link",
        "get_link_file",
        "file_link",
    )
    FILELINK_FIELD_ALIASES = (
        "version_file",
        "link_file",
        "file_link",
        "version_file_link",
        "get_version_file_link",
        "get_link_file_link",
        "get_link_file",
    )
    VERSION_CUSTOM_FIELDS = (
        "version_custom",
        "version_script",
        "get_version_script",
        "get_version_custom",
        "custom_script",
        "script_path",
    )
    LINK_CUSTOM_FIELDS = (
        "link_custom",
        "get_link_script",
        "get_link_custom",
        "custom_script",
        "script_path",
    )
    SCRIPT_FIELD_ALIASES = (
        "version_custom",
        "link_custom",
        "custom_script",
        "version_script",
        "get_version_script",
        "get_link_script",
        "get_version_custom",
        "get_link_custom",
        "script_path",
    )
    DENO_PERMISSION_FLAGS = (
        ("deno_net", "--allow-net"),
        ("deno_read", "--allow-read"),
        ("deno_write", "--allow-write"),
        ("deno_env", "--allow-env"),
        ("deno_run", "--allow-run"),
        ("deno_hrtime", "--allow-hrtime"),
        ("deno_ffi", "--allow-ffi"),
        ("deno_sys", "--allow-sys"),
    )

    @staticmethod
    def _build_runtime_result(
        state: RuntimeState,
        success: bool,
        message: str,
        stage: str,
        instance_config_name: str = "",
        instance_config: Optional[Dict[str, Any]] = None,
    ) -> RuntimeResult:
        return RuntimeResult(
            success=success,
            message=message,
            stage=stage,
            instance_config_name=instance_config_name,
            instance_config=instance_config or {},
            exported_env=dict(state.env_pool),
            selected_versions=dict(state.versions),
            install_paths=dict(state.install_paths),
            deploy_paths=dict(state.deploy_paths),
            deployment_roots=dict(state.deployment_roots),
            opened_files=list(state.opened_files),
            launched_items=list(state.launched_items),
            removed_paths=list(state.removed_paths),
            runtime_env_file=state.runtime_env_file,
            runtime_state_file=state.runtime_state_file,
            runtime_log_file=state.runtime_log_file,
        )

    def execute(
        self,
        template: TemplateDefinition,
        plan: DeploymentPlan,
        progress_callback: Optional[Callable] = None,
        debug_controller: Optional[Any] = None,
    ) -> RuntimeResult:
        runtime_root = os.path.join(
            os.getcwd(),
            "data",
            "template_runtime",
            f"{template.metadata.mod_id.replace('.', '_')}_{int(time.time())}",
        )
        os.makedirs(runtime_root, exist_ok=True)

        state = RuntimeState(
            template=template,
            plan=plan,
            progress_callback=progress_callback,
            runtime_root=runtime_root,
            instance_serial_number=str(plan.template_inputs.get("serial_number", "") or ""),
            runtime_log_file=os.path.join(runtime_root, "execution.log"),
            debug_controller=debug_controller,
        )

        try:
            self._debug_wait(state)
            self._notify(state, 1, 6, "准备模板运行时", "running", f"模板: {template.metadata.mod_name}")
            self._notify(state, 1, 6, "准备模板运行时", "running", f"运行时目录: {runtime_root}", event="detail")
            self._notify(state, 1, 6, "准备模板运行时", "running", f"执行日志: {state.runtime_log_file}", event="detail")
            self._prepare_file_imports(state)
            self._hydrate_template_inputs(state)

            self._notify(state, 2, 6, "组件安装阶段", "running", "开始执行组件安装阶段")
            self._execute_components(state)

            self._notify(state, 3, 6, "部署阶段", "running", "开始执行部署阶段")
            self._execute_deployments(state)

            self._notify(state, 4, 6, "启动阶段", "running", "开始执行启动阶段")
            self._execute_launches(state)

            self._notify(state, 5, 6, "配置阶段", "running", "开始执行配置文件管理阶段")
            self._execute_configs(state)

            instance_config_name, instance_config = self._persist_instance_config(state)
            self._notify(state, 6, 6, "模板运行完成", "completed", "模板部署流程执行成功")
            return self._build_runtime_result(
                state,
                success=True,
                message="模板部署成功",
                stage="full",
                instance_config_name=instance_config_name,
                instance_config=instance_config,
            )
        except Exception as exc:
            logger.error("模板运行失败", template_id=template.metadata.mod_id, error=str(exc))
            self._notify(state, 6, 6, "模板运行失败", "failed", str(exc))
            return self._build_runtime_result(state, success=False, message=str(exc), stage="full")

    def execute_stage(
        self,
        template: TemplateDefinition,
        plan: DeploymentPlan,
        stage: str,
        progress_callback: Optional[Callable] = None,
        serial_number: str = "",
        debug_controller: Optional[Any] = None,
    ) -> RuntimeResult:
        normalized_stage = self._normalize_stage(stage)
        if normalized_stage == "full":
            return self.execute(template, plan, progress_callback=progress_callback, debug_controller=debug_controller)

        runtime_root = os.path.join(
            os.getcwd(),
            "data",
            "template_runtime",
            f"{template.metadata.mod_id.replace('.', '_')}_{normalized_stage}_{int(time.time())}",
        )
        os.makedirs(runtime_root, exist_ok=True)

        state = RuntimeState(
            template=template,
            plan=plan,
            progress_callback=progress_callback,
            runtime_root=runtime_root,
            instance_serial_number=serial_number or str(plan.template_inputs.get("serial_number", "") or ""),
            runtime_log_file=os.path.join(runtime_root, "execution.log"),
            debug_controller=debug_controller,
        )

        try:
            self._debug_wait(state)
            self._prepare_file_imports(state)
            self._hydrate_template_inputs(state)
            should_restore_instance_state = normalized_stage in {"launches", "configs", "uninstalls"} or (
                normalized_stage == "deployments" and bool(serial_number)
            )
            if not should_restore_instance_state:
                self._notify(state, 1, 1, f"执行 {normalized_stage} 阶段", "running", f"模板: {template.metadata.mod_name}")
            else:
                self._restore_runtime_state_for_instance(state, state.instance_serial_number)
                self._hydrate_template_inputs(state)
                self._notify(state, 1, 1, f"执行 {normalized_stage} 阶段", "running", f"实例序列号: {state.instance_serial_number}")
            self._notify(state, 1, 1, f"执行 {normalized_stage} 阶段", "running", f"运行时目录: {runtime_root}", event="detail")
            self._notify(state, 1, 1, f"执行 {normalized_stage} 阶段", "running", f"执行日志: {state.runtime_log_file}", event="detail")

            if normalized_stage == "components":
                self._execute_components(state)
            elif normalized_stage == "deployments":
                self._execute_deployments(state)
                self._persist_runtime_files_for_existing_instance(state)
            elif normalized_stage == "launches":
                self._execute_launches(state)
                self._persist_runtime_files_for_existing_instance(state)
            elif normalized_stage == "configs":
                self._execute_configs(state)
                self._persist_runtime_files_for_existing_instance(state)
            elif normalized_stage == "uninstalls":
                self._execute_uninstalls(state)
            else:
                raise RuntimeError(f"未知阶段: {normalized_stage}")

            self._notify(state, 1, 1, f"{normalized_stage} 阶段完成", "completed", "阶段执行成功")
            return self._build_runtime_result(state, success=True, message="阶段执行成功", stage=normalized_stage)
        except Exception as exc:
            logger.error("模板阶段执行失败", template_id=template.metadata.mod_id, stage=normalized_stage, error=str(exc))
            self._notify(state, 1, 1, f"{normalized_stage} 阶段失败", "failed", str(exc))
            return self._build_runtime_result(state, success=False, message=str(exc), stage=normalized_stage)

    def execute_block(
        self,
        template: TemplateDefinition,
        plan: DeploymentPlan,
        block_key: str,
        progress_callback: Optional[Callable] = None,
        serial_number: str = "",
        hydrate_context: bool = True,
        debug_controller: Optional[Any] = None,
    ) -> RuntimeResult:
        normalized_block = str(block_key or "").strip()
        if not normalized_block:
            raise RuntimeError("单块运行缺少 block_key")

        runtime_root = os.path.join(
            os.getcwd(),
            "data",
            "template_runtime",
            f"{template.metadata.mod_id.replace('.', '_')}_block_{int(time.time())}",
        )
        os.makedirs(runtime_root, exist_ok=True)

        state = RuntimeState(
            template=template,
            plan=plan,
            progress_callback=progress_callback,
            runtime_root=runtime_root,
            instance_serial_number=serial_number or str(plan.template_inputs.get("serial_number", "") or ""),
            runtime_log_file=os.path.join(runtime_root, "execution.log"),
            debug_controller=debug_controller,
        )

        try:
            self._debug_wait(state)
            self._prepare_file_imports(state)
            self._hydrate_template_inputs(state)
            required_stage = self._stage_for_block_key(normalized_block)
            should_restore = hydrate_context and (
                required_stage in {"launches", "configs", "uninstalls"}
                or (required_stage == "deployments" and bool(state.instance_serial_number))
            )
            if should_restore:
                self._restore_runtime_state_for_instance(state, state.instance_serial_number)
                self._hydrate_template_inputs(state)

            self._notify(state, 1, 1, "执行单块调试", "running", f"块: {normalized_block}", event="detail")
            self._notify(state, 1, 1, "执行单块调试", "running", f"运行时目录: {runtime_root}", event="detail")
            self._execute_single_block(state, normalized_block)
            if required_stage in {"deployments", "launches", "configs"} and state.instance_serial_number:
                self._persist_runtime_files_for_existing_instance(state)
            self._notify(state, 1, 1, "单块调试完成", "completed", "块执行成功")
            return self._build_runtime_result(state, success=True, message="块执行成功", stage=normalized_block)
        except Exception as exc:
            logger.error("模板单块执行失败", template_id=template.metadata.mod_id, block=normalized_block, error=str(exc))
            status_message = "调试会话已停止" if isinstance(exc, DebugSessionStopped) else str(exc)
            self._notify(state, 1, 1, "单块调试失败", "failed", status_message)
            return self._build_runtime_result(state, success=False, message=status_message, stage=normalized_block)

    def _hydrate_template_inputs(self, state: RuntimeState) -> None:
        for key, value in state.plan.template_inputs.items():
            if value and str(value).strip():
                state.env_pool[str(key)] = str(value).strip()

    def _stage_for_block_key(self, block_key: str) -> str:
        if block_key in {"components", "component"}:
            return "components"
        if block_key in {"deploy", "deployment", "deployments"}:
            return "deployments"
        if block_key in {"launch", "launches"}:
            return "launches"
        if block_key in {"config", "configs"}:
            return "configs"
        if block_key in {"uninstall", "uninstalls"}:
            return "uninstalls"
        if block_key.startswith("component:"):
            return "components"
        if block_key.startswith("deployment:"):
            return "deployments"
        if block_key.startswith("launch-item:"):
            return "launches"
        if block_key.startswith("config-item:"):
            return "configs"
        if block_key.startswith("uninstall-item:"):
            return "uninstalls"
        raise RuntimeError(f"未知工作台块: {block_key}")

    def _execute_single_block(self, state: RuntimeState, block_key: str) -> None:
        if block_key in {"components", "component"}:
            self._execute_components(state)
            return
        if block_key in {"deploy", "deployment", "deployments"}:
            self._execute_deployments(state)
            return
        if block_key in {"launch", "launches"}:
            self._execute_launches(state)
            return
        if block_key in {"config", "configs"}:
            self._execute_configs(state)
            return
        if block_key in {"uninstall", "uninstalls"}:
            self._execute_uninstalls(state)
            return

        prefix, _, index_text = block_key.partition(":")
        try:
            index = int(index_text)
        except ValueError as exc:
            raise RuntimeError(f"工作台块索引非法: {block_key}") from exc

        if prefix == "component":
            component = self._item_by_index(state.template.components, index, block_key)
            with self._debug_block(state, "components", block_key, f"组件 {component.name}", item_id=component.id):
                self._execute_component(state, component)
            return
        if prefix == "deployment":
            deployment = self._item_by_index(state.template.deployments, index, block_key)
            with self._debug_block(state, "deployments", block_key, f"部署 {deployment.name}", item_id=deployment.id):
                self._execute_deployment(state, deployment)
            return
        if prefix == "launch-item":
            launch = self._item_by_index(state.template.launches, index, block_key)
            with self._debug_block(state, "launches", block_key, f"启动 {launch.name}", item_id=launch.id):
                self._execute_launch(state, launch)
            return
        if prefix == "config-item":
            config = self._item_by_index(state.template.configs, index, block_key)
            with self._debug_block(state, "configs", block_key, f"配置 {config.name}", item_id=config.id or config.name):
                file_path = self._execute_config_item(state, config)
            if file_path:
                open_files_in_editor([file_path])
            return
        if prefix == "uninstall-item":
            uninstall = self._item_by_index(state.template.uninstalls, index, block_key)
            with self._debug_block(state, "uninstalls", block_key, f"卸载 {uninstall.name}", item_id=uninstall.id):
                self._execute_uninstall(state, uninstall)
            self._finalize_uninstall_cleanup(state, remove_instance_config=uninstall.remove_instance_config)
            return

        raise RuntimeError(f"未知工作台块: {block_key}")

    @staticmethod
    def _item_by_index(items: Sequence[Any], index: int, block_key: str) -> Any:
        if index < 0 or index >= len(items):
            raise RuntimeError(f"工作台块不存在: {block_key}")
        return items[index]

    @contextmanager
    def _debug_block(
        self,
        state: RuntimeState,
        stage: str,
        block_id: str,
        label: str,
        item_id: str = "",
    ):
        self._debug_wait(state)
        controller = state.debug_controller
        if not controller:
            yield
            return
        controller.enter_block(stage=stage, block_id=block_id, label=label, item_id=item_id)
        try:
            yield
        except Exception as exc:
            controller.leave_block(status="failed", error=str(exc))
            raise
        else:
            controller.leave_block(status="completed")

    def _debug_wait(self, state: RuntimeState) -> None:
        controller = state.debug_controller
        if controller:
            controller.wait_if_paused()

    def _debug_item_block_id(self, state: RuntimeState, kind: str, item: Any) -> str:
        if kind == "component":
            return f"component:{self._index_for_item(state.template.components, item)}"
        if kind == "deployment":
            return f"deployment:{self._index_for_item(state.template.deployments, item)}"
        if kind == "launch":
            return f"launch-item:{self._index_for_item(state.template.launches, item)}"
        if kind == "config":
            return f"config-item:{self._index_for_item(state.template.configs, item)}"
        if kind == "uninstall":
            return f"uninstall-item:{self._index_for_item(state.template.uninstalls, item)}"
        return str(getattr(item, "id", "") or kind)

    @staticmethod
    def _index_for_item(items: Sequence[Any], target: Any) -> int:
        for index, item in enumerate(items):
            if item is target:
                return index
        target_id = str(getattr(target, "id", "") or getattr(target, "name", "") or "")
        for index, item in enumerate(items):
            item_id = str(getattr(item, "id", "") or getattr(item, "name", "") or "")
            if target_id and item_id == target_id:
                return index
        return 0

    def _debug_command_started(self, state: RuntimeState, label: str, payload: Dict[str, Any]) -> str:
        controller = state.debug_controller
        if not controller:
            return ""
        return controller.command_started(label=label, scope="runtime", **payload)

    def _debug_command_meta(self, state: RuntimeState, command_id: str, payload: Dict[str, Any]) -> None:
        if state.debug_controller and command_id:
            state.debug_controller.command_meta(command_id, payload)

    def _debug_command_output(
        self,
        state: RuntimeState,
        command_id: str,
        line: str,
        command_index: Optional[int],
        runtime: str,
    ) -> None:
        if state.debug_controller and command_id:
            state.debug_controller.command_output(command_id, line, command_index=command_index, runtime=runtime)

    def _debug_command_finished(
        self,
        state: RuntimeState,
        command_id: str,
        *,
        status: str,
        returncode: Any = None,
        error: str = "",
    ) -> None:
        if state.debug_controller and command_id:
            state.debug_controller.command_finished(command_id, status=status, returncode=returncode, error=error)

    def _debug_register_process(
        self,
        state: RuntimeState,
        process: subprocess.Popen,
        command_id: str,
        label: str,
        command_line: Sequence[str],
    ) -> None:
        if state.debug_controller and command_id:
            state.debug_controller.register_process(process, command_id=command_id, label=label, command_line=command_line)

    def _execute_components(self, state: RuntimeState) -> None:
        with self._debug_block(state, "components", "components", "[COMPONENTS]"):
            ordered_components = self._ordered_items(
                state.template.components_section.list,
                state.template.components,
            )
            bindings = {item.component_id: item for item in state.plan.component_bindings}
            for component in ordered_components:
                binding = bindings.get(component.id)
                enabled = binding.enabled if binding else self._component_requires_processing(component)
                if not enabled:
                    self._notify(state, 2, 6, f"跳过组件 {component.name}", "skipped", "用户未选择或模板无需处理该组件")
                    continue
                with self._debug_block(
                    state,
                    "components",
                    self._debug_item_block_id(state, "component", component),
                    f"组件 {component.name}",
                    item_id=component.id,
                ):
                    self._execute_component(state, component)

    def _execute_component(self, state: RuntimeState, component: ComponentDefinition) -> None:
        scope = self._build_scope(state, state.template.components_section.env_input, component.env_input, component.env_input_list)
        install_path = self._resolve_stage_path(
            state,
            "component",
            component.id,
            component.install_path,
            component.custom_path,
            scope,
        )
        os.makedirs(install_path, exist_ok=True)
        state.install_paths[component.id] = install_path
        state.managed_components.setdefault(component.id, False)

        self._notify(state, 2, 6, f"组件 {component.name}", "running", f"安装路径: {install_path}")

        # Step 1: 执行检查命令，展示结果
        check_result = self._perform_component_check(state, component, install_path, scope)

        # Step 2: 根据检查结果和 choose 值决定后续行为
        if check_result["installed"]:
            # 组件已存在 → 跳过安装，导出环境变量
            state.managed_components[component.id] = False
            self._notify(
                state, 2, 6, f"组件 {component.name}", "completed",
                f"检测到组件已存在，版本: {check_result['detected_version']}，跳过安装",
            )
            self._export_env_bindings(
                state, state.template.components_section.env_output,
                component.env_output, component.env_output_list, scope,
            )
            return

        if not component.install:
            self._notify(
                state,
                2,
                6,
                f"组件 {component.name}",
                "skipped",
                "检查未通过，模板未配置自动安装，请按模板说明手动准备该组件",
            )
            return

        # 组件不存在 → 按模板提供的方式自动安装
        # choose=false：强制安装，无需用户确认；choose=true：用户已在 CLI 阶段选择安装
        # （如果用户选择跳过，plan 阶段就会跳过此组件，不会到达这里）

        # Step 3: 执行安装前命令
        if component.before_command:
            self._run_command_list(
                state,
                component.before_command_list,
                install_path,
                scope,
                f"组件 {component.name} 安装前命令",
                runtime=component.runtime,
                command_theme=component.command_theme,
            )

        # Step 4: 执行安装
        if component.command_install:
            self._resolve_version_and_link(state, "component", component.id, component, scope)
            self._run_command_list(
                state,
                component.install_command_list,
                install_path,
                scope,
                f"组件 {component.name} 安装命令",
                runtime=component.runtime,
                command_theme=component.command_theme,
            )
        else:
            download_url = self._resolve_version_and_link(state, "component", component.id, component, scope)
            if not download_url:
                raise RuntimeError(f"组件 {component.name} 未能解析出下载链接")
            self._notify(state, 2, 6, f"组件 {component.name}", "running", f"下载链接: {download_url}", event="detail")
            asset_path = self._download_asset(state, component.id, download_url, install_path, "component")
            self._install_component_asset(state, component, asset_path, install_path)

        # Step 5: 执行安装后命令
        if component.after_command:
            self._run_command_list(
                state,
                component.after_command_list,
                install_path,
                scope,
                f"组件 {component.name} 安装后命令",
                runtime=component.runtime,
                command_theme=component.command_theme,
            )

        state.managed_components[component.id] = True
        self._export_env_bindings(state, state.template.components_section.env_output, component.env_output, component.env_output_list, scope)

    def _perform_component_check(
        self,
        state: RuntimeState,
        component: ComponentDefinition,
        install_path: str,
        scope: RuntimeScope,
    ) -> Dict[str, Any]:
        """执行组件检查，返回详细信息。"""
        if not component.check:
            return {"installed": False, "output": "", "detected_version": ""}

        check_cwd = state.runtime_root if os.path.isdir(state.runtime_root) else os.getcwd()
        self._notify(state, 2, 6, f"组件 {component.name}", "running", "正在检查组件是否已安装...")
        result = self._run_command_list(
            state,
            component.check_command,
            check_cwd,
            scope,
            f"组件 {component.name} 检查命令",
            raise_on_error=False,
            runtime=component.runtime,
            command_theme=component.command_theme,
        )
        output = result.output

        if result.returncode != 0:
            self._notify(
                state,
                2,
                6,
                f"组件 {component.name}",
                "running",
                f"检查命令返回非零退出码 {result.returncode}，视为未安装",
            )
            return {"installed": False, "output": output.strip(), "detected_version": "", "returncode": result.returncode}

        if not output:
            self._notify(state, 2, 6, f"组件 {component.name}", "running", "检查命令无输出，假设组件未安装")
            return {"installed": False, "output": "", "detected_version": "", "returncode": result.returncode}

        lowered_output = output.lower()
        regex_patterns = [str(pattern).strip() for pattern in component.check_version_regex if str(pattern).strip()]
        contains_tokens = [str(token).strip() for token in component.check_version_contains if str(token).strip()]
        detected_version = ""
        regex_matched = True
        if regex_patterns:
            regex_matched = False
            for pattern in regex_patterns:
                try:
                    match = re.search(pattern, output, re.MULTILINE)
                except re.error as exc:
                    raise RuntimeError(f"组件 {component.name} 的 check_version_regex 非法: {pattern} ({exc})") from exc
                if match and not detected_version:
                    if match.lastindex:
                        detected_version = next((group for group in match.groups() if group), "") or match.group(0)
                    else:
                        detected_version = match.group(0)
                if not match:
                    regex_matched = False
                    break
                regex_matched = True

        contains_matched = all(token.lower() in lowered_output for token in contains_tokens)
        if contains_matched and not detected_version:
            for token in contains_tokens:
                if token.lower() in lowered_output:
                    version_match = re.search(r"(\d+\.\d+(?:\.\d+)?)", output)
                    detected_version = version_match.group(1) if version_match else token
                    break

        is_installed = regex_matched and contains_matched
        if not regex_patterns and not contains_tokens:
            is_installed = bool(output.strip())
            if is_installed and not detected_version:
                version_match = re.search(r"(\d+\.\d+(?:\.\d+)?)", output)
                detected_version = version_match.group(1) if version_match else output.strip().splitlines()[0]

        if is_installed:
            self._notify(
                state, 2, 6, f"组件 {component.name}", "running",
                f"✓ 检查通过，已安装版本: {detected_version or '未知'}",
            )
        else:
            self._notify(
                state, 2, 6, f"组件 {component.name}", "running",
                f"✗ 检查未通过，将执行安装",
            )

        return {
            "installed": is_installed,
            "output": output.strip(),
            "detected_version": detected_version,
            "returncode": result.returncode,
        }

    @staticmethod
    def _component_requires_processing(component: ComponentDefinition) -> bool:
        return bool(component.install or component.check)

    def _check_component_installed(
        self,
        state: RuntimeState,
        component: ComponentDefinition,
        install_path: str,
        scope: RuntimeScope,
    ) -> bool:
        """兼容旧逻辑的简单检查。"""
        if not component.check:
            return False
        result = self._perform_component_check(state, component, install_path, scope)
        return result["installed"]

    def _install_component_asset(
        self,
        state: RuntimeState,
        component: ComponentDefinition,
        asset_path: str,
        install_path: str,
    ) -> None:
        extension = self._normalize_extension(asset_path)
        operate_mode = component.install_operate or "auto"
        self._notify(
            state,
            2,
            6,
            f"组件 {component.name}",
            "running",
            f"处理安装资源: {os.path.basename(asset_path)} [{extension or 'unknown'}], 模式: {operate_mode}",
            event="detail",
        )
        if operate_mode == "custom":
            matched = next((item for item in component.install_custom_list if item.extension.lower() == extension), None)
            if matched and matched.operate:
                self._operate_asset(state, asset_path, install_path, is_deployment=False, label=f"组件 {component.name}")
            else:
                self._notify(state, 2, 6, f"组件 {component.name}", "skipped", f"自定义规则未处理扩展名 {extension}")
            return
        if operate_mode == "no":
            self._notify(state, 2, 6, f"组件 {component.name}", "completed", f"仅下载资源，不执行安装: {asset_path}", event="detail")
            return
        self._operate_asset(state, asset_path, install_path, is_deployment=False, label=f"组件 {component.name}")

    def _execute_deployments(self, state: RuntimeState) -> None:
        with self._debug_block(state, "deployments", "deploy", "[DEPLOY]"):
            ordered_deployments = self._ordered_items(
                state.template.deployments_section.list,
                state.template.deployments,
            )
            for deployment in ordered_deployments:
                enabled = bool(
                    state.plan.template_inputs.get(
                        f"deployment::{deployment.id}",
                        deployment.deploy if deployment.choose else deployment.deploy,
                    )
                )
                if not enabled:
                    self._notify(state, 3, 6, f"跳过部署 {deployment.name}", "skipped", "用户未选择该部署项")
                    continue
                with self._debug_block(
                    state,
                    "deployments",
                    self._debug_item_block_id(state, "deployment", deployment),
                    f"部署 {deployment.name}",
                    item_id=deployment.id,
                ):
                    self._execute_deployment(state, deployment)

    def _execute_deployment(self, state: RuntimeState, deployment: DeploymentDefinition) -> None:
        scope = self._build_scope(state, state.template.deployments_section.env_input, deployment.env_input, deployment.env_input_list)
        deploy_path = self._resolve_stage_path(
            state,
            "deployment",
            deployment.id,
            deployment.deploy_path,
            deployment.custom_path,
            scope,
        )
        os.makedirs(deploy_path, exist_ok=True)
        state.deploy_paths[deployment.id] = deploy_path

        final_root = os.path.join(deploy_path, deployment.id)
        self._notify(state, 3, 6, f"部署 {deployment.name}", "running", f"部署基路径: {deploy_path}")
        self._notify(state, 3, 6, f"部署 {deployment.name}", "running", f"最终目录: {final_root}", event="detail")

        if deployment.before_command:
            self._run_command_list(
                state,
                deployment.before_command_list,
                deploy_path,
                scope,
                f"部署 {deployment.name} 前置命令",
                runtime=deployment.runtime,
                command_theme=deployment.command_theme,
            )

        resolved_link = self._resolve_version_and_link(state, "deployment", deployment.id, deployment, scope)
        if resolved_link:
            self._notify(state, 3, 6, f"部署 {deployment.name}", "running", f"部署链接: {resolved_link}", event="detail")

        if deployment.command_deploy:
            self._run_command_list(
                state,
                deployment.deploy_command_list,
                deploy_path,
                scope,
                f"部署 {deployment.name} 自定义命令",
                runtime=deployment.runtime,
                command_theme=deployment.command_theme,
            )
            if os.path.isdir(final_root):
                state.deployment_roots[deployment.id] = final_root
            elif os.path.isdir(deploy_path):
                state.deployment_roots[deployment.id] = deploy_path
        else:
            self._perform_deployment(state, deployment, deploy_path, final_root, resolved_link)

        if deployment.after_command:
            self._run_command_list(
                state,
                deployment.after_command_list,
                deploy_path,
                scope,
                f"部署 {deployment.name} 后置命令",
                runtime=deployment.runtime,
                command_theme=deployment.command_theme,
            )

        self._export_env_bindings(state, state.template.deployments_section.env_output, deployment.env_output, deployment.env_output_list, scope)

    def _perform_deployment(
        self,
        state: RuntimeState,
        deployment: DeploymentDefinition,
        deploy_path: str,
        final_root: str,
        resolved_link: str,
    ) -> None:
        method = deployment.deploy_method or "auto"
        link = resolved_link or self._resolve_text(state, deployment.base_link, RuntimeScope())
        if not link:
            raise RuntimeError(f"部署项 {deployment.name} 未能解析出部署链接")
        self._notify(state, 3, 6, f"部署 {deployment.name}", "running", f"部署方式: {method}", event="detail")

        if method in {"auto", "gitclone", "!gitclone"} and self._looks_like_git_repo(link):
            allow_fallback = method != "!gitclone"
            self._notify(state, 3, 6, f"部署 {deployment.name}", "running", f"尝试 Git 克隆: {link}", event="detail")
            clone_result = self._git_clone(
                state,
                link,
                final_root,
                state.version_meta.get(deployment.id, {}).get("name"),
                label=f"部署 {deployment.name} Git 克隆",
            )
            if clone_result:
                state.deployment_roots[deployment.id] = final_root
                self._notify(state, 3, 6, f"部署 {deployment.name}", "completed", f"Git 克隆完成: {final_root}", event="detail")
                return
            if not allow_fallback:
                raise RuntimeError(f"部署项 {deployment.name} Git 克隆失败且模板禁止回退")
            fallback_url = self._build_github_archive_url(link, state.version_meta.get(deployment.id, {}))
            self._notify(state, 3, 6, f"部署 {deployment.name}", "running", f"Git 克隆失败，回退归档下载: {fallback_url}", event="detail")
            asset_path = self._download_asset(state, deployment.id, fallback_url, deploy_path, "deployment")
            self._extract_or_copy_deployment_asset(state, asset_path, final_root, deployment.name)
            state.deployment_roots[deployment.id] = final_root
            return

        asset_path = self._download_asset(state, deployment.id, link, deploy_path, "deployment")
        if method == "getfile" or method == "auto":
            self._extract_or_copy_deployment_asset(state, asset_path, final_root, deployment.name)
            state.deployment_roots[deployment.id] = final_root if os.path.isdir(final_root) else deploy_path
            return

        raise RuntimeError(f"不支持的 deploy_method: {method}")

    def _extract_or_copy_deployment_asset(self, state: RuntimeState, asset_path: str, final_root: str, deployment_name: str) -> None:
        if os.path.isdir(final_root):
            self._safe_rmtree(final_root)
        os.makedirs(final_root, exist_ok=True)
        extension = self._normalize_extension(asset_path)
        self._notify(
            state,
            3,
            6,
            f"部署 {deployment_name}",
            "running",
            f"处理部署资源: {os.path.basename(asset_path)} [{extension or 'unknown'}]",
            event="detail",
        )
        if extension in {".zip", ".tar", ".gz", ".tgz", ".xz", ".tar.gz", ".tar.xz"}:
            extracted_root = self._extract_archive(state, asset_path, final_root, label=f"部署 {deployment_name}")
            if extracted_root and extracted_root != final_root:
                self._flatten_single_root(extracted_root, final_root)
                self._notify(state, 3, 6, f"部署 {deployment_name}", "running", f"已整理目录结构到: {final_root}", event="detail")
            return
        if extension in {".exe", ".msi", ".ps1", ".bat", ".cmd", ".sh", ".py"}:
            self._operate_asset(state, asset_path, final_root, is_deployment=True, label=f"部署 {deployment_name}")
            return
        shutil.copy2(asset_path, os.path.join(final_root, os.path.basename(asset_path)))
        self._notify(state, 3, 6, f"部署 {deployment_name}", "completed", f"已复制文件到: {final_root}", event="detail")

    def _execute_launches(self, state: RuntimeState) -> None:
        with self._debug_block(state, "launches", "launch", "[LAUNCH]"):
            ordered_launches = self._ordered_items(state.template.launches_section.list, state.template.launches)
            for launch in ordered_launches:
                enabled = bool(
                    state.plan.template_inputs.get(
                        f"launch::{launch.id}",
                        launch.launch if launch.choose else launch.launch,
                    )
                )
                if not enabled:
                    self._notify(state, 4, 6, f"跳过启动 {launch.name}", "skipped", "用户未选择该启动项")
                    continue
                with self._debug_block(
                    state,
                    "launches",
                    self._debug_item_block_id(state, "launch", launch),
                    f"启动 {launch.name}",
                    item_id=launch.id,
                ):
                    self._execute_launch(state, launch)

    def _execute_launch(self, state: RuntimeState, launch: LaunchDefinition) -> None:
        scope = self._build_scope(state, state.template.launches_section.env_input, launch.env_input, launch.env_input_list)
        cwd = self._guess_launch_workdir(state, launch)
        self._run_command_list(
            state,
            launch.launch_command,
            cwd,
            scope,
            f"启动 {launch.name}",
            detached=True,
            runtime=launch.runtime,
            command_theme=launch.command_theme,
        )
        state.launched_items.append(launch.id)
        self._export_env_bindings(state, state.template.launches_section.env_output, launch.env_output, launch.env_output_list, scope)

    def _execute_configs(self, state: RuntimeState) -> None:
        with self._debug_block(state, "configs", "config", "[CONFIG]"):
            ordered_configs = self._ordered_items(state.template.configs_section.list, state.template.configs)
            files_to_open: List[str] = []
            for config in ordered_configs:
                enabled = bool(state.plan.template_inputs.get(f"config::{config.id or config.name}", True if config.choose else True))
                if not enabled:
                    self._notify(state, 5, 6, f"跳过配置 {config.name}", "skipped", "用户未选择打开该配置文件")
                    continue
                with self._debug_block(
                    state,
                    "configs",
                    self._debug_item_block_id(state, "config", config),
                    f"配置 {config.name}",
                    item_id=config.id or config.name,
                ):
                    file_path = self._execute_config_item(state, config)
                    files_to_open.append(file_path)

            if files_to_open:
                open_files_in_editor(files_to_open)

    def _execute_config_item(self, state: RuntimeState, config: ConfigDefinition) -> str:
        scope = self._build_scope(state, state.template.configs_section.env_input, config.env_input, config.env_input_list)
        file_path = self._resolve_text(state, config.file_path, scope)
        if not file_path:
            raise RuntimeError(f"配置项 {config.name} 未能解析出文件路径")
        state.opened_files.append(file_path)
        self._export_env_bindings(state, state.template.configs_section.env_output, config.env_output, config.env_output_list, scope)
        return file_path

    def _execute_uninstalls(self, state: RuntimeState) -> None:
        with self._debug_block(state, "uninstalls", "uninstall", "[UNINSTALL]"):
            ordered_uninstalls = self._ordered_items(state.template.uninstalls_section.list, state.template.uninstalls)
            if not ordered_uninstalls:
                raise RuntimeError("模板未声明任何卸载项")

            remove_instance_config = False

            for uninstall in ordered_uninstalls:
                enabled = bool(
                    state.plan.template_inputs.get(
                        f"uninstall::{uninstall.id}",
                        uninstall.uninstall if uninstall.choose else uninstall.uninstall,
                    )
                )
                if not enabled:
                    self._notify(state, 1, 1, f"跳过卸载 {uninstall.name}", "skipped", "用户未选择该卸载项")
                    continue

                with self._debug_block(
                    state,
                    "uninstalls",
                    self._debug_item_block_id(state, "uninstall", uninstall),
                    f"卸载 {uninstall.name}",
                    item_id=uninstall.id,
                ):
                    self._execute_uninstall(state, uninstall)
                remove_instance_config = remove_instance_config or uninstall.remove_instance_config
            self._finalize_uninstall_cleanup(state, remove_instance_config=remove_instance_config)

    def _execute_uninstall(self, state: RuntimeState, uninstall: UninstallDefinition) -> None:
        scope = self._build_scope(
            state,
            state.template.uninstalls_section.env_input,
            uninstall.env_input,
            uninstall.env_input_list,
        )
        workdir = self._guess_uninstall_workdir(state, uninstall)
        self._notify(state, 1, 1, f"卸载 {uninstall.name}", "running", f"工作目录: {workdir}")

        if uninstall.stop_before_uninstall and uninstall.stop_command_list:
            self._run_command_list(
                state,
                uninstall.stop_command_list,
                workdir,
                scope,
                f"卸载 {uninstall.name} 停止命令",
                runtime=uninstall.runtime,
                command_theme=uninstall.command_theme,
            )

        if uninstall.before_command:
            self._run_command_list(
                state,
                uninstall.before_command_list,
                workdir,
                scope,
                f"卸载 {uninstall.name} 前置命令",
                runtime=uninstall.runtime,
                command_theme=uninstall.command_theme,
            )

        for deployment_id in self._resolve_uninstall_deployment_targets(state, uninstall):
            root = str(state.deployment_roots.get(deployment_id, "") or "")
            if not root:
                continue
            if self._remove_path(state, root, label=f"部署目录 {deployment_id}"):
                state.deployment_roots.pop(deployment_id, None)
                state.deploy_paths.pop(deployment_id, None)
                state.removed_paths.append(root)

        for component_id in self._resolve_uninstall_component_targets(state, uninstall):
            if not state.managed_components.get(component_id, False):
                self._notify(state, 1, 1, f"组件 {component_id}", "skipped", "组件未由模板托管安装，跳过删除")
                continue
            install_path = str(state.install_paths.get(component_id, "") or "")
            if not install_path:
                continue
            if self._remove_path(state, install_path, label=f"组件目录 {component_id}"):
                state.install_paths.pop(component_id, None)
                state.managed_components.pop(component_id, None)
                state.removed_paths.append(install_path)

        if uninstall.remove_runtime_files:
            self._remove_runtime_persistence_files(state)

        if uninstall.after_command:
            after_workdir = workdir if os.path.isdir(workdir) else (state.instance_root if os.path.isdir(state.instance_root) else os.getcwd())
            self._run_command_list(
                state,
                uninstall.after_command_list,
                after_workdir,
                scope,
                f"卸载 {uninstall.name} 后置命令",
                runtime=uninstall.runtime,
                command_theme=uninstall.command_theme,
            )

        self._export_env_bindings(
            state,
            state.template.uninstalls_section.env_output,
            uninstall.env_output,
            uninstall.env_output_list,
            scope,
        )

    def _finalize_uninstall_cleanup(
        self,
        state: RuntimeState,
        *,
        remove_instance_config: bool,
    ) -> None:
        if remove_instance_config:
            removed_config = self._remove_instance_config(state.instance_serial_number)
            self._notify(state, 1, 1, "实例配置", "completed", f"已删除: {removed_config}")

    def _resolve_uninstall_deployment_targets(self, state: RuntimeState, uninstall: UninstallDefinition) -> List[str]:
        if not uninstall.remove_deploy_root:
            return []
        targets = list(uninstall.deployment_targets or [])
        if targets:
            return targets
        return list(state.deployment_roots.keys())

    def _resolve_uninstall_component_targets(self, state: RuntimeState, uninstall: UninstallDefinition) -> List[str]:
        if not uninstall.remove_component:
            return []
        targets = list(uninstall.component_targets or [])
        if targets:
            return targets
        return list(state.install_paths.keys())

    def _guess_uninstall_workdir(self, state: RuntimeState, uninstall: UninstallDefinition) -> str:
        for deployment_id in uninstall.deployment_targets:
            root = str(state.deployment_roots.get(deployment_id, "") or "")
            if root and os.path.isdir(root):
                return root
        primary_id = self._first_selected_deployment_id(state)
        primary_root = str(state.deployment_roots.get(primary_id, "") or "")
        if primary_root and os.path.isdir(primary_root):
            return primary_root
        if state.instance_root and os.path.isdir(state.instance_root):
            return state.instance_root
        return os.getcwd()

    def _persist_instance_config(self, state: RuntimeState) -> tuple[str, Dict[str, Any]]:
        serial_number = str(state.plan.template_inputs.get("serial_number", "") or "").strip()
        nickname = str(state.plan.template_inputs.get("nickname", "") or "").strip()
        qq_account = str(state.plan.template_inputs.get("qq_account", "") or "").strip()
        if not serial_number:
            raise RuntimeError("模板部署需要提供 serial_number")
        if not nickname:
            raise RuntimeError("模板部署需要提供 nickname")

        for cfg in config_manager.get_all_configurations().values():
            if str(cfg.get("serial_number", "")) == serial_number:
                raise RuntimeError(f"实例序列号已存在: {serial_number}")

        primary_deployment_id = self._first_selected_deployment_id(state)
        primary_root = state.deployment_roots.get(primary_deployment_id, "")
        secondary_root = self._secondary_deployment_root(state, primary_deployment_id)
        detected_venv = os.path.join(primary_root, ".venv") if primary_root else ""
        venv_path = detected_venv if detected_venv and os.path.isdir(detected_venv) else ""

        bot_type = str(state.plan.template_inputs.get("bot_type", "") or self._profile_to_bot_type(state.template.builtin_profile))
        install_options = {
            "install_adapter": bool(secondary_root),
            "install_napcat": False,
            "install_mongodb": False,
            "install_webui": False,
            "install_mofox_admin_ui": False,
            "install_mofox_webui": False,
        }

        version_path = state.versions.get(primary_deployment_id, state.template.metadata.version)
        bot_path_key = self._bot_path_key(bot_type)
        self._prepare_runtime_file_locations(state, primary_root or state.runtime_root)
        self._write_runtime_persistence_files(state)
        new_config = {
            "serial_number": serial_number,
            "absolute_serial_number": config_manager.generate_unique_serial(),
            "version_path": version_path,
            "nickname_path": nickname,
            "bot_type": bot_type,
            "qq_account": qq_account,
            "mai_path": primary_root if bot_path_key == "mai_path" else "",
            "mofox_path": primary_root if bot_path_key == "mofox_path" else "",
            "neo_mofox_path": primary_root if bot_path_key == "neo_mofox_path" else "",
            "adapter_path": secondary_root,
            "napcat_path": "",
            "napcat_version": "",
            "venv_path": venv_path,
            "mongodb_path": "",
            "webui_path": "",
            "install_options": install_options,
            "mod_binding": state.plan.mod_binding.to_dict(),
            "deployment_profile": state.plan.deployment_profile.to_dict(),
            "component_bindings": [item.to_dict() for item in state.plan.component_bindings],
            "template_inputs": dict(state.plan.template_inputs),
            "template_runtime": self._build_runtime_index(state),
        }

        config_name = f"instance_{serial_number}"
        if not config_manager.add_configuration(config_name, new_config):
            raise RuntimeError("实例配置写入失败")
        config_manager.set("current_config", config_name)
        config_manager.save()
        self._notify(state, 6, 6, "实例配置写入", "completed", f"配置名称: {config_name}", event="detail")
        return config_name, new_config

    def _persist_runtime_files_for_existing_instance(self, state: RuntimeState) -> None:
        if not state.instance_serial_number:
            return
        config_name, config = self.find_instance_config(state.instance_serial_number)
        runtime_info = dict(config.get("template_runtime", {}) or {})
        instance_root = str(runtime_info.get("instance_root", "") or self._primary_instance_root_from_config(config))
        self._prepare_runtime_file_locations(state, instance_root or state.runtime_root)
        self._write_runtime_persistence_files(state)
        config["template_runtime"] = self._build_runtime_index(state)
        config_manager.get_all_configurations()[config_name] = config
        config_manager.save()
        self._notify(state, 1, 1, "运行时状态", "completed", f"已更新实例运行时文件: {config_name}", event="detail")

    def _restore_runtime_state_for_instance(self, state: RuntimeState, serial_number: str) -> None:
        if not serial_number:
            raise RuntimeError("单独运行启动或配置阶段时必须提供实例序列号")
        _, config = self.find_instance_config(serial_number)
        mod_binding = dict(config.get("mod_binding", {}) or {})
        bound_template_id = str(mod_binding.get("template_id", "") or "")
        if bound_template_id and bound_template_id != state.template.metadata.mod_id:
            raise RuntimeError(f"实例 {serial_number} 绑定的模板不是 {state.template.metadata.mod_id}")

        runtime_info = dict(config.get("template_runtime", {}) or {})
        state.instance_serial_number = serial_number
        state.instance_root = str(runtime_info.get("instance_root", "") or self._primary_instance_root_from_config(config))
        state.runtime_env_file = str(runtime_info.get("env_file", "") or "")
        state.runtime_state_file = str(runtime_info.get("state_file", "") or "")
        self._notify(state, 1, 1, "恢复实例运行时", "running", f"实例目录: {state.instance_root}", event="detail")
        if state.runtime_env_file:
            self._notify(state, 1, 1, "恢复实例运行时", "running", f"环境文件: {state.runtime_env_file}", event="detail")
        if state.runtime_state_file:
            self._notify(state, 1, 1, "恢复实例运行时", "running", f"状态文件: {state.runtime_state_file}", event="detail")

        self._prepare_file_imports(state)
        state.env_pool.update(self._read_runtime_env_file(state.runtime_env_file))
        if not state.env_pool:
            state.env_pool.update({str(k): str(v) for k, v in dict(runtime_info.get("exported_env", {}) or {}).items()})

        persisted_state = self._read_runtime_state_file(state.runtime_state_file)
        merged_state = {
            "install_paths": runtime_info.get("install_paths", {}),
            "deploy_paths": runtime_info.get("deploy_paths", {}),
            "deployment_roots": runtime_info.get("deployment_roots", {}),
            "versions": runtime_info.get("versions", {}),
            "version_meta": runtime_info.get("version_meta", {}),
            "managed_components": runtime_info.get("managed_components", {}),
            "opened_files": runtime_info.get("opened_files", []),
            "launched_items": runtime_info.get("launched_items", []),
        }
        merged_state.update({key: value for key, value in persisted_state.items() if value})

        state.install_paths.update({str(k): str(v) for k, v in dict(merged_state.get("install_paths", {}) or {}).items()})
        state.deploy_paths.update({str(k): str(v) for k, v in dict(merged_state.get("deploy_paths", {}) or {}).items()})
        state.deployment_roots.update({str(k): str(v) for k, v in dict(merged_state.get("deployment_roots", {}) or {}).items()})
        state.versions.update({str(k): str(v) for k, v in dict(merged_state.get("versions", {}) or {}).items()})
        state.version_meta.update({str(k): dict(v) for k, v in dict(merged_state.get("version_meta", {}) or {}).items()})
        state.managed_components.update({str(k): bool(v) for k, v in dict(merged_state.get("managed_components", {}) or {}).items()})
        state.opened_files = [str(item) for item in list(merged_state.get("opened_files", []) or [])]
        state.launched_items = [str(item) for item in list(merged_state.get("launched_items", []) or [])]

        primary_root = self._primary_instance_root_from_config(config)
        primary_id = self._first_selected_deployment_id(state)
        if primary_root and primary_id and primary_id not in state.deployment_roots:
            state.deployment_roots[primary_id] = primary_root

    def _prepare_runtime_file_locations(self, state: RuntimeState, instance_root: str) -> None:
        root = os.path.abspath(instance_root)
        os.makedirs(root, exist_ok=True)
        state.instance_root = root
        state.runtime_env_file = os.path.join(root, self.RUNTIME_ENV_FILENAME)
        state.runtime_state_file = os.path.join(root, self.RUNTIME_STATE_FILENAME)

    def _build_runtime_index(self, state: RuntimeState) -> Dict[str, Any]:
        return make_toml_safe(
            {
                "launcher_version": str(p_config_manager.get("launcher.version", "") or ""),
                "instance_root": state.instance_root,
                "env_file": state.runtime_env_file,
                "state_file": state.runtime_state_file,
                "exported_env": dict(state.env_pool),
                "install_paths": dict(state.install_paths),
                "deploy_paths": dict(state.deploy_paths),
                "deployment_roots": dict(state.deployment_roots),
                "versions": dict(state.versions),
                "version_meta": dict(state.version_meta),
                "managed_components": dict(state.managed_components),
                "opened_files": list(state.opened_files),
                "launched_items": list(state.launched_items),
            }
        )

    def _write_runtime_persistence_files(self, state: RuntimeState) -> None:
        if not state.instance_root:
            return
        os.makedirs(state.instance_root, exist_ok=True)
        with open(state.runtime_env_file, "w", encoding="utf-8") as handle:
            for key in sorted(state.env_pool.keys()):
                handle.write(f"{key}={self._dotenv_escape(state.env_pool[key])}\n")

        with open(state.runtime_state_file, "w", encoding="utf-8") as handle:
            toml.dump(
                make_toml_safe(
                    {
                        "template_id": state.template.metadata.mod_id,
                        "serial_number": state.instance_serial_number,
                        "install_paths": dict(state.install_paths),
                        "deploy_paths": dict(state.deploy_paths),
                        "deployment_roots": dict(state.deployment_roots),
                        "versions": dict(state.versions),
                        "version_meta": dict(state.version_meta),
                        "managed_components": dict(state.managed_components),
                        "opened_files": list(state.opened_files),
                        "launched_items": list(state.launched_items),
                    }
                ),
                handle,
            )

    def _read_runtime_env_file(self, file_path: str) -> Dict[str, str]:
        if not file_path or not os.path.isfile(file_path):
            return {}
        env_values: Dict[str, str] = {}
        with open(file_path, "r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                value = value.strip()
                if value.startswith("\"") and value.endswith("\""):
                    value = json.loads(value)
                env_values[key.strip()] = str(value)
        return env_values

    def _read_runtime_state_file(self, file_path: str) -> Dict[str, Any]:
        if not file_path or not os.path.isfile(file_path):
            return {}
        with open(file_path, "r", encoding="utf-8") as handle:
            return toml.load(handle)

    def find_instance_config(self, serial_number: str) -> tuple[str, Dict[str, Any]]:
        for config_name, config in config_manager.get_all_configurations().items():
            if str(config.get("serial_number", "") or "") == str(serial_number):
                return config_name, config
        raise RuntimeError(f"未找到实例序列号: {serial_number}")

    def _primary_instance_root_from_config(self, config: Dict[str, Any]) -> str:
        for key in ("mai_path", "mofox_path", "neo_mofox_path"):
            path = str(config.get(key, "") or "").strip()
            if path:
                return path
        return ""

    @staticmethod
    def _normalize_stage(stage: str) -> str:
        mapping = {
            "full": "full",
            "component": "components",
            "components": "components",
            "deploy": "deployments",
            "deployment": "deployments",
            "deployments": "deployments",
            "launch": "launches",
            "launches": "launches",
            "config": "configs",
            "configs": "configs",
            "uninstall": "uninstalls",
            "uninstalls": "uninstalls",
        }
        normalized = mapping.get(str(stage or "").strip().lower())
        if not normalized:
            raise RuntimeError(f"未知阶段: {stage}")
        return normalized

    @staticmethod
    def _dotenv_escape(value: Any) -> str:
        raw = str(value or "")
        escaped = raw.replace("\\", "\\\\").replace("\"", "\\\"")
        return f"\"{escaped}\""

    # file_import_list 单条记录允许的目录嵌套层数。5 层 = "a/b/c/d/e/file.py"。
    MAX_FILE_IMPORT_DEPTH = 5
    # 路径段合法字符：与工作台白名单一致；"." / ".." / 空段由后续逻辑单独拦截。
    FILE_IMPORT_SEGMENT_PATTERN = re.compile(r"^[A-Za-z0-9._\- ]{1,128}$")

    def _validate_file_import_path(self, raw_path: str) -> str:
        """校验 file_import_list 单条路径。

        归一化为 `/` 分隔、不含首尾斜杠、每段合法、最多 5 层目录（不含文件本身的层）。
        """
        if not raw_path or not str(raw_path).strip():
            raise RuntimeError("file_import_list 路径不能为空")
        normalized = str(raw_path).replace("\\", "/").strip("/")
        if not normalized:
            raise RuntimeError("file_import_list 路径不能为空")
        if len(normalized) > 256:
            raise RuntimeError(f"file_import_list 路径过长（>256）: {raw_path!r}")
        parts = normalized.split("/")
        for part in parts:
            if not part or part == "." or part == "..":
                raise RuntimeError(f"file_import_list 路径段非法: {raw_path!r}")
            if not self.FILE_IMPORT_SEGMENT_PATTERN.match(part):
                raise RuntimeError(f"file_import_list 路径段包含非法字符: {part!r}")
        if len(parts) > self.MAX_FILE_IMPORT_DEPTH + 1:
            raise RuntimeError(
                f"file_import_list 路径嵌套层数超过 {self.MAX_FILE_IMPORT_DEPTH}: {raw_path!r}"
            )
        return normalized

    def _prepare_file_imports(self, state: RuntimeState) -> None:
        if not state.template.metadata.file_import:
            return
        seen_paths: Dict[str, None] = {}
        for raw_filename in state.template.metadata.file_import_list:
            filename = self._validate_file_import_path(raw_filename)
            if filename in seen_paths:
                self._notify(
                    state,
                    1,
                    6,
                    "准备模板运行时",
                    "running",
                    f"重复的文件导入条目已跳过: {filename}",
                    event="detail",
                )
                continue
            seen_paths[filename] = None
            # 把多级路径（正斜杠形式）拼到项目根下；在 Windows 上 os.path.join 会自动转反斜杠
            file_path = os.path.join(state.template.metadata.template_root, filename.replace("/", os.sep))
            if not os.path.isfile(file_path):
                raise RuntimeError(
                    f"模板导入文件不存在: {filename}（项目根: {state.template.metadata.template_root}）"
                )
            # 字典 key 始终保留正斜杠形式，与 file_import_list 与 {{file_path|...}} 写法保持一致
            state.file_paths[filename] = os.path.abspath(file_path)
            self._notify(state, 1, 6, "准备模板运行时", "running", f"已导入文件: {filename}")
            self._notify(
                state,
                1,
                6,
                "准备模板运行时",
                "running",
                f"文件路径: {state.file_paths[filename]}",
                event="detail",
            )

    def _resolve_stage_path(
        self,
        state: RuntimeState,
        stage_name: str,
        item_id: str,
        raw_path: str,
        custom_path: str,
        scope: RuntimeScope,
    ) -> str:
        path_value = str(raw_path or "").strip()
        source = "template"
        if path_value == "$CustomPath":
            source = "custom"
            custom_value = str(custom_path or "").strip()
            if custom_value == "$input$":
                user_value = str(state.plan.template_inputs.get(f"path::{stage_name}::{item_id}", "") or "").strip()
                if not user_value:
                    raise RuntimeError(f"{item_id} 需要用户输入路径")
                resolved_path = os.path.abspath(os.path.expandvars(user_value))
                self._notify(state, 0, 0, f"{stage_name}:{item_id}", "running", f"解析路径 -> {resolved_path} (来源: 用户输入)", event="detail")
                return resolved_path
            resolved_path = os.path.abspath(os.path.expandvars(self._resolve_text(state, custom_value, scope)))
            self._notify(state, 0, 0, f"{stage_name}:{item_id}", "running", f"解析路径 -> {resolved_path} (来源: 自定义表达式)", event="detail")
            return resolved_path

        if path_value in self.SPECIAL_PATHS:
            resolved_path = os.path.abspath(self.SPECIAL_PATHS[path_value]())
            self._notify(state, 0, 0, f"{stage_name}:{item_id}", "running", f"解析路径 -> {resolved_path} (来源: 特殊路径 {path_value})", event="detail")
            return resolved_path

        if not path_value:
            source = "default"
            resolved_path = os.path.abspath(os.path.join(state.runtime_root, stage_name, item_id))
            self._notify(state, 0, 0, f"{stage_name}:{item_id}", "running", f"解析路径 -> {resolved_path} (来源: 默认运行时目录)", event="detail")
            return resolved_path

        resolved = self._resolve_text(state, path_value, scope)
        resolved_path = os.path.abspath(os.path.expandvars(resolved))
        self._notify(state, 0, 0, f"{stage_name}:{item_id}", "running", f"解析路径 -> {resolved_path} (来源: {source})", event="detail")
        return resolved_path

    def _build_scope(
        self,
        state: RuntimeState,
        section_env_input: bool,
        item_env_input: bool,
        bindings: Sequence[EnvBinding],
    ) -> RuntimeScope:
        scope = RuntimeScope()
        if not (section_env_input and item_env_input):
            return scope
        for binding in bindings:
            resolved_value = self._resolve_text(state, binding.value, scope)
            scope.env_values[binding.name] = resolved_value
            display_value = self._format_value_for_log(binding.name, resolved_value)
            self._notify(state, 0, 0, "环境变量导入", "running", f"{binding.name}={display_value}", event="detail")
        return scope

    def _export_env_bindings(
        self,
        state: RuntimeState,
        section_env_output: bool,
        item_env_output: bool,
        bindings: Sequence[EnvBinding],
        scope: RuntimeScope,
    ) -> None:
        if not (section_env_output and item_env_output):
            return
        for binding in bindings:
            resolved_value = self._resolve_text(state, binding.value, scope)
            state.env_pool[binding.name] = resolved_value
            display_value = self._format_value_for_log(binding.name, resolved_value)
            self._notify(state, 0, 0, "环境变量导出", "running", f"{binding.name}={display_value}", event="detail")

    def _resolve_version_and_link(
        self,
        state: RuntimeState,
        stage_name: str,
        item_id: str,
        definition: Any,
        scope: RuntimeScope,
    ) -> str:
        get_method = str(getattr(definition, "get_method", "") or "").strip().lower()
        if get_method:
            self._notify(state, 0, 0, f"{stage_name}:{item_id}", "running", f"获取策略: {get_method}", event="detail")

        if get_method == "direct":
            resolved_link = self._resolve_text(state, getattr(definition, "direct_link", ""), scope)
            self._notify(state, 0, 0, f"{stage_name}:{item_id}", "running", f"直接链接: {resolved_link}", event="detail")
            return resolved_link

        if get_method == "get_link":
            link = self._resolve_link_only(state, stage_name, item_id, definition, scope)
            if link:
                self._notify(state, 0, 0, f"{stage_name}:{item_id}", "running", f"解析下载链接: {link}", event="detail")
                return link
            raise RuntimeError(f"{item_id} 未能获取下载链接")

        if get_method == "get_version":
            selected = self._select_version(state, stage_name, item_id, definition, scope)
            state.versions[item_id] = selected.get("name", "")
            state.version_meta[item_id] = selected
            if getattr(definition, "splicing_link", ""):
                resolved_link = self._resolve_text(state, getattr(definition, "splicing_link", ""), scope)
                self._notify(state, 0, 0, f"{stage_name}:{item_id}", "running", f"拼接下载链接: {resolved_link}", event="detail")
                return resolved_link
            resolved_link = self._resolve_text(state, getattr(definition, "base_link", "") or getattr(definition, "direct_link", ""), scope)
            self._notify(state, 0, 0, f"{stage_name}:{item_id}", "running", f"版本对应链接: {resolved_link}", event="detail")
            return resolved_link

        if getattr(definition, "base_link", ""):
            resolved_link = self._resolve_text(state, getattr(definition, "base_link", ""), scope)
            self._notify(state, 0, 0, f"{stage_name}:{item_id}", "running", f"基础链接: {resolved_link}", event="detail")
            return resolved_link
        return ""

    def _resolve_link_only(
        self,
        state: RuntimeState,
        stage_name: str,
        item_id: str,
        definition: Any,
        scope: RuntimeScope,
    ) -> str:
        provided = str(state.plan.template_inputs.get(f"link::{stage_name}::{item_id}", "") or "").strip()
        if provided:
            self._notify(state, 0, 0, f"{stage_name}:{item_id}", "running", f"使用用户提供的下载链接: {provided}", event="detail")
            return provided

        candidates = self._fetch_link_candidates_runtime(state, stage_name, item_id, definition, scope)
        if candidates:
            self._notify(state, 0, 0, f"{stage_name}:{item_id}", "running", f"未指定下载链接，默认采用首个候选", event="detail")
            return str(candidates[0].get("raw_name") or candidates[0].get("name", "") or "")

        if str(getattr(definition, "get_link", "") or "").strip().lower() == "user_input":
            raise RuntimeError(f"{item_id} 需要用户输入下载链接")
        return ""

    def fetch_version_candidates(
        self,
        template: TemplateDefinition,
        stage_name: str,
        item_id: str,
        definition: Any,
    ) -> List[Dict[str, Any]]:
        """获取给定组件/部署项的可用版本候选列表，供 CLI 交互式选择用。"""
        version_source = str(getattr(definition, "get_version", "") or "").strip().lower()
        if version_source == "github_repo":
            github_repo = self._resolve_text_for_static(
                getattr(definition, "github_repo", "") or "",
                template.raw,
            )
            if github_repo:
                return self._fetch_github_candidates(github_repo)
        elif version_source == "filelink":
            return [
                {"name": item, "raw_name": item, "type": "file"}
                for item in self._extract_candidates_from_static_sources(template, definition, self.VERSION_FILE_FIELDS)
            ]
        elif version_source == "custom":
            return [
                {"name": item, "raw_name": item, "type": "custom"}
                for item in self._execute_custom_provider_static(template, definition, self.VERSION_CUSTOM_FIELDS)
            ]
        return []

    def fetch_link_candidates(
        self,
        template: TemplateDefinition,
        stage_name: str,
        item_id: str,
        definition: Any,
    ) -> List[Dict[str, Any]]:
        _ = stage_name
        _ = item_id
        provided_list = [
            self._resolve_text_for_static(str(item), template.raw)
            for item in getattr(definition, "get_link_provide_list", [])
            if str(item).strip()
        ]
        if provided_list:
            return [{"name": item, "raw_name": item, "type": "provided"} for item in provided_list]

        get_link = str(getattr(definition, "get_link", "") or "").strip().lower()
        if get_link == "filelink":
            return [
                {"name": item, "raw_name": item, "type": "file"}
                for item in self._extract_candidates_from_static_sources(template, definition, self.LINK_FILE_FIELDS)
            ]
        if get_link == "custom":
            return [
                {"name": item, "raw_name": item, "type": "custom"}
                for item in self._execute_custom_provider_static(template, definition, self.LINK_CUSTOM_FIELDS)
            ]
        return []

    def _resolve_text_for_static(self, text: str, raw_template: Dict[str, Any]) -> str:
        """静态版本的文本解析，不依赖运行时 state。"""
        if not text:
            return ""
        template_root = ""
        metadata = raw_template.get("MODINFO") if isinstance(raw_template, dict) else None
        if isinstance(metadata, dict):
            template_root = str(metadata.get("__template_root", "") or "")

        def repl(match: re.Match[str]) -> str:
            kind = match.group(1)
            key = match.group(2).strip()
            if kind == "key":
                return self._resolve_template_key(raw_template, key)
            if kind == "file_path" and template_root:
                # 多级路径：把正斜杠转 os.sep 后再 join，Windows 上结果一致
                return os.path.abspath(os.path.join(template_root, key.replace("/", os.sep)))
            return ""

        for _ in range(5):
            changed = False
            new_text = PLACEHOLDER_PATTERN.sub(repl, text)
            if new_text == text:
                break
            text = new_text
        return text

    def _resolve_provider_source_static(self, template: TemplateDefinition, definition: Any, aliases: Iterable[str]) -> str:
        """静态版本的 provider source 解析。"""
        raw = getattr(definition, "raw", {}) or {}
        for alias in aliases:
            value = str(raw.get(alias, "") or "").strip()
            if value:
                resolved = self._resolve_text_for_static(value, template.raw)
                return self._normalize_provider_source_path(resolved, template.metadata.template_root)
        return ""

    def _resolve_provider_sources_static(self, template: TemplateDefinition, definition: Any, aliases: Iterable[str]) -> List[str]:
        raw = getattr(definition, "raw", {}) or {}
        raw_template = dict(template.raw)
        modinfo = dict(raw_template.get("MODINFO") or {})
        modinfo["__template_root"] = template.metadata.template_root
        raw_template["MODINFO"] = modinfo
        for alias in aliases:
            values = self._coerce_str_list(raw.get(alias))
            if values:
                return [
                    self._normalize_provider_source_path(self._resolve_text_for_static(value, raw_template), template.metadata.template_root)
                    for value in values
                    if value.strip()
                ]
        return []

    def _extract_candidates_from_static_sources(self, template: TemplateDefinition, definition: Any, aliases: Iterable[str]) -> List[str]:
        candidates: List[str] = []
        for source in self._resolve_provider_sources_static(template, definition, aliases):
            candidates.extend(self._extract_candidates_from_source_path(source))
        return candidates

    def _execute_custom_provider_static(self, template: TemplateDefinition, definition: Any, aliases: Iterable[str]) -> List[str]:
        sources = self._resolve_provider_sources_static(template, definition, aliases)
        return self._execute_custom_sources(sources, definition)

    def _select_version(
        self,
        state: RuntimeState,
        stage_name: str,
        item_id: str,
        definition: Any,
        scope: RuntimeScope,
    ) -> Dict[str, Any]:
        manual_version = str(state.plan.template_inputs.get(f"version::{stage_name}::{item_id}", "") or "").strip()
        if manual_version:
            formatted_version = self._format_version_if_needed(definition, manual_version)
            self._notify(state, 0, 0, f"{stage_name}:{item_id}", "running", f"使用手动指定版本: {manual_version} -> {formatted_version}", event="detail")
            return {"name": formatted_version, "raw_name": manual_version, "type": "manual"}

        version_source = str(getattr(definition, "get_version", "") or "").strip().lower()
        candidates: List[Dict[str, Any]] = []
        self._notify(state, 0, 0, f"{stage_name}:{item_id}", "running", f"开始获取版本，来源: {version_source or '未指定'}", event="detail")
        if version_source == "github_repo":
            repo_url = self._resolve_text(state, getattr(definition, "github_repo", ""), scope)
            candidates = self._fetch_github_candidates(repo_url)
            self._notify(state, 0, 0, f"{stage_name}:{item_id}", "running", f"GitHub 返回 {len(candidates)} 个版本候选", event="detail")
        elif version_source == "filelink":
            candidates = [{"name": item, "raw_name": item, "type": "file"} for item in self._extract_candidates_from_source(state, definition, scope)]
            self._notify(state, 0, 0, f"{stage_name}:{item_id}", "running", f"文件源返回 {len(candidates)} 个版本候选", event="detail")
        elif version_source == "custom":
            candidates = [{"name": item, "raw_name": item, "type": "custom"} for item in self._execute_custom_provider(state, definition, scope)]
            self._notify(state, 0, 0, f"{stage_name}:{item_id}", "running", f"自定义脚本返回 {len(candidates)} 个版本候选", event="detail")

        filtered = self._filter_candidates(definition, candidates)
        selected = filtered[0] if filtered else (candidates[0] if candidates else None)
        if not selected:
            raise RuntimeError(f"{item_id} 未能获取可用版本")
        selected = dict(selected)
        selected["raw_name"] = selected.get("raw_name", selected.get("name", ""))
        selected["name"] = self._format_version_if_needed(definition, selected.get("name", ""))
        self._notify(
            state,
            0,
            0,
            f"{stage_name}:{item_id}",
            "running",
            f"选定版本: {selected.get('raw_name', '')} -> {selected.get('name', '')} [{selected.get('type', '')}]",
            event="detail",
        )
        return selected

    def _filter_candidates(self, definition: Any, candidates: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if not getattr(definition, "user_choose", False):
            return candidates

        choose_list = list(getattr(definition, "choose_list", []) or [])
        if not choose_list:
            return candidates

        results: List[Dict[str, Any]] = []
        explicit = [str(item) for item in choose_list if isinstance(item, str)]
        integers = [int(item) for item in choose_list if isinstance(item, int)]

        if explicit:
            explicit_set = {item.lower() for item in explicit}
            results.extend([item for item in candidates if str(item.get("name", "")).lower() in explicit_set])
            seen_names = {str(item.get("name", "")).lower() for item in results}
            for item in explicit:
                if item.lower() not in seen_names:
                    results.append({"name": item, "raw_name": item, "type": "explicit"})

        if integers:
            max_items = max(integers)
            prioritized_candidates = sorted(
                candidates,
                key=lambda item: 0 if str(item.get("type", "")).lower() == "branch" else 1,
            )
            results.extend(prioritized_candidates if max_items == 0 else prioritized_candidates[:max_items])

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

    def _format_version_if_needed(self, definition: Any, version: str) -> str:
        value = str(version or "")
        if not getattr(definition, "format_version", False):
            return value
        for rule in getattr(definition, "version_formatting_formula", []) or []:
            value = re.sub(rule.match, rule.replace, value)
        return value

    def _fetch_github_candidates_with_retry(
        self,
        repo_url: str,
        max_retries: int = 3,
        base_delay: float = 1.0,
    ) -> tuple[List[Dict[str, Any]], str]:
        """
        带指数退避重试的 GitHub 版本获取。
        
        返回: (candidates, error_message)
        - 成功时 candidates 为版本列表，error_message 为空
        - 失败时 candidates 为空列表，error_message 包含错误信息
        """
        owner, repo = self._parse_github_repo(repo_url)
        if not owner or not repo:
            return [], f"无效的 GitHub 仓库地址: {repo_url}"

        headers = {"Accept": "application/vnd.github+json", "User-Agent": "MaiCore-Start"}
        
        # 优先获取 releases（分发版本），其次是 tags，最后是 branches
        endpoints = [
            ("releases", "tag_name", "release"),
            ("tags", "name", "tag"),
            ("branches", "name", "branch"),
        ]
        
        last_error = ""
        for attempt in range(max_retries):
            candidates: List[Dict[str, Any]] = []
            success_count = 0
            
            for endpoint, item_key, item_type in endpoints:
                try:
                    response = requests.get(
                        f"https://api.github.com/repos/{owner}/{repo}/{endpoint}",
                        headers=headers,
                        timeout=20,
                        **self._get_request_kwargs(),
                    )
                    
                    if response.ok:
                        success_count += 1
                        for item in response.json()[:30]:
                            name = str(item.get(item_key, "") or "").strip()
                            if name:
                                candidates.append({"name": name, "raw_name": name, "type": item_type})
                    else:
                        last_error = f"GitHub API 返回 {response.status_code}"
                        
                except requests.exceptions.Timeout:
                    last_error = "请求超时"
                except requests.exceptions.ConnectionError as e:
                    last_error = f"网络连接失败: {str(e)[:50]}"
                except Exception as e:
                    last_error = f"请求异常: {str(e)[:50]}"
            
            # 如果至少有一个端点成功，就返回结果
            if success_count > 0:
                unique: List[Dict[str, Any]] = []
                seen = set()
                for candidate in candidates:
                    key = (candidate["name"].lower(), candidate["type"])
                    if key in seen:
                        continue
                    seen.add(key)
                    unique.append(candidate)
                return unique, ""
            
            # 所有端点都失败，进行指数退避
            if attempt < max_retries - 1:
                delay = base_delay * (2 ** attempt)  # 指数退避: 1s, 2s, 4s
                logger.warning(
                    f"版本获取失败 (尝试 {attempt + 1}/{max_retries})，{delay:.1f}秒后重试...",
                    repo=repo_url,
                    error=last_error,
                )
                time.sleep(delay)
        
        return [], last_error

    def _fetch_github_candidates(self, repo_url: str) -> List[Dict[str, Any]]:
        """兼容旧接口的版本获取（无重试）"""
        candidates, error = self._fetch_github_candidates_with_retry(repo_url, max_retries=1)
        if error and not candidates:
            raise RuntimeError(f"获取版本列表失败: {error}")
        return candidates

    def _extract_candidates_from_source(self, state: RuntimeState, definition: Any, scope: RuntimeScope) -> List[str]:
        get_method = str(getattr(definition, "get_method", "") or "").strip().lower()
        aliases = self.LINK_FILE_FIELDS if get_method == "get_link" else self.VERSION_FILE_FIELDS
        sources = self._resolve_provider_sources(state, definition, scope, aliases)
        candidates: List[str] = []
        for source in sources:
            self._notify(state, 0, 0, "provider:filelink", "running", f"读取文件源: {source}", event="detail")
            candidates.extend(self._extract_candidates_from_source_path(source))
        return candidates

    def _execute_custom_provider(self, state: RuntimeState, definition: Any, scope: RuntimeScope) -> List[str]:
        get_method = str(getattr(definition, "get_method", "") or "").strip().lower()
        aliases = self.LINK_CUSTOM_FIELDS if get_method == "get_link" else self.VERSION_CUSTOM_FIELDS
        sources = self._resolve_provider_sources(state, definition, scope, aliases)
        for source in sources:
            self._notify(state, 0, 0, "provider:custom", "running", f"执行自定义提供器: {source}", event="detail")
        return self._execute_custom_sources(sources, definition)

    def _resolve_provider_source(self, state: RuntimeState, definition: Any, scope: RuntimeScope, aliases: Iterable[str]) -> str:
        raw = getattr(definition, "raw", {}) or {}
        for alias in aliases:
            value = str(raw.get(alias, "") or "").strip()
            if value:
                resolved = self._resolve_text(state, value, scope)
                return self._normalize_provider_source_path(resolved, state.template.metadata.template_root)
        return ""

    def _resolve_provider_sources(self, state: RuntimeState, definition: Any, scope: RuntimeScope, aliases: Iterable[str]) -> List[str]:
        raw = getattr(definition, "raw", {}) or {}
        for alias in aliases:
            values = self._coerce_str_list(raw.get(alias))
            if values:
                return [
                    self._normalize_provider_source_path(self._resolve_text(state, value, scope), state.template.metadata.template_root)
                    for value in values
                    if value.strip()
                ]
        return []

    def _fetch_link_candidates_runtime(
        self,
        state: RuntimeState,
        stage_name: str,
        item_id: str,
        definition: Any,
        scope: RuntimeScope,
    ) -> List[Dict[str, Any]]:
        provided_list = [
            self._resolve_text(state, item, scope)
            for item in getattr(definition, "get_link_provide_list", [])
            if str(item).strip()
        ]
        if provided_list:
            self._notify(state, 0, 0, f"{stage_name}:{item_id}", "running", f"模板提供 {len(provided_list)} 个下载链接候选", event="detail")
            return [{"name": item, "raw_name": item, "type": "provided"} for item in provided_list]

        get_link = str(getattr(definition, "get_link", "") or "").strip().lower()
        if get_link == "filelink":
            raw_candidates = self._extract_candidates_from_source(state, definition, scope)
            if raw_candidates:
                self._notify(state, 0, 0, f"{stage_name}:{item_id}", "running", f"文件源返回 {len(raw_candidates)} 个下载链接", event="detail")
            return [{"name": item, "raw_name": item, "type": "file"} for item in raw_candidates]
        if get_link == "custom":
            raw_candidates = self._execute_custom_provider(state, definition, scope)
            if raw_candidates:
                self._notify(state, 0, 0, f"{stage_name}:{item_id}", "running", f"自定义脚本返回 {len(raw_candidates)} 个下载链接", event="detail")
            return [{"name": item, "raw_name": item, "type": "custom"} for item in raw_candidates]
        return []

    def _execute_custom_sources(self, sources: Sequence[str], definition: Any) -> List[str]:
        raw = getattr(definition, "raw", {}) or {}
        deno_permission_values = self._coerce_str_list(raw.get("deno_permissions"), keep_empty=True)
        jvm_values = self._coerce_str_list(raw.get("JVM"), keep_empty=True)
        deno_index = 0
        jvm_index = 0
        candidates: List[str] = []

        for source in sources:
            extension = self._provider_source_extension(source)
            deno_args: List[str] = []
            jvm_args: List[str] = []
            if extension in {".ts", ".tsx"}:
                deno_args = self._split_provider_args(deno_permission_values[deno_index] if deno_index < len(deno_permission_values) else "")
                deno_index += 1
            elif extension in {".java", ".jar"}:
                jvm_args = self._split_provider_args(jvm_values[jvm_index] if jvm_index < len(jvm_values) else "")
                jvm_index += 1

            output = self._run_external_script(source, deno_args=deno_args, jvm_args=jvm_args)
            candidates.extend(line.strip() for line in output.splitlines() if line.strip())
        return candidates

    def _run_external_script(self, script_path: str, deno_args: Sequence[str] | None = None, jvm_args: Sequence[str] | None = None) -> str:
        temp_dir: tempfile.TemporaryDirectory[str] | None = None
        actual_path = script_path
        cwd = ""
        try:
            if re.match(r"^https?://", script_path, re.I):
                temp_dir = tempfile.TemporaryDirectory(prefix="mcsb-provider-")
                actual_path = self._download_external_script(script_path, temp_dir.name)
                cwd = temp_dir.name
            elif script_path.startswith("file:///"):
                actual_path = script_path[8:]

            if not cwd:
                cwd = os.path.dirname(actual_path) or os.getcwd()

            cmd = self._build_external_script_command(actual_path, deno_args or [], jvm_args or [])
            return self._run_external_script_process(cmd, cwd)
        finally:
            if temp_dir is not None:
                temp_dir.cleanup()

    def _download_external_script(self, url: str, target_dir: str) -> str:
        response = requests.get(url, timeout=30, **self._get_request_kwargs())
        response.raise_for_status()
        suffix = self._provider_source_extension(url) or ".tmp"
        filename = self._sanitize_filename(Path(urlparse(url).path).stem or "provider")
        target_path = os.path.join(target_dir, f"{filename}{suffix}")
        with open(target_path, "wb") as handle:
            handle.write(response.content)
        if os.name != "nt" and suffix in {".sh", ".exe"}:
            os.chmod(target_path, os.stat(target_path).st_mode | stat.S_IEXEC)
        return target_path

    def _build_external_script_command(self, script_path: str, deno_args: Sequence[str], jvm_args: Sequence[str]) -> List[str]:
        lower_name = script_path.lower()
        if lower_name.endswith(".ps1"):
            return ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script_path]
        if lower_name.endswith((".bat", ".cmd")):
            return ["cmd.exe", "/c", script_path]
        if lower_name.endswith(".py"):
            return [sys.executable, script_path]
        if lower_name.endswith(".sh"):
            return ["bash", script_path]
        if lower_name.endswith((".js", ".mjs", ".cjs", ".jsx")):
            return ["node", script_path]
        if lower_name.endswith((".ts", ".tsx")):
            return ["deno", "run", *deno_args, script_path]
        if lower_name.endswith(".java"):
            return ["java", *jvm_args, script_path]
        if lower_name.endswith(".jar"):
            return ["java", *jvm_args, "-jar", script_path]
        return [script_path]

    def _run_external_script_process(self, cmd: Sequence[str], cwd: str) -> str:
        try:
            process = subprocess.Popen(
                list(cmd),
                cwd=cwd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                shell=False,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
            )
        except OSError as exc:
            raise RuntimeError(f"自定义脚本无法启动: {exc}") from exc

        output_lines: List[str] = []
        self._collect_process_output(process, output_lines, timeout_seconds=120)
        returncode = process.wait()
        output = "\n".join(output_lines).strip()
        if returncode != 0:
            raise RuntimeError(f"自定义脚本执行失败: {output or returncode}")
        return output

    def _collect_process_output(self, process: subprocess.Popen, output_lines: List[str], timeout_seconds: int) -> None:
        import queue
        import threading

        if process.stdout is None:
            return

        output_queue: "queue.Queue[str]" = queue.Queue()
        done = threading.Event()

        def read_stream() -> None:
            try:
                while True:
                    line = process.stdout.readline()
                    if line == "":
                        break
                    output_queue.put(line.rstrip("\r\n"))
            finally:
                done.set()
                try:
                    process.stdout.close()
                except Exception:
                    pass

        thread = threading.Thread(target=read_stream, daemon=True)
        thread.start()
        start_time = time.monotonic()
        while True:
            if time.monotonic() - start_time > timeout_seconds:
                process.kill()
                raise RuntimeError(f"自定义脚本执行超时（超过 {timeout_seconds} 秒）")
            try:
                line = output_queue.get(timeout=0.1)
            except queue.Empty:
                if done.is_set() and process.poll() is not None and output_queue.empty():
                    break
                continue
            output_lines.append(line)

    def _extract_candidates_from_source_path(self, source: str) -> List[str]:
        content = self._read_text_source(source)
        lower_source = self._provider_source_basename(source).lower()
        if lower_source.endswith(".json"):
            return self._extract_scalar_strings(json.loads(content))
        if lower_source.endswith(".toml"):
            return self._extract_scalar_strings(toml.loads(content))
        if lower_source.endswith(".xml"):
            root = ElementTree.fromstring(content)
            return self._extract_scalar_strings(self._xml_to_tree(root))
        return [line.strip() for line in content.splitlines() if line.strip()]

    @staticmethod
    def _coerce_str_list(value: Any, keep_empty: bool = False) -> List[str]:
        if value is None:
            return []
        if isinstance(value, list):
            values = [str(item).strip() for item in value]
            return values if keep_empty else [item for item in values if item]
        text = str(value).strip()
        return [text] if text else []

    @staticmethod
    def _split_provider_args(value: str) -> List[str]:
        text = str(value or "").strip()
        if not text:
            return []
        try:
            return shlex.split(text)
        except ValueError:
            return [part for part in text.split() if part]

    @staticmethod
    def _provider_source_basename(source: str) -> str:
        if re.match(r"^https?://", source, re.I):
            return Path(urlparse(source).path).name
        if source.startswith("file:///"):
            return Path(source[8:]).name
        return Path(source).name

    @classmethod
    def _provider_source_extension(cls, source: str) -> str:
        return Path(cls._provider_source_basename(source)).suffix.lower()

    def _resolve_text(self, state: RuntimeState, text: str, scope: RuntimeScope) -> str:
        value = str(text or "")
        for _ in range(10):
            changed = False

            def repl(match: re.Match[str]) -> str:
                nonlocal changed
                changed = True
                return self._resolve_placeholder(state, match.group(1), match.group(2).strip(), scope)

            value = PLACEHOLDER_PATTERN.sub(repl, value)
            if not changed:
                break
        return value

    def _resolve_placeholder(self, state: RuntimeState, kind: str, key: str, scope: RuntimeScope) -> str:
        if kind == "key":
            return self._resolve_template_key(state.template.raw, key)
        if kind == "env":
            return scope.env_values.get(key, str(state.env_pool.get(key, "")))
        if kind == "install_path":
            return str(state.install_paths.get(key, ""))
        if kind == "deploy_path":
            return str(state.deploy_paths.get(key, ""))
        if kind == "version":
            return str(state.versions.get(key, ""))
        if kind == "file_path":
            return str(state.file_paths.get(key, ""))
        if kind == "file_key":
            return self._resolve_file_key(state, key)
        return ""

    def _resolve_template_key(self, raw: Dict[str, Any], path: str) -> str:
        segments = [segment for segment in path.split(".") if segment]
        if not segments:
            return ""
        current: Any = raw.get(segments[0])
        if current is None:
            raise RuntimeError(f"模板键路径不存在: {path}")
        index = 1
        if segments[0] in {"Component", "Deployment", "LaunchItem", "ConfigItem", "UninstallItem"}:
            if index >= len(segments):
                raise RuntimeError(f"不允许直接引用整个表: {path}")
            selector = segments[index]
            index += 1
            if selector.isdigit():
                selector_index = int(selector)
                if selector_index >= len(current):
                    raise RuntimeError(f"模板键索引越界: {path}")
                current = current[selector_index]
            else:
                current = next((item for item in current if str(item.get("id", "") or item.get("name", "")).strip() == selector), None)
                if current is None:
                    raise RuntimeError(f"模板键路径不存在: {path}")
        return self._resolve_tree_value(current, segments[index:], path)

    def _resolve_file_key(self, state: RuntimeState, path: str) -> str:
        # 按 key 长度降序匹配，避免「a」先于「a/b/c」匹配。`{{file_key|version/JSON/version.json.version}}`
        # 走的是「先匹配最长 filename，再截取 . 后面的 segments」的方式。
        for filename in sorted(state.file_paths.keys(), key=len, reverse=True):
            if path == filename:
                return self._stringify_value(self._get_file_tree(state, filename), path)
            prefix = f"{filename}."
            if path.startswith(prefix):
                return self._resolve_tree_value(
                    self._get_file_tree(state, filename),
                    path[len(prefix):].split("."),
                    path,
                )
        available = sorted(state.file_paths.keys())
        hint = f"；已导入的文件: {available}" if available else ""
        raise RuntimeError(f"文件键路径不存在: {path!r}{hint}")

    def _get_file_tree(self, state: RuntimeState, filename: str) -> Any:
        if filename in state.file_trees:
            return state.file_trees[filename]
        file_path = str(state.file_paths.get(filename, "") or "").strip()
        if not file_path:
            available = sorted(state.file_paths.keys())
            raise RuntimeError(
                f"模板导入文件未在 file_import_list 中声明: {filename!r}（已声明: {available}）"
            )
        if not os.path.isfile(file_path):
            raise RuntimeError(
                f"模板导入文件不存在: {filename}（绝对路径: {file_path}，项目根: {state.template.metadata.template_root}）"
            )
        try:
            parsed = self._parse_structured_file(file_path)
        except Exception as exc:
            raise RuntimeError(f"导入文件 {filename} 无法作为结构化文本解析: {exc}") from exc
        state.file_trees[filename] = parsed
        return parsed

    def _resolve_tree_value(self, current: Any, segments: List[str], raw_path: str) -> str:
        node = current
        for segment in segments:
            if isinstance(node, list):
                if segment == "length":
                    return str(len(node))
                if not segment.isdigit():
                    raise RuntimeError(f"数组访问必须使用索引: {raw_path}")
                index = int(segment)
                if index >= len(node):
                    raise RuntimeError(f"数组索引越界: {raw_path}")
                node = node[index]
                continue
            if isinstance(node, dict):
                if segment not in node:
                    raise RuntimeError(f"键路径不存在: {raw_path}")
                node = node[segment]
                continue
            raise RuntimeError(f"键路径无法继续解析: {raw_path}")
        return self._stringify_value(node, raw_path)

    def _stringify_value(self, value: Any, raw_path: str) -> str:
        if isinstance(value, bool):
            return "true" if value else "false"
        if isinstance(value, (int, float)):
            return str(value)
        if isinstance(value, str):
            return value
        if isinstance(value, list):
            return ",".join(self._stringify_value(item, raw_path) for item in value)
        if isinstance(value, dict):
            raise RuntimeError(f"不允许直接引用整个内联表: {raw_path}")
        return str(value)

    def _run_command_list(
        self,
        state: RuntimeState,
        commands: Sequence[str],
        cwd: str,
        scope: RuntimeScope,
        label: str,
        detached: bool = False,
        raise_on_error: bool = True,
        runtime: str = "",
        command_theme: str = "",
    ) -> CommandExecutionResult:
        if not commands:
            return CommandExecutionResult()
        runtime = self._normalize_runtime(runtime or state.template.metadata.runtime)
        command_theme = self._normalize_command_theme(command_theme or self._default_command_theme())
        script_dir = os.path.join(state.runtime_root, "scripts")
        os.makedirs(script_dir, exist_ok=True)
        timestamp = int(time.time() * 1000)
        script_path = os.path.join(script_dir, f"{timestamp}_{self._sanitize_filename(label)}{self._script_extension(runtime)}")
        resolved_commands = [self._resolve_text(state, command, scope) for command in commands]
        self._write_script(runtime, script_path, resolved_commands)
        cmd = self._build_shell_command(runtime, script_path, state.template.metadata)
        env = os.environ.copy()
        env.update(state.env_pool)
        env.update(scope.env_values)
        runtime_label = self._runtime_label(runtime)
        primary_command = resolved_commands[0] if resolved_commands else script_path
        command_payload = {
            "runtime": runtime,
            "runtime_label": runtime_label,
            "script_path": script_path,
            "cwd": cwd,
            "command_count": len(resolved_commands),
            "primary_command": primary_command,
            "commands": resolved_commands,
            "command_theme": command_theme,
        }
        command_id = self._debug_command_started(state, label, command_payload)

        logger.info(
            "执行命令脚本",
            label=label,
            script_path=script_path,
            cwd=cwd,
            runtime=runtime,
            command_count=len(resolved_commands),
            commands=resolved_commands,
        )
        self._notify(
            state,
            0,
            0,
            label,
            "running",
            f"开始执行 {len(resolved_commands)} 条命令",
            event="command",
            data={
                "command_status": "started",
                **command_payload,
                "debug_command_id": command_id,
            },
        )

        if detached:
            popen_kwargs: Dict[str, Any] = {"cwd": cwd, "env": env, "shell": False}
            if os.name == "nt":
                popen_kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS
            else:
                popen_kwargs["start_new_session"] = True
            process = subprocess.Popen(cmd, **popen_kwargs)
            self._debug_register_process(state, process, command_id, label, cmd)
            self._notify(
                state,
                4,
                6,
                label,
                "completed",
                f"已托管启动脚本: {script_path}",
                event="command",
                data={
                    "command_status": "detached",
                    "runtime": runtime,
                    "runtime_label": runtime_label,
                    "script_path": script_path,
                    "cwd": cwd,
                    "command_count": len(resolved_commands),
                    "primary_command": primary_command,
                    "pid": getattr(process, "pid", None),
                    "command_theme": command_theme,
                    "debug_command_id": command_id,
                },
            )
            self._debug_command_finished(state, command_id, status="detached", returncode=0)
            return CommandExecutionResult(output="", returncode=0, script_path=script_path, detached=True)

        try:
            process = subprocess.Popen(
                cmd,
                cwd=cwd,
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                shell=False,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
            )
        except OSError as exc:
            self._debug_command_finished(state, command_id, status="failed", error=str(exc))
            self._notify(
                state,
                0,
                0,
                label,
                "failed",
                f"无法启动进程: {exc}",
                event="command",
                data={
                    "command_status": "failed",
                    "runtime": runtime,
                    "runtime_label": runtime_label,
                    "script_path": script_path,
                    "cwd": cwd,
                    "command_count": len(resolved_commands),
                    "primary_command": primary_command,
                    "command_theme": command_theme,
                    "debug_command_id": command_id,
                },
            )
            raise RuntimeError(f"{label} 无法启动进程: {exc}")

        self._debug_register_process(state, process, command_id, label, cmd)
        output_lines: List[str] = []
        try:
            self._stream_process_output(
                state,
                process,
                label,
                output_lines,
                timeout_seconds=600,
                runtime=runtime,
                command_id=command_id,
            )
            returncode = process.wait()
        except DebugSessionStopped:
            process.kill()
            self._debug_command_finished(state, command_id, status="stopped", error="调试会话已停止")
            raise
        except Exception as exc:
            process.kill()
            self._debug_command_finished(state, command_id, status="failed", error=str(exc))
            raise RuntimeError(f"{label} 进程等待失败: {exc}")

        full_output = "\n".join(output_lines).strip()
        if returncode != 0 and raise_on_error:
            self._debug_command_finished(state, command_id, status="failed", returncode=returncode, error=full_output)
            self._notify(
                state,
                0,
                0,
                label,
                "failed",
                f"命令执行失败，返回码 {returncode}",
                event="command",
                data={
                    "command_status": "failed",
                    "runtime": runtime,
                    "runtime_label": runtime_label,
                    "script_path": script_path,
                    "cwd": cwd,
                    "command_count": len(resolved_commands),
                    "primary_command": primary_command,
                    "returncode": returncode,
                    "line_count": len(output_lines),
                    "command_theme": command_theme,
                    "debug_command_id": command_id,
                },
            )
            raise RuntimeError(f"{label} 执行失败 (返回码 {returncode}):\n{full_output}")

        self._debug_command_finished(
            state,
            command_id,
            status="failed" if returncode != 0 else "completed",
            returncode=returncode,
            error=full_output if returncode != 0 else "",
        )
        self._notify(
            state,
            0,
            0,
            label,
            "failed" if returncode != 0 else "completed",
            f"命令执行完成，返回码 {returncode}",
            event="command",
            data={
                "command_status": "failed" if returncode != 0 else "completed",
                "runtime": runtime,
                "runtime_label": runtime_label,
                "script_path": script_path,
                "cwd": cwd,
                "command_count": len(resolved_commands),
                "primary_command": primary_command,
                "returncode": returncode,
                "line_count": len(output_lines),
                "command_theme": command_theme,
                "debug_command_id": command_id,
            },
        )
        return CommandExecutionResult(output=full_output, returncode=returncode, script_path=script_path)

    def _stream_process_output(
        self,
        state: RuntimeState,
        process: subprocess.Popen,
        label: str,
        output_lines: List[str],
        timeout_seconds: int = 600,
        runtime: str = "",
        command_id: str = "",
    ) -> None:
        """实时流式读取子进程输出，并通过事件系统同步到 CLI / WebUI。"""
        import queue
        import threading

        if process.stdout is None:
            return

        output_queue: "queue.Queue[str]" = queue.Queue()
        done = threading.Event()
        read_error: List[BaseException] = []

        def read_stream() -> None:
            try:
                while True:
                    line = process.stdout.readline()
                    if line == "":
                        break
                    output_queue.put(line.rstrip("\r\n"))
            except BaseException as exc:
                read_error.append(exc)
            finally:
                done.set()
                try:
                    process.stdout.close()
                except Exception:
                    pass

        start_time = time.monotonic()
        thread = threading.Thread(target=read_stream, daemon=True)
        thread.start()
        active_command_index: Optional[int] = None

        try:
            while True:
                self._debug_wait(state)
                if timeout_seconds > 0 and time.monotonic() - start_time > timeout_seconds:
                    process.kill()
                    raise RuntimeError(f"{label} 执行超时（超过 {timeout_seconds // 60} 分钟）")

                try:
                    line = output_queue.get(timeout=0.1)
                except queue.Empty:
                    if done.is_set() and process.poll() is not None and output_queue.empty():
                        break
                    continue

                marker = self._parse_command_marker(line)
                if marker:
                    marker_type = marker["type"]
                    if marker_type == "begin":
                        active_command_index = int(marker.get("command_index", 0))
                    marker_message = str(marker.get("command") or marker.get("cwd") or marker_type)
                    self._debug_command_meta(state, command_id, marker)
                    self._notify(
                        state,
                        0,
                        0,
                        label,
                        "running",
                        marker_message,
                        event="command_meta",
                        data={"meta_type": marker_type, **marker},
                    )
                    continue

                output_lines.append(line)
                if line.strip():
                    self._debug_command_output(state, command_id, line, active_command_index, runtime)
                    self._notify(
                        state,
                        0,
                        0,
                        label,
                        "running",
                        line,
                        event="command_output",
                        data={"command_index": active_command_index, "runtime": runtime},
                    )
        finally:
            thread.join(timeout=5)
            while not output_queue.empty():
                line = output_queue.get_nowait()
                marker = self._parse_command_marker(line)
                if marker:
                    marker_type = marker["type"]
                    if marker_type == "begin":
                        active_command_index = int(marker.get("command_index", 0))
                    marker_message = str(marker.get("command") or marker.get("cwd") or marker_type)
                    self._debug_command_meta(state, command_id, marker)
                    self._notify(
                        state,
                        0,
                        0,
                        label,
                        "running",
                        marker_message,
                        event="command_meta",
                        data={"meta_type": marker_type, **marker},
                    )
                    continue

                output_lines.append(line)
                if line.strip():
                    self._debug_command_output(state, command_id, line, active_command_index, runtime)
                    self._notify(
                        state,
                        0,
                        0,
                        label,
                        "running",
                        line,
                        event="command_output",
                        data={"command_index": active_command_index, "runtime": runtime},
                    )
            if read_error:
                raise RuntimeError(f"{label} 读取命令输出失败: {read_error[0]}")

    def _download_asset(self, state: RuntimeState, item_id: str, url: str, target_dir: str, stage_name: str) -> str:
        download_dir = os.path.join(target_dir, "__downloads__")
        os.makedirs(download_dir, exist_ok=True)
        parsed = urlparse(url)
        filename = os.path.basename(parsed.path) or f"{item_id}.bin"
        target_path = os.path.join(download_dir, filename)

        step_name = f"{stage_name}:{item_id}"
        self._notify(state, 0, 0, step_name, "running", f"下载资源: {url}")
        self._notify(state, 0, 0, step_name, "running", f"保存路径: {target_path}", event="detail")
        try:
            with requests.get(url, stream=True, timeout=(15, 60), **self._get_request_kwargs()) as response:
                response.raise_for_status()
                total_bytes = int(response.headers.get("content-length") or 0)
                self._notify(state, 0, 0, step_name, "running", f"远端文件大小: {total_bytes or '未知'} 字节", event="detail")
                download_meta = {
                    "download_id": f"{stage_name}:{item_id}:{filename}",
                    "stage_name": stage_name,
                    "item_id": item_id,
                    "filename": filename,
                    "url": url,
                    "total_bytes": total_bytes,
                }
                self._notify(
                    state,
                    0,
                    0,
                    step_name,
                    "running",
                    f"开始下载: {filename}",
                    event="download",
                    data={**download_meta, "download_status": "started", "downloaded_bytes": 0},
                )

                downloaded_bytes = 0
                last_report_bytes = 0
                last_report_time = time.monotonic()
                with open(target_path, "wb") as handle:
                    for chunk in response.iter_content(chunk_size=1024 * 64):
                        if not chunk:
                            continue
                        handle.write(chunk)
                        downloaded_bytes += len(chunk)

                        now = time.monotonic()
                        if downloaded_bytes - last_report_bytes >= 1024 * 256 or now - last_report_time >= 0.12:
                            self._notify(
                                state,
                                0,
                                0,
                                step_name,
                                "running",
                                f"下载中: {filename}",
                                event="download",
                                data={
                                    **download_meta,
                                    "download_status": "progress",
                                    "downloaded_bytes": downloaded_bytes,
                                },
                            )
                            last_report_bytes = downloaded_bytes
                            last_report_time = now

                self._notify(
                    state,
                    0,
                    0,
                    step_name,
                    "completed",
                    f"下载完成: {filename}",
                    event="download",
                    data={
                        **download_meta,
                        "download_status": "completed",
                        "downloaded_bytes": downloaded_bytes,
                    },
                )
        except Exception as exc:
            self._notify(
                state,
                0,
                0,
                step_name,
                "failed",
                f"下载失败: {filename}",
                event="download",
                data={
                    "download_id": f"{stage_name}:{item_id}:{filename}",
                    "stage_name": stage_name,
                    "item_id": item_id,
                    "filename": filename,
                    "url": url,
                    "download_status": "failed",
                    "downloaded_bytes": 0,
                    "error": str(exc),
                },
            )
            raise
        return target_path

    def _run_asset_process(
        self,
        state: RuntimeState,
        cmd: Sequence[str],
        cwd: str,
        label: str,
        runtime_label: str,
    ) -> None:
        command_text = " ".join(str(item) for item in cmd)
        command_payload = {
            "runtime": runtime_label.lower(),
            "runtime_label": runtime_label,
            "cwd": cwd,
            "primary_command": command_text,
            "commands": [command_text],
            "command_count": 1,
        }
        command_id = self._debug_command_started(state, label, command_payload)
        self._notify(
            state,
            0,
            0,
            label,
            "running",
            f"开始执行资源进程: {command_text}",
            event="command",
            data={"command_status": "started", **command_payload, "debug_command_id": command_id},
        )
        try:
            process = subprocess.Popen(
                list(cmd),
                cwd=cwd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                shell=False,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
            )
        except OSError as exc:
            self._debug_command_finished(state, command_id, status="failed", error=str(exc))
            self._notify(
                state,
                0,
                0,
                label,
                "failed",
                f"资源进程无法启动: {exc}",
                event="command",
                data={"command_status": "failed", **command_payload, "debug_command_id": command_id},
            )
            raise RuntimeError(f"{label} 资源进程无法启动: {exc}") from exc

        self._debug_register_process(state, process, command_id, label, list(cmd))
        output_lines: List[str] = []
        try:
            self._stream_process_output(
                state,
                process,
                label,
                output_lines,
                timeout_seconds=0,
                runtime=runtime_label.lower(),
                command_id=command_id,
            )
            returncode = process.wait()
        except DebugSessionStopped:
            process.kill()
            self._debug_command_finished(state, command_id, status="stopped", error="调试会话已停止")
            raise
        except Exception as exc:
            process.kill()
            self._debug_command_finished(state, command_id, status="failed", error=str(exc))
            raise RuntimeError(f"{label} 资源进程执行异常: {exc}") from exc

        if returncode != 0:
            full_output = "\n".join(output_lines).strip()
            self._debug_command_finished(state, command_id, status="failed", returncode=returncode, error=full_output)
            self._notify(
                state,
                0,
                0,
                label,
                "failed",
                f"资源进程执行失败，返回码 {returncode}",
                event="command",
                data={"command_status": "failed", "returncode": returncode, "line_count": len(output_lines), "debug_command_id": command_id},
            )
            raise RuntimeError(f"{label} 资源进程执行失败 (返回码 {returncode}):\n{full_output}")

        self._debug_command_finished(state, command_id, status="completed", returncode=0)
        self._notify(
            state,
            0,
            0,
            label,
            "completed",
            "资源进程执行完成",
            event="command",
            data={"command_status": "completed", "returncode": 0, "line_count": len(output_lines), "debug_command_id": command_id},
        )

    def _operate_asset(
        self,
        state: RuntimeState,
        asset_path: str,
        target_dir: str,
        is_deployment: bool,
        label: str,
    ) -> None:
        extension = self._normalize_extension(asset_path)
        self._notify(
            state,
            0,
            0,
            label,
            "running",
            f"处理资源文件: {os.path.basename(asset_path)} [{extension or 'unknown'}] -> {target_dir}",
            event="detail",
        )
        if extension in {".zip", ".tar", ".gz", ".tgz", ".xz", ".tar.gz", ".tar.xz"}:
            extracted_root = self._extract_archive(state, asset_path, target_dir, label=label)
            if not is_deployment:
                self._merge_component_archive_payload(target_dir, extracted_root)
                self._notify(state, 0, 0, label, "running", f"组件资源已合并到: {target_dir}", event="detail")
            return
        if extension in {".exe", ".msi"}:
            self._notify(state, 0, 0, label, "running", f"执行安装程序: {asset_path}", event="detail")
            self._run_asset_process(state, [asset_path], target_dir, label, "Executable")
            return
        if extension == ".ps1":
            self._notify(state, 0, 0, label, "running", f"执行 PowerShell 脚本资源: {asset_path}", event="detail")
            self._run_asset_process(state, ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", asset_path], target_dir, label, "PowerShell")
            return
        if extension in {".bat", ".cmd"}:
            self._notify(state, 0, 0, label, "running", f"执行批处理资源: {asset_path}", event="detail")
            self._run_asset_process(state, ["cmd.exe", "/c", asset_path], target_dir, label, "cmd")
            return
        if extension == ".sh":
            self._notify(state, 0, 0, label, "running", f"执行 Shell 脚本资源: {asset_path}", event="detail")
            self._run_asset_process(state, ["bash", asset_path], target_dir, label, "bash")
            return
        if extension == ".py":
            self._notify(state, 0, 0, label, "running", f"执行 Python 脚本资源: {asset_path}", event="detail")
            self._run_asset_process(state, [sys.executable, asset_path], target_dir, label, "python")
            return
        if extension in {".js", ".mjs", ".cjs", ".jsx"}:
            self._notify(state, 0, 0, label, "running", f"执行 Node 脚本资源: {asset_path}", event="detail")
            self._run_asset_process(state, ["node", asset_path], target_dir, label, "node")
            return
        if extension in {".ts", ".tsx"}:
            self._notify(state, 0, 0, label, "running", f"执行 Deno 脚本资源: {asset_path}", event="detail")
            self._run_asset_process(state, ["deno", "run", asset_path], target_dir, label, "deno")
            return
        if is_deployment:
            shutil.copy2(asset_path, os.path.join(target_dir, os.path.basename(asset_path)))
            self._notify(state, 0, 0, label, "completed", f"已复制资源到: {target_dir}", event="detail")

    def _merge_component_archive_payload(self, target_dir: str, extracted_root: str) -> None:
        if not extracted_root or not os.path.isdir(extracted_root):
            return

        if os.path.abspath(extracted_root) == os.path.abspath(target_dir):
            return

        for entry in os.listdir(extracted_root):
            source_path = os.path.join(extracted_root, entry)
            target_path = os.path.join(target_dir, entry)
            if os.path.exists(target_path):
                if os.path.isdir(target_path):
                    self._safe_rmtree(target_path)
                else:
                    os.remove(target_path)
            shutil.move(source_path, target_path)

        extract_root = os.path.join(target_dir, "__extract__")
        if os.path.isdir(extract_root):
            self._safe_rmtree(extract_root)

    def _extract_archive(self, state: RuntimeState, archive_path: str, target_dir: str, label: str) -> str:
        temp_extract = os.path.join(target_dir, "__extract__")
        if os.path.isdir(temp_extract):
            self._safe_rmtree(temp_extract)
        os.makedirs(temp_extract, exist_ok=True)
        self._notify(state, 0, 0, label, "running", f"解压资源: {archive_path} -> {temp_extract}", event="detail")

        lower_name = archive_path.lower()
        if lower_name.endswith(".zip"):
            with zipfile.ZipFile(archive_path, "r") as archive:
                archive.extractall(temp_extract)
        elif lower_name.endswith((".tar", ".tar.gz", ".tgz", ".tar.xz", ".xz", ".gz")):
            with tarfile.open(archive_path, "r:*") as archive:
                archive.extractall(temp_extract)
        else:
            raise RuntimeError(f"不支持的压缩格式: {archive_path}")

        entries = [entry for entry in os.listdir(temp_extract) if entry not in {".", ".."}]
        if len(entries) == 1:
            extracted_root = os.path.join(temp_extract, entries[0])
        else:
            extracted_root = temp_extract
        self._notify(state, 0, 0, label, "completed", f"解压完成，输出目录: {extracted_root}", event="detail")
        return extracted_root

    def _flatten_single_root(self, source_root: str, final_root: str) -> None:
        source_abs = os.path.abspath(source_root)
        final_abs = os.path.abspath(final_root)
        if source_abs == final_abs:
            return
        source_parent_abs = os.path.abspath(os.path.dirname(source_abs))

        if source_parent_abs.startswith(final_abs + os.sep):
            for entry in os.listdir(source_abs):
                source_path = os.path.join(source_abs, entry)
                target_path = os.path.join(final_abs, entry)
                if os.path.exists(target_path):
                    if os.path.isdir(target_path):
                        self._safe_rmtree(target_path)
                    else:
                        os.remove(target_path)
                shutil.move(source_path, target_path)
            extract_root = os.path.join(final_abs, "__extract__")
            if os.path.isdir(extract_root):
                self._safe_rmtree(extract_root)
            return

        if os.path.isdir(final_abs):
            self._safe_rmtree(final_abs)
        os.makedirs(os.path.dirname(final_abs), exist_ok=True)
        shutil.move(source_abs, final_abs)

    def _git_clone(
        self,
        state: RuntimeState,
        repo_url: str,
        target_dir: str,
        ref_name: Optional[str],
        label: str,
    ) -> bool:
        if os.path.isdir(target_dir):
            self._safe_rmtree(target_dir)
        cmd = ["git", "clone", "--depth", "1"]
        if ref_name:
            cmd.extend(["-b", ref_name])
        cmd.extend([repo_url, target_dir])
        clone_cwd = os.path.dirname(target_dir) or os.getcwd()
        command_payload = {
            "runtime": "git",
            "runtime_label": "Git",
            "cwd": clone_cwd,
            "primary_command": " ".join(cmd),
            "commands": [" ".join(cmd)],
            "command_count": 1,
        }
        command_id = self._debug_command_started(state, label, command_payload)
        self._notify(
            state,
            0,
            0,
            label,
            "running",
            f"开始执行 Git 克隆",
            event="command",
            data={
                "command_status": "started",
                **command_payload,
                "debug_command_id": command_id,
            },
        )
        try:
            process = subprocess.Popen(
                cmd,
                cwd=clone_cwd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
            )
        except OSError as exc:
            self._debug_command_finished(state, command_id, status="failed", error=str(exc))
            self._notify(state, 0, 0, label, "failed", f"Git 无法启动: {exc}", event="command", data={"command_status": "failed"})
            logger.warning("Git 克隆启动失败", repo=repo_url, target=target_dir, error=str(exc))
            return False

        self._debug_register_process(state, process, command_id, label, cmd)
        output_lines: List[str] = []
        try:
            self._stream_process_output(state, process, label, output_lines, timeout_seconds=1800, runtime="git", command_id=command_id)
            returncode = process.wait()
        except DebugSessionStopped:
            process.kill()
            self._debug_command_finished(state, command_id, status="stopped", error="调试会话已停止")
            raise
        except Exception as exc:
            process.kill()
            self._debug_command_finished(state, command_id, status="failed", error=str(exc))
            self._notify(state, 0, 0, label, "failed", f"Git 克隆异常: {exc}", event="command", data={"command_status": "failed"})
            logger.warning("Git 克隆异常，准备回退", repo=repo_url, target=target_dir, error=str(exc))
            return False

        if returncode == 0:
            self._debug_command_finished(state, command_id, status="completed", returncode=0)
            self._notify(
                state,
                0,
                0,
                label,
                "completed",
                "Git 克隆完成",
                event="command",
                data={"command_status": "completed", "returncode": 0, "line_count": len(output_lines), "debug_command_id": command_id},
            )
            return True

        full_output = "\n".join(output_lines).strip()
        self._debug_command_finished(state, command_id, status="failed", returncode=returncode, error=full_output)
        self._notify(
            state,
            0,
            0,
            label,
            "failed",
            f"Git 克隆失败，返回码 {returncode}",
            event="command",
            data={"command_status": "failed", "returncode": returncode, "line_count": len(output_lines), "debug_command_id": command_id},
        )
        logger.warning("Git 克隆失败，准备回退", repo=repo_url, target=target_dir, error=full_output)
        return False

    def _build_github_archive_url(self, repo_url: str, version_meta: Dict[str, Any]) -> str:
        owner, repo = self._parse_github_repo(repo_url)
        if not owner or not repo:
            raise RuntimeError(f"无法从仓库地址推导归档链接: {repo_url}")
        ref_name = str(version_meta.get("raw_name") or version_meta.get("name") or "main")
        ref_type = str(version_meta.get("type") or "branch")
        if ref_type in {"release", "tag"}:
            return f"https://github.com/{owner}/{repo}/archive/refs/tags/{ref_name}.zip"
        return f"https://github.com/{owner}/{repo}/archive/refs/heads/{ref_name}.zip"

    def _guess_launch_workdir(self, state: RuntimeState, launch: LaunchDefinition) -> str:
        if launch.id in state.deployment_roots:
            return state.deployment_roots[launch.id]
        primary_id = self._first_selected_deployment_id(state)
        return state.deployment_roots.get(primary_id, os.getcwd())

    def _first_selected_deployment_id(self, state: RuntimeState) -> str:
        raw_ids = str(state.plan.deployment_profile.deployment_id or "").strip()
        if raw_ids:
            return raw_ids.split(",")[0]
        ordered = self._ordered_items(state.template.deployments_section.list, state.template.deployments)
        return ordered[0].id if ordered else ""

    def _secondary_deployment_root(self, state: RuntimeState, primary_id: str) -> str:
        for deployment_id, root in state.deployment_roots.items():
            if deployment_id != primary_id:
                return root
        return ""

    @staticmethod
    def _ordered_items(order: Sequence[str], items: Sequence[Any]) -> List[Any]:
        if not order:
            return list(items)
        item_map = {item.id if getattr(item, "id", "") else item.name: item for item in items}
        return [item_map[item_id] for item_id in order if item_id in item_map]

    def _notify(
        self,
        state: RuntimeState,
        step: int,
        total_steps: int,
        step_name: str,
        status: str,
        message: str,
        event: str = "stage",
        data: Optional[Dict[str, Any]] = None,
    ) -> None:
        payload = dict(data or {})
        self._append_runtime_log(state, step=step, total_steps=total_steps, step_name=step_name, status=status, message=message, event=event, payload=payload)
        if state.progress_callback:
            state.progress_callback(
                step=step,
                total_steps=total_steps,
                step_name=step_name,
                status=status,
                message=message,
                event=event,
                **payload,
            )

    def _append_runtime_log(
        self,
        state: RuntimeState,
        *,
        step: int,
        total_steps: int,
        step_name: str,
        status: str,
        message: str,
        event: str,
        payload: Dict[str, Any],
    ) -> None:
        log_path = str(state.runtime_log_file or "").strip()
        if not log_path:
            return
        try:
            os.makedirs(os.path.dirname(log_path), exist_ok=True)
            timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
            prefix = f"[{timestamp}] [{event}] [{status}]"
            if step and total_steps:
                prefix += f" [{step}/{total_steps}]"
            if step_name:
                prefix += f" [{step_name}]"
            line = f"{prefix} {message}".rstrip()
            payload_text = self._log_payload_text(payload)
            if payload_text:
                line = f"{line} | {payload_text}"
            with open(log_path, "a", encoding="utf-8") as handle:
                handle.write(f"{line}\n")
        except Exception as exc:
            logger.warning("写入模板执行日志失败", log_path=log_path, error=str(exc))

    def _log_payload_text(self, payload: Dict[str, Any]) -> str:
        if not payload:
            return ""
        parts: List[str] = []
        for key in (
            "command_status",
            "runtime_label",
            "command_theme",
            "cwd",
            "script_path",
            "primary_command",
            "command_count",
            "returncode",
            "line_count",
            "filename",
            "download_status",
            "downloaded_bytes",
            "total_bytes",
            "url",
            "pid",
            "error",
        ):
            if key not in payload:
                continue
            value = payload.get(key)
            if value in (None, "", []):
                continue
            parts.append(f"{key}={self._format_value_for_log(key, value)}")
        return ", ".join(parts)

    def _format_value_for_log(self, name: str, value: Any, limit: int = 240) -> str:
        raw = str(value if value is not None else "")
        lowered_name = str(name or "").lower()
        if any(keyword in lowered_name for keyword in self.LOG_SENSITIVE_KEYWORDS):
            return "***"
        compact = " | ".join(part.strip() for part in raw.splitlines() if part.strip()) or raw.strip()
        if len(compact) > limit:
            return f"{compact[: limit - 3]}..."
        return compact

    @staticmethod
    def _runtime_label(runtime: str) -> str:
        return {
            "powershell": "PowerShell",
            "pwsh": "pwsh",
            "cmd": "cmd",
            "bash": "bash",
            "python3": "python",
            "python": "python",
            "node": "node",
            "deno": "deno",
        }.get(str(runtime or "").lower(), str(runtime or "shell"))

    @staticmethod
    def _normalize_runtime(runtime: str) -> str:
        normalized = str(runtime or "").strip().lower()
        if normalized in {"powershell", "pwsh", "cmd", "bash", "python3", "python", "node", "deno"}:
            return normalized
        raise RuntimeError(f"不支持的运行时: {runtime}")

    @staticmethod
    def _normalize_command_theme(command_theme: str) -> str:
        normalized = str(command_theme or "").strip().lower()
        if not normalized:
            return ""
        if normalized == "oh-my-push":
            return "oh-my-posh"
        if normalized in {"oh-my-posh", "classical"}:
            return normalized
        raise RuntimeError(f"不支持的命令主题: {command_theme}")

    @staticmethod
    def _default_command_theme() -> str:
        return "oh-my-posh" if shutil.which("oh-my-posh") or shutil.which("oh-my-push") else "classical"

    @staticmethod
    def _script_extension(runtime: str) -> str:
        return {
            "powershell": ".ps1",
            "pwsh": ".ps1",
            "cmd": ".cmd",
            "bash": ".sh",
            "python3": ".py",
            "python": ".py",
            "node": ".js",
            "deno": ".ts",
        }.get(runtime, ".txt")

    def _build_shell_command(self, runtime: str, script_path: str, metadata: Any = None) -> List[str]:
        if runtime == "powershell":
            return ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script_path]
        if runtime == "pwsh":
            return ["pwsh", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script_path]
        if runtime == "cmd":
            return ["cmd.exe", "/c", script_path]
        if runtime == "bash":
            return ["bash", script_path]
        if runtime == "python3":
            return [sys.executable, script_path]
        if runtime == "python":
            return ["python", script_path]
        if runtime == "node":
            return ["node", script_path]
        if runtime == "deno":
            return ["deno", "run", *self._build_deno_permission_args(metadata), script_path]
        raise RuntimeError(f"不支持的运行时: {runtime}")

    def _write_script(self, runtime: str, script_path: str, commands: Sequence[str]) -> None:
        runtime = self._normalize_runtime(runtime)
        if runtime in {"powershell", "pwsh"}:
            Path(script_path).write_text(self._build_powershell_script(commands), encoding="utf-8-sig")
            return
        if runtime == "cmd":
            Path(script_path).write_text(self._build_cmd_script(commands), encoding="utf-8")
            return
        if runtime == "bash":
            Path(script_path).write_text(self._build_bash_script(commands), encoding="utf-8")
            os.chmod(script_path, os.stat(script_path).st_mode | stat.S_IEXEC)
            return
        if runtime in {"python3", "python"}:
            Path(script_path).write_text(self._build_python_script(commands), encoding="utf-8")
            return
        if runtime == "node":
            Path(script_path).write_text(self._build_node_script(commands), encoding="utf-8")
            return
        if runtime == "deno":
            Path(script_path).write_text(self._build_deno_script(commands), encoding="utf-8")
            return
        raise RuntimeError(f"不支持的运行时: {runtime}")

    def _build_powershell_script(self, commands: Sequence[str]) -> str:
        lines = [
            "$ErrorActionPreference = 'Stop'",
            "function __mcsb_emit([string]$prefix, [string]$payload = '') {",
            "    Write-Output ($prefix + $payload)",
            "}",
        ]
        for index, command in enumerate(commands):
            encoded = self._encode_command_marker_payload(command)
            lines.append(f"__mcsb_emit '{self.COMMAND_EVENT_BEGIN}' '{index}|{encoded}'")
            lines.append("$global:LASTEXITCODE = 0")
            lines.append(command)
            lines.append("if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }")
            lines.append(f"__mcsb_emit '{self.COMMAND_EVENT_CWD}' ('{index}|' + (Get-Location).Path)")
            if self._command_triggers_clear(command, "powershell"):
                lines.append(f"__mcsb_emit '{self.COMMAND_EVENT_CLEAR}' '{index}'")
        return "\n".join(lines)

    def _build_cmd_script(self, commands: Sequence[str]) -> str:
        lines = [
            "@echo off",
            "setlocal EnableExtensions",
            "chcp 65001 >nul",
        ]
        for index, command in enumerate(commands):
            encoded = self._encode_command_marker_payload(command)
            lines.append(f"echo {self.COMMAND_EVENT_BEGIN}{index}^|{encoded}")
            lines.append(command)
            lines.append("if errorlevel 1 exit /b %errorlevel%")
            lines.append(f"echo {self.COMMAND_EVENT_CWD}{index}^|%cd%")
            if self._command_triggers_clear(command, "cmd"):
                lines.append(f"echo {self.COMMAND_EVENT_CLEAR}{index}")
        lines.append("endlocal")
        return "\r\n".join(lines)

    def _build_bash_script(self, commands: Sequence[str]) -> str:
        lines = [
            "#!/usr/bin/env bash",
            "set -e",
        ]
        for index, command in enumerate(commands):
            encoded = self._encode_command_marker_payload(command)
            lines.append(f"printf '%s\\n' '{self.COMMAND_EVENT_BEGIN}{index}|{encoded}'")
            lines.append(command)
            lines.append(f"printf '%s\\n' \"{self.COMMAND_EVENT_CWD}{index}|$PWD\"")
            if self._command_triggers_clear(command, "bash"):
                lines.append(f"printf '%s\\n' '{self.COMMAND_EVENT_CLEAR}{index}'")
        return "\n".join(lines)

    def _build_python_script(self, commands: Sequence[str]) -> str:
        items = [
            {
                "code": command,
                "encoded": self._encode_command_marker_payload(command),
                "clear": self._command_triggers_clear(command, "python"),
            }
            for command in commands
        ]
        return "\n".join(
            [
                "import os",
                "import sys",
                f"COMMANDS = {json.dumps(items, ensure_ascii=False)}",
                "namespace = {'__name__': '__main__', '__file__': __file__, 'os': os, 'sys': sys}",
                "for index, item in enumerate(COMMANDS):",
                f"    print('{self.COMMAND_EVENT_BEGIN}' + str(index) + '|' + item['encoded'])",
                "    exec(compile(item['code'], f'<mcsb-command-{index + 1}>', 'exec'), namespace, namespace)",
                f"    print('{self.COMMAND_EVENT_CWD}' + str(index) + '|' + os.getcwd())",
                "    if item.get('clear'):",
                f"        print('{self.COMMAND_EVENT_CLEAR}' + str(index))",
            ]
        )

    def _build_node_script(self, commands: Sequence[str]) -> str:
        items = [
            {
                "code": command,
                "encoded": self._encode_command_marker_payload(command),
                "clear": self._command_triggers_clear(command, "node"),
            }
            for command in commands
        ]
        payload = json.dumps(items, ensure_ascii=False)
        return "\n".join(
            [
                f"const COMMANDS = {payload};",
                "const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;",
                "(async () => {",
                "  for (let index = 0; index < COMMANDS.length; index += 1) {",
                "    const item = COMMANDS[index];",
                f"    console.log('{self.COMMAND_EVENT_BEGIN}' + `${{index}}|${{item.encoded}}`);",
                "    const fn = new AsyncFunction('require', 'process', 'console', '__dirname', '__filename', item.code);",
                "    await fn(require, process, console, __dirname, __filename);",
                f"    console.log('{self.COMMAND_EVENT_CWD}' + `${{index}}|${{process.cwd()}}`);",
                "    if (item.clear) {",
                f"      console.log('{self.COMMAND_EVENT_CLEAR}' + String(index));",
                "    }",
                "  }",
                "})().catch((error) => {",
                "  console.error(error && error.stack ? error.stack : String(error));",
                "  process.exit(1);",
                "});",
            ]
        )

    def _build_deno_script(self, commands: Sequence[str]) -> str:
        lines = [
            "const __mcsbEmit = (prefix: string, payload = \"\"): void => {",
            "  console.log(prefix + payload);",
            "};",
        ]
        for index, command in enumerate(commands):
            encoded = self._encode_command_marker_payload(command)
            lines.append(f"__mcsbEmit({json.dumps(self.COMMAND_EVENT_BEGIN)}, {json.dumps(f'{index}|{encoded}')});")
            lines.append(command)
            lines.append(f"__mcsbEmit({json.dumps(self.COMMAND_EVENT_CWD)}, {json.dumps(f'{index}|')} + Deno.cwd());")
            if self._command_triggers_clear(command, "deno"):
                lines.append(f"__mcsbEmit({json.dumps(self.COMMAND_EVENT_CLEAR)}, {json.dumps(str(index))});")
        return "\n".join(lines)

    def _build_deno_permission_args(self, metadata: Any = None) -> List[str]:
        args: List[str] = []
        if metadata is None:
            return args

        if bool(getattr(metadata, "deno_all", False)):
            args.append("--allow-all")
            return args

        custom_args: List[str] = []
        if bool(getattr(metadata, "deno_custom_permissions", False)):
            custom_args = [
                str(item).strip()
                for item in getattr(metadata, "deno_permission_list", []) or []
                if str(item).strip()
            ]
            if any(item in {"-A", "--allow-all"} for item in custom_args):
                return self._deduplicate_strings(custom_args)

        args.extend(custom_args)
        for field_name, flag in self.DENO_PERMISSION_FLAGS:
            if bool(getattr(metadata, field_name, False)) and not self._deno_permission_list_has_flag(custom_args, flag):
                args.append(flag)
        return self._deduplicate_strings(args)

    @staticmethod
    def _deno_permission_list_has_flag(permission_args: Sequence[str], flag: str) -> bool:
        return any(item == flag or item.startswith(f"{flag}=") for item in permission_args)

    @staticmethod
    def _encode_command_marker_payload(value: str) -> str:
        return base64.urlsafe_b64encode(str(value or "").encode("utf-8")).decode("ascii")

    @staticmethod
    def _decode_command_marker_payload(value: str) -> str:
        try:
            return base64.urlsafe_b64decode(str(value or "").encode("ascii")).decode("utf-8")
        except Exception:
            return str(value or "")

    def _parse_command_marker(self, line: str) -> Optional[Dict[str, Any]]:
        if line.startswith(self.COMMAND_EVENT_BEGIN):
            index_text, _, payload = line[len(self.COMMAND_EVENT_BEGIN):].partition("|")
            if index_text.isdigit():
                return {
                    "type": "begin",
                    "command_index": int(index_text),
                    "command": self._decode_command_marker_payload(payload),
                }
        if line.startswith(self.COMMAND_EVENT_CWD):
            index_text, _, payload = line[len(self.COMMAND_EVENT_CWD):].partition("|")
            if index_text.isdigit():
                return {
                    "type": "cwd",
                    "command_index": int(index_text),
                    "cwd": payload,
                }
        if line.startswith(self.COMMAND_EVENT_CLEAR):
            index_text = line[len(self.COMMAND_EVENT_CLEAR):].strip()
            if index_text.isdigit():
                return {"type": "clear", "command_index": int(index_text)}
        return None

    @staticmethod
    def _command_triggers_clear(command: str, runtime: str) -> bool:
        text = str(command or "").strip().lower()
        if not text:
            return False
        if runtime == "cmd":
            return bool(re.search(r"(^|[&|])\s*cls(?:\s|$)", text))
        if runtime in {"powershell", "pwsh", "bash"}:
            return bool(re.search(r"(^|[;&|])\s*(?:cls|clear)(?:\s|$)", text))
        if runtime in {"python", "python3"}:
            return "os.system" in text and ("'cls'" in text or '"cls"' in text or "'clear'" in text or '"clear"' in text)
        if runtime in {"node", "deno"}:
            return "console.clear(" in text
        return False

    @staticmethod
    def _normalize_extension(path: str) -> str:
        lower_name = path.lower()
        for extension in (".tar.gz", ".tar.xz", ".tgz", ".zip", ".tar", ".gz", ".xz", ".msi", ".exe", ".ps1", ".bat", ".cmd", ".sh", ".py", ".mjs", ".cjs", ".jsx", ".js", ".tsx", ".ts"):
            if lower_name.endswith(extension):
                return extension
        return Path(path).suffix.lower()

    @staticmethod
    def _looks_like_git_repo(url: str) -> bool:
        lowered = str(url or "").lower()
        return lowered.endswith(".git") or "github.com/" in lowered

    @staticmethod
    def _parse_github_repo(repo_url: str) -> tuple[str, str]:
        match = re.search(r"github\.com[:/](?P<owner>[^/]+)/(?P<repo>[^/.]+)", repo_url)
        if not match:
            return "", ""
        return match.group("owner"), match.group("repo")

    @staticmethod
    def _parse_structured_file(file_path: str) -> Any:
        lower_name = file_path.lower()
        if lower_name.endswith(".json"):
            return json.loads(DeploymentModRuntime._read_local_text_file(file_path))
        if lower_name.endswith(".toml"):
            return toml.loads(DeploymentModRuntime._read_local_text_file(file_path))
        if lower_name.endswith(".xml"):
            root = ElementTree.fromstring(DeploymentModRuntime._read_local_text_file(file_path))
            return DeploymentModRuntime._xml_to_tree(root)
        return [line.rstrip("\n") for line in DeploymentModRuntime._read_local_text_file(file_path).splitlines()]

    @staticmethod
    def _xml_to_tree(node: ElementTree.Element) -> Dict[str, Any]:
        children = list(node)
        if not children:
            return {node.tag: (node.text or "").strip()}
        grouped: Dict[str, List[Any]] = {}
        for child in children:
            grouped.setdefault(child.tag, []).append(DeploymentModRuntime._xml_to_tree(child)[child.tag])
        result: Dict[str, Any] = {}
        for key, items in grouped.items():
            result[key] = items[0] if len(items) == 1 else items
        return {node.tag: result}

    @staticmethod
    def _extract_scalar_strings(data: Any) -> List[str]:
        values: List[str] = []

        def walk(node: Any) -> None:
            if isinstance(node, dict):
                for item in node.values():
                    walk(item)
                return
            if isinstance(node, list):
                for item in node:
                    walk(item)
                return
            if isinstance(node, (str, int, float)) and str(node).strip():
                values.append(str(node).strip())

        walk(data)
        return values

    def _read_text_source(self, source: str) -> str:
        if source.startswith("file:///"):
            return self._read_local_text_file(source[8:])
        if re.match(r"^https?://", source, re.I):
            response = requests.get(source, timeout=30, **self._get_request_kwargs())
            response.raise_for_status()
            return response.text
        return self._read_local_text_file(source)

    @staticmethod
    def _read_local_text_file(file_path: str) -> str:
        encodings = ("utf-8-sig", "utf-8", "utf-16", "gb18030", "gbk")
        last_error: Exception | None = None
        for encoding in encodings:
            try:
                with open(file_path, "r", encoding=encoding) as handle:
                    return handle.read()
            except UnicodeDecodeError as exc:
                last_error = exc
                continue
        if last_error is not None:
            raise last_error
        with open(file_path, "r", encoding="utf-8") as handle:
            return handle.read()

    @staticmethod
    def _normalize_provider_source_path(source: str, template_root: str) -> str:
        value = str(source or "").strip()
        if not value:
            return ""
        if re.match(r"^(?:https?://|file:///)", value, re.I):
            return value
        expanded = os.path.expandvars(os.path.expanduser(value))
        if os.path.isabs(expanded):
            return expanded
        if template_root:
            return os.path.abspath(os.path.join(template_root, expanded))
        return os.path.abspath(expanded)

    @staticmethod
    def _sanitize_filename(value: str) -> str:
        return re.sub(r"[^0-9A-Za-z\u4e00-\u9fff._-]+", "_", value)[:80]

    @staticmethod
    def _profile_to_bot_type(profile: str) -> str:
        return {
            "maibot": "MaiBot",
            "mofox-core": "MoFox-Core",
            "neo-mofox": "Neo-MoFox",
            "custom": "Custom",
        }.get(profile, "Custom")

    @staticmethod
    def _bot_path_key(bot_type: str) -> str:
        if bot_type == "MoFox-Core":
            return "mofox_path"
        if bot_type == "Neo-MoFox":
            return "neo_mofox_path"
        return "mai_path"

    @staticmethod
    def _deduplicate_strings(values: Sequence[str]) -> List[str]:
        result: List[str] = []
        seen = set()
        for value in values:
            normalized = str(value or "").strip()
            if not normalized or normalized in seen:
                continue
            seen.add(normalized)
            result.append(normalized)
        return result

    def _remove_runtime_persistence_files(self, state: RuntimeState) -> None:
        for file_path, label in (
            (state.runtime_env_file, "运行时环境文件"),
            (state.runtime_state_file, "运行时状态文件"),
        ):
            normalized = str(file_path or "").strip()
            if not normalized:
                continue
            if os.path.isfile(normalized):
                os.remove(normalized)
                state.removed_paths.append(normalized)
                self._notify(state, 1, 1, label, "completed", normalized)

    def _remove_instance_config(self, serial_number: str) -> str:
        config_name, _ = self.find_instance_config(serial_number)
        if not config_manager.delete_configuration(config_name):
            raise RuntimeError(f"删除实例配置失败: {config_name}")

        current_config = str(config_manager.get("current_config", "") or "")
        if current_config == config_name:
            configurations = config_manager.get_all_configurations()
            if "default" in configurations:
                config_manager.set("current_config", "default")
            elif configurations:
                config_manager.set("current_config", next(iter(configurations.keys())))
            else:
                config_manager.set("current_config", "default")
        config_manager.save()
        return config_name

    def _remove_path(self, state: RuntimeState, target_path: str, label: str) -> bool:
        normalized = os.path.abspath(str(target_path or "").strip())
        if not normalized:
            return False
        if not os.path.exists(normalized):
            self._notify(state, 1, 1, label, "skipped", f"路径不存在: {normalized}")
            return False
        if not self._is_safe_removal_target(normalized):
            raise RuntimeError(f"拒绝删除高风险路径: {normalized}")

        if os.path.isdir(normalized):
            self._safe_rmtree(normalized)
        else:
            os.remove(normalized)
        self._notify(state, 1, 1, label, "completed", normalized)
        return True

    @staticmethod
    def _is_safe_removal_target(target_path: str) -> bool:
        normalized = os.path.abspath(target_path)
        anchor = os.path.abspath(Path(normalized).anchor)
        protected_roots = {
            os.path.normcase(anchor),
            os.path.normcase(os.path.abspath(os.getcwd())),
            os.path.normcase(os.path.abspath(str(Path.home()))),
        }
        if os.path.normcase(normalized) in protected_roots:
            return False
        if normalized == anchor:
            return False
        return True

    @staticmethod
    def _safe_rmtree(target_path: str) -> None:
        if not target_path or not os.path.exists(target_path):
            return
        shutil.rmtree(target_path, onerror=DeploymentModRuntime._on_rm_error)

    @staticmethod
    def _on_rm_error(func, path, exc_info) -> None:
        try:
            os.chmod(path, stat.S_IRWXU | stat.S_IRWXG | stat.S_IRWXO)
        except Exception:
            pass
        func(path)
