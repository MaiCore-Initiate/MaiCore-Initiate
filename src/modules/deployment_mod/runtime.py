from __future__ import annotations

import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tarfile
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
from ...ui.interface import ui
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

logger = structlog.get_logger(__name__)
urllib3.disable_warnings(InsecureRequestWarning)

PLACEHOLDER_PATTERN = re.compile(r"\{\{(key|env|install_path|deploy_path|version|file_path|file_key)\|([^{}]+)}}")


@dataclass
class RuntimeScope:
    env_values: Dict[str, str] = field(default_factory=dict)


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


class DeploymentModRuntime:
    """真正执行部署模板的运行时引擎。"""

    RUNTIME_ENV_FILENAME = ".mcstart-template.env"
    RUNTIME_STATE_FILENAME = ".mcstart-template-state.toml"

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

    FILELINK_FIELD_ALIASES = (
        "file_link",
        "version_file_link",
        "get_version_file_link",
        "get_link_file_link",
        "get_link_file",
        "link_file",
    )
    SCRIPT_FIELD_ALIASES = (
        "custom_script",
        "version_script",
        "get_version_script",
        "get_link_script",
        "get_version_custom",
        "get_link_custom",
        "script_path",
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
        )

    def execute(
        self,
        template: TemplateDefinition,
        plan: DeploymentPlan,
        progress_callback: Optional[Callable] = None,
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
        )

        try:
            self._notify(state, 1, 6, "准备模板运行时", "running", f"模板: {template.metadata.mod_name}")
            self._prepare_file_imports(state)

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
    ) -> RuntimeResult:
        normalized_stage = self._normalize_stage(stage)
        if normalized_stage == "full":
            return self.execute(template, plan, progress_callback=progress_callback)

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
        )

        try:
            self._prepare_file_imports(state)
            if normalized_stage in {"components", "deployments"}:
                self._notify(state, 1, 1, f"执行 {normalized_stage} 阶段", "running", f"模板: {template.metadata.mod_name}")
            else:
                self._restore_runtime_state_for_instance(state, state.instance_serial_number)
                self._notify(state, 1, 1, f"执行 {normalized_stage} 阶段", "running", f"实例序列号: {state.instance_serial_number}")

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

    def _execute_components(self, state: RuntimeState) -> None:
        ordered_components = self._ordered_items(
            state.template.components_section.list,
            state.template.components,
        )
        bindings = {item.component_id: item for item in state.plan.component_bindings}
        for component in ordered_components:
            binding = bindings.get(component.id)
            enabled = binding.enabled if binding else component.install
            if not enabled:
                self._notify(state, 2, 6, f"跳过组件 {component.name}", "skipped", "用户未选择安装该组件")
                continue
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

        # 组件不存在 → 按模板提供的方式自动安装
        # choose=false：强制安装，无需用户确认；choose=true：用户已在 CLI 阶段选择安装
        # （如果用户选择跳过，plan 阶段就会跳过此组件，不会到达这里）

        # Step 3: 执行安装前命令
        if component.before_command:
            self._run_command_list(state, component.before_command_list, install_path, scope, f"组件 {component.name} 安装前命令")

        # Step 4: 执行安装
        if component.command_install:
            self._resolve_version_and_link(state, "component", component.id, component, scope)
            self._run_command_list(state, component.install_command_list, install_path, scope, f"组件 {component.name} 安装命令")
        else:
            download_url = self._resolve_version_and_link(state, "component", component.id, component, scope)
            if not download_url:
                raise RuntimeError(f"组件 {component.name} 未能解析出下载链接")
            asset_path = self._download_asset(state, component.id, download_url, install_path, "component")
            self._install_component_asset(component, asset_path, install_path)

        # Step 5: 执行安装后命令
        if component.after_command:
            self._run_command_list(state, component.after_command_list, install_path, scope, f"组件 {component.name} 安装后命令")

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
        output = self._run_command_list(
            state,
            component.check_command,
            check_cwd,
            scope,
            f"组件 {component.name} 检查命令",
            raise_on_error=False,
        )

        if not output:
            self._notify(state, 2, 6, f"组件 {component.name}", "running", "检查命令无输出，假设组件未安装")
            return {"installed": False, "output": "", "detected_version": ""}

        lowered_output = output.lower()
        detected_version = ""
        for token in component.check_version_contains:
            if str(token).lower() in lowered_output:
                import re as re_module
                version_match = re_module.search(r"(\d+\.\d+(?:\.\d+)?)", output)
                detected_version = version_match.group(1) if version_match else str(token)
                break

        is_installed = all(str(token).lower() in lowered_output for token in component.check_version_contains)

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

        return {"installed": is_installed, "output": output.strip(), "detected_version": detected_version}

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
        component: ComponentDefinition,
        asset_path: str,
        install_path: str,
    ) -> None:
        extension = self._normalize_extension(asset_path)
        operate_mode = component.install_operate or "auto"
        if operate_mode == "custom":
            matched = next((item for item in component.install_custom_list if item.extension.lower() == extension), None)
            if matched and matched.operate:
                self._operate_asset(asset_path, install_path, is_deployment=False)
            return
        if operate_mode == "no":
            return
        self._operate_asset(asset_path, install_path, is_deployment=False)

    def _execute_deployments(self, state: RuntimeState) -> None:
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

        if deployment.before_command:
            self._run_command_list(state, deployment.before_command_list, deploy_path, scope, f"部署 {deployment.name} 前置命令")

        resolved_link = self._resolve_version_and_link(state, "deployment", deployment.id, deployment, scope)

        if deployment.command_deploy:
            self._run_command_list(state, deployment.deploy_command_list, deploy_path, scope, f"部署 {deployment.name} 自定义命令")
            if os.path.isdir(final_root):
                state.deployment_roots[deployment.id] = final_root
            elif os.path.isdir(deploy_path):
                state.deployment_roots[deployment.id] = deploy_path
        else:
            self._perform_deployment(state, deployment, deploy_path, final_root, resolved_link)

        if deployment.after_command:
            self._run_command_list(state, deployment.after_command_list, deploy_path, scope, f"部署 {deployment.name} 后置命令")

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

        if method in {"auto", "gitclone", "!gitclone"} and self._looks_like_git_repo(link):
            allow_fallback = method != "!gitclone"
            clone_result = self._git_clone(link, final_root, state.version_meta.get(deployment.id, {}).get("name"))
            if clone_result:
                state.deployment_roots[deployment.id] = final_root
                return
            if not allow_fallback:
                raise RuntimeError(f"部署项 {deployment.name} Git 克隆失败且模板禁止回退")
            fallback_url = self._build_github_archive_url(link, state.version_meta.get(deployment.id, {}))
            asset_path = self._download_asset(state, deployment.id, fallback_url, deploy_path, "deployment")
            self._extract_or_copy_deployment_asset(asset_path, final_root)
            state.deployment_roots[deployment.id] = final_root
            return

        asset_path = self._download_asset(state, deployment.id, link, deploy_path, "deployment")
        if method == "getfile" or method == "auto":
            self._extract_or_copy_deployment_asset(asset_path, final_root)
            state.deployment_roots[deployment.id] = final_root if os.path.isdir(final_root) else deploy_path
            return

        raise RuntimeError(f"不支持的 deploy_method: {method}")

    def _extract_or_copy_deployment_asset(self, asset_path: str, final_root: str) -> None:
        if os.path.isdir(final_root):
            self._safe_rmtree(final_root)
        os.makedirs(final_root, exist_ok=True)
        extension = self._normalize_extension(asset_path)
        if extension in {".zip", ".tar", ".gz", ".tgz", ".xz", ".tar.gz", ".tar.xz"}:
            extracted_root = self._extract_archive(asset_path, final_root)
            if extracted_root and extracted_root != final_root:
                self._flatten_single_root(extracted_root, final_root)
            return
        if extension in {".exe", ".msi", ".ps1", ".bat", ".cmd", ".sh", ".py"}:
            self._operate_asset(asset_path, final_root, is_deployment=True)
            return
        shutil.copy2(asset_path, os.path.join(final_root, os.path.basename(asset_path)))

    def _execute_launches(self, state: RuntimeState) -> None:
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
            scope = self._build_scope(state, state.template.launches_section.env_input, launch.env_input, launch.env_input_list)
            cwd = self._guess_launch_workdir(state, launch)
            self._run_command_list(
                state,
                launch.launch_command,
                cwd,
                scope,
                f"启动 {launch.name}",
                detached=True,
            )
            state.launched_items.append(launch.id)
            self._export_env_bindings(state, state.template.launches_section.env_output, launch.env_output, launch.env_output_list, scope)

    def _execute_configs(self, state: RuntimeState) -> None:
        ordered_configs = self._ordered_items(state.template.configs_section.list, state.template.configs)
        files_to_open: List[str] = []
        for config in ordered_configs:
            enabled = bool(state.plan.template_inputs.get(f"config::{config.id or config.name}", True if config.choose else True))
            if not enabled:
                self._notify(state, 5, 6, f"跳过配置 {config.name}", "skipped", "用户未选择打开该配置文件")
                continue
            scope = self._build_scope(state, state.template.configs_section.env_input, config.env_input, config.env_input_list)
            file_path = self._resolve_text(state, config.file_path, scope)
            if not file_path:
                raise RuntimeError(f"配置项 {config.name} 未能解析出文件路径")
            files_to_open.append(file_path)
            state.opened_files.append(file_path)
            self._export_env_bindings(state, state.template.configs_section.env_output, config.env_output, config.env_output_list, scope)

        if files_to_open:
            open_files_in_editor(files_to_open)

    def _execute_uninstalls(self, state: RuntimeState) -> None:
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
            self._run_command_list(state, uninstall.stop_command_list, workdir, scope, f"卸载 {uninstall.name} 停止命令")

        if uninstall.before_command:
            self._run_command_list(state, uninstall.before_command_list, workdir, scope, f"卸载 {uninstall.name} 前置命令")

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
            self._run_command_list(state, uninstall.after_command_list, after_workdir, scope, f"卸载 {uninstall.name} 后置命令")

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

    def _prepare_file_imports(self, state: RuntimeState) -> None:
        if not state.template.metadata.file_import:
            return
        for filename in state.template.metadata.file_import_list:
            file_path = os.path.join(state.template.metadata.template_root, filename)
            if not os.path.isfile(file_path):
                raise RuntimeError(f"模板导入文件不存在: {filename}")
            state.file_paths[filename] = os.path.abspath(file_path)
            state.file_trees[filename] = self._parse_structured_file(file_path)
            self._notify(state, 1, 6, "准备模板运行时", "running", f"已导入文件: {filename}")

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
        if path_value == "$CustomPath":
            custom_value = str(custom_path or "").strip()
            if custom_value == "$input$":
                user_value = str(state.plan.template_inputs.get(f"path::{stage_name}::{item_id}", "") or "").strip()
                if not user_value:
                    raise RuntimeError(f"{item_id} 需要用户输入路径")
                return os.path.abspath(os.path.expandvars(user_value))
            return os.path.abspath(os.path.expandvars(self._resolve_text(state, custom_value, scope)))

        if path_value in self.SPECIAL_PATHS:
            return os.path.abspath(self.SPECIAL_PATHS[path_value]())

        if not path_value:
            return os.path.abspath(os.path.join(state.runtime_root, stage_name, item_id))

        resolved = self._resolve_text(state, path_value, scope)
        return os.path.abspath(os.path.expandvars(resolved))

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
            scope.env_values[binding.name] = self._resolve_text(state, binding.value, scope)
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
            state.env_pool[binding.name] = self._resolve_text(state, binding.value, scope)
            self._notify(state, 0, 0, "环境变量导出", "running", f"{binding.name}={state.env_pool[binding.name]}")

    def _resolve_version_and_link(
        self,
        state: RuntimeState,
        stage_name: str,
        item_id: str,
        definition: Any,
        scope: RuntimeScope,
    ) -> str:
        if getattr(definition, "get_method", "") == "direct":
            return self._resolve_text(state, getattr(definition, "direct_link", ""), scope)

        if getattr(definition, "get_method", "") == "get_link":
            link = self._resolve_link_only(state, stage_name, item_id, definition, scope)
            if link:
                return link
            raise RuntimeError(f"{item_id} 未能获取下载链接")

        if getattr(definition, "get_method", "") == "get_version":
            selected = self._select_version(state, stage_name, item_id, definition, scope)
            state.versions[item_id] = selected.get("name", "")
            state.version_meta[item_id] = selected
            if getattr(definition, "splicing_link", ""):
                return self._resolve_text(state, getattr(definition, "splicing_link", ""), scope)
            return self._resolve_text(state, getattr(definition, "base_link", "") or getattr(definition, "direct_link", ""), scope)

        if getattr(definition, "base_link", ""):
            return self._resolve_text(state, getattr(definition, "base_link", ""), scope)
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
            return provided

        get_link = str(getattr(definition, "get_link", "") or "").strip().lower()
        provided_list = [self._resolve_text(state, item, scope) for item in getattr(definition, "get_link_provide_list", []) if str(item).strip()]
        if provided_list:
            return provided_list[0]

        if get_link == "user_input":
            raise RuntimeError(f"{item_id} 需要用户输入下载链接")
        if get_link == "filelink":
            candidates = self._extract_candidates_from_source(state, definition, scope)
            if candidates:
                return candidates[0]
        if get_link == "custom":
            candidates = self._execute_custom_provider(state, definition, scope)
            if candidates:
                return candidates[0]
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
            scope = RuntimeScope()
            source = self._resolve_provider_source_static(definition, scope, self.FILELINK_FIELD_ALIASES)
            if source:
                content = self._read_text_source(source)
                if source.lower().endswith(".json"):
                    return [{"name": item, "raw_name": item, "type": "file"} for item in self._extract_scalar_strings(json.loads(content))]
                if source.lower().endswith(".toml"):
                    return [{"name": item, "raw_name": item, "type": "file"} for item in self._extract_scalar_strings(toml.loads(content))]
                if source.lower().endswith(".xml"):
                    root = ElementTree.fromstring(content)
                    return [{"name": item, "raw_name": item, "type": "file"} for item in self._extract_scalar_strings(self._xml_to_tree(root))]
                return [{"name": item.strip(), "raw_name": item.strip(), "type": "file"} for item in content.splitlines() if item.strip()]
        elif version_source == "custom":
            scope = RuntimeScope()
            source = self._resolve_provider_source_static(definition, scope, self.SCRIPT_FIELD_ALIASES)
            if source:
                output = self._run_external_script(source, os.path.dirname(source) or os.getcwd())
                return [{"name": item.strip(), "raw_name": item.strip(), "type": "custom"} for item in output.splitlines() if item.strip()]
        return []

    def _resolve_text_for_static(self, text: str, raw_template: Dict[str, Any]) -> str:
        """静态版本的文本解析，不依赖运行时 state。"""
        if not text:
            return ""

        def repl(match: re.Match[str]) -> str:
            kind = match.group(1)
            key = match.group(2).strip()
            if kind == "key":
                return self._resolve_template_key(raw_template, key)
            return ""

        for _ in range(5):
            changed = False
            new_text = PLACEHOLDER_PATTERN.sub(repl, text)
            if new_text == text:
                break
            text = new_text
        return text

    def _resolve_provider_source_static(self, definition: Any, scope: RuntimeScope, aliases: Iterable[str]) -> str:
        """静态版本的 provider source 解析。"""
        raw = getattr(definition, "raw", {}) or {}
        for alias in aliases:
            value = str(raw.get(alias, "") or "").strip()
            if value:
                return value
        return ""

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
            return {"name": self._format_version_if_needed(definition, manual_version), "raw_name": manual_version, "type": "manual"}

        version_source = str(getattr(definition, "get_version", "") or "").strip().lower()
        candidates: List[Dict[str, Any]] = []
        if version_source == "github_repo":
            repo_url = self._resolve_text(state, getattr(definition, "github_repo", ""), scope)
            candidates = self._fetch_github_candidates(repo_url)
        elif version_source == "filelink":
            candidates = [{"name": item, "raw_name": item, "type": "file"} for item in self._extract_candidates_from_source(state, definition, scope)]
        elif version_source == "custom":
            candidates = [{"name": item, "raw_name": item, "type": "custom"} for item in self._execute_custom_provider(state, definition, scope)]

        filtered = self._filter_candidates(definition, candidates)
        selected = filtered[0] if filtered else (candidates[0] if candidates else None)
        if not selected:
            raise RuntimeError(f"{item_id} 未能获取可用版本")
        selected = dict(selected)
        selected["raw_name"] = selected.get("raw_name", selected.get("name", ""))
        selected["name"] = self._format_version_if_needed(definition, selected.get("name", ""))
        return selected

    def _filter_candidates(self, definition: Any, candidates: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
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

    def _format_version_if_needed(self, definition: Any, version: str) -> str:
        value = str(version or "")
        if not getattr(definition, "format_version", False):
            return value
        for rule in getattr(definition, "version_formatting_formula", []) or []:
            value = re.sub(rule.match, rule.replace, value)
        return value

    def _fetch_github_candidates(self, repo_url: str) -> List[Dict[str, Any]]:
        owner, repo = self._parse_github_repo(repo_url)
        if not owner or not repo:
            raise RuntimeError(f"无效的 GitHub 仓库地址: {repo_url}")

        headers = {"Accept": "application/vnd.github+json", "User-Agent": "MaiCore-Start"}
        candidates: List[Dict[str, Any]] = []
        for endpoint, item_key, item_type in (
            ("releases", "tag_name", "release"),
            ("tags", "name", "tag"),
            ("branches", "name", "branch"),
        ):
            response = requests.get(
                f"https://api.github.com/repos/{owner}/{repo}/{endpoint}",
                headers=headers,
                timeout=20,
                **self._get_request_kwargs(),
            )
            if not response.ok:
                continue
            for item in response.json()[:30]:
                name = str(item.get(item_key, "") or "").strip()
                if name:
                    candidates.append({"name": name, "raw_name": name, "type": item_type})

        unique: List[Dict[str, Any]] = []
        seen = set()
        for candidate in candidates:
            key = (candidate["name"].lower(), candidate["type"])
            if key in seen:
                continue
            seen.add(key)
            unique.append(candidate)
        return unique

    def _extract_candidates_from_source(self, state: RuntimeState, definition: Any, scope: RuntimeScope) -> List[str]:
        source = self._resolve_provider_source(state, definition, scope, self.FILELINK_FIELD_ALIASES)
        if not source:
            return []
        content = self._read_text_source(source)
        if source.lower().endswith(".json"):
            return self._extract_scalar_strings(json.loads(content))
        if source.lower().endswith(".toml"):
            return self._extract_scalar_strings(toml.loads(content))
        if source.lower().endswith(".xml"):
            root = ElementTree.fromstring(content)
            return self._extract_scalar_strings(self._xml_to_tree(root))
        return [line.strip() for line in content.splitlines() if line.strip()]

    def _execute_custom_provider(self, state: RuntimeState, definition: Any, scope: RuntimeScope) -> List[str]:
        source = self._resolve_provider_source(state, definition, scope, self.SCRIPT_FIELD_ALIASES)
        if not source:
            return []
        output = self._run_external_script(source, os.path.dirname(source) or os.getcwd())
        return [line.strip() for line in output.splitlines() if line.strip()]

    def _resolve_provider_source(self, state: RuntimeState, definition: Any, scope: RuntimeScope, aliases: Iterable[str]) -> str:
        raw = getattr(definition, "raw", {}) or {}
        for alias in aliases:
            value = str(raw.get(alias, "") or "").strip()
            if value:
                return self._resolve_text(state, value, scope)
        return ""

    def _run_external_script(self, script_path: str, cwd: str) -> str:
        lower_name = script_path.lower()
        if lower_name.endswith(".ps1"):
            cmd = ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script_path]
        elif lower_name.endswith((".bat", ".cmd")):
            cmd = ["cmd.exe", "/c", script_path]
        elif lower_name.endswith(".py"):
            cmd = [sys.executable, script_path]
        elif lower_name.endswith(".sh"):
            cmd = ["bash", script_path]
        elif lower_name.endswith(".js"):
            cmd = ["node", script_path]
        else:
            cmd = [script_path]

        result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120)
        output = f"{result.stdout}\n{result.stderr}".strip()
        if result.returncode != 0:
            raise RuntimeError(f"自定义脚本执行失败: {output or result.returncode}")
        return output

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
        for filename in sorted(state.file_trees.keys(), key=len, reverse=True):
            if path == filename:
                return self._stringify_value(state.file_trees[filename], path)
            prefix = f"{filename}."
            if path.startswith(prefix):
                return self._resolve_tree_value(state.file_trees[filename], path[len(prefix):].split("."), path)
        raise RuntimeError(f"文件键路径不存在: {path}")

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
    ) -> str:
        if not commands:
            return ""
        runtime = state.template.metadata.runtime
        script_dir = os.path.join(state.runtime_root, "scripts")
        os.makedirs(script_dir, exist_ok=True)
        timestamp = int(time.time() * 1000)
        script_path = os.path.join(script_dir, f"{timestamp}_{self._sanitize_filename(label)}{self._script_extension(runtime)}")
        resolved_commands = [self._resolve_text(state, command, scope) for command in commands]
        self._write_script(runtime, script_path, resolved_commands)
        cmd = self._build_shell_command(runtime, script_path)
        env = os.environ.copy()
        env.update(state.env_pool)
        env.update(scope.env_values)

        # 记录详细日志
        logger.info(
            "执行命令脚本",
            label=label,
            script_path=script_path,
            cwd=cwd,
            runtime=runtime,
            command_count=len(resolved_commands),
            commands=resolved_commands,
        )
        self._notify(state, 0, 0, label, "running", f"执行脚本: {script_path}")
        self._notify(state, 0, 0, label, "running", f"工作目录: {cwd}")
        self._notify(state, 0, 0, label, "running", f"命令数量: {len(resolved_commands)}")

        if detached:
            popen_kwargs: Dict[str, Any] = {"cwd": cwd, "env": env, "shell": False}
            if os.name == "nt":
                popen_kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS
            else:
                popen_kwargs["start_new_session"] = True
            subprocess.Popen(cmd, **popen_kwargs)
            self._notify(state, 4, 6, label, "running", f"已托管启动脚本: {script_path}")
            return ""

        # 使用 Popen 进行实时流式输出捕获
        try:
            process = subprocess.Popen(cmd, cwd=cwd, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, shell=False)
        except OSError as exc:
            raise RuntimeError(f"{label} 无法启动进程: {exc}")

        output_lines: List[str] = []
        self._stream_process_output(process, label, output_lines, timeout_seconds=600)

        try:
            returncode = process.wait()
        except Exception:
            process.kill()
            raise RuntimeError(f"{label} 进程等待失败")

        full_output = "\n".join(output_lines).strip()
        if returncode != 0 and raise_on_error:
            raise RuntimeError(f"{label} 执行失败 (返回码 {returncode}):\n{full_output}")
        if full_output:
            self._notify(state, 0, 0, label, "running", f"[输出] {full_output[-1000:]}")
        return full_output

    def _stream_process_output(
        self,
        process: subprocess.Popen,
        label: str,
        output_lines: List[str],
        timeout_seconds: int = 600,
    ) -> None:
        """实时流式读取子进程输出并打印到控制台。"""
        from concurrent.futures import ThreadPoolExecutor
        import threading

        def read_stream(stream) -> List[str]:
            try:
                lines = []
                for raw_line in iter(lambda: stream.read(1), b""):
                    if isinstance(raw_line, bytes):
                        raw_line = raw_line.decode("utf-8", errors="replace")
                    if raw_line:
                        lines.append(raw_line)
                return lines
            except Exception:
                return []

        start_time = time.monotonic()
        done = threading.Event()
        stream_lines: List[str] = []

        def stream_reader():
            try:
                reader_thread = ThreadPoolExecutor(max_workers=1)
                future = reader_thread.submit(read_stream, process.stdout)
                try:
                    stream_lines.extend(future.result(timeout=timeout_seconds))
                finally:
                    reader_thread.shutdown(warning=False)
            finally:
                done.set()

        thread = threading.Thread(target=stream_reader, daemon=True)
        thread.start()

        try:
            while True:
                if done.wait(timeout=0.1):
                    break
                elapsed = time.monotonic() - start_time
                if elapsed > timeout_seconds:
                    process.kill()
                    raise RuntimeError(f"{label} 执行超时（超过 {timeout_seconds // 60} 分钟）")

                if stream_lines:
                    line = stream_lines.pop(0)
                    output_lines.append(line.rstrip())
                    line_display = line.rstrip("\r\n")
                    if line_display:
                        ui.console.print(f"[dim]│[/dim] {line_display}", highlight=False)
        finally:
            thread.join(timeout=5)
            # 处理剩余缓冲
            for line in stream_lines:
                output_lines.append(line.rstrip())
                line_display = line.rstrip("\r\n")
                if line_display:
                    ui.console.print(f"[dim]│[/dim] {line_display}", highlight=False)

    def _download_asset(self, state: RuntimeState, item_id: str, url: str, target_dir: str, stage_name: str) -> str:
        download_dir = os.path.join(target_dir, "__downloads__")
        os.makedirs(download_dir, exist_ok=True)
        parsed = urlparse(url)
        filename = os.path.basename(parsed.path) or f"{item_id}.bin"
        target_path = os.path.join(download_dir, filename)

        step_name = f"{stage_name}:{item_id}"
        self._notify(state, 0, 0, step_name, "running", f"下载资源: {url}")
        try:
            with requests.get(url, stream=True, timeout=(15, 60), **self._get_request_kwargs()) as response:
                response.raise_for_status()
                total_bytes = int(response.headers.get("content-length") or 0)
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

    def _operate_asset(self, asset_path: str, target_dir: str, is_deployment: bool) -> None:
        extension = self._normalize_extension(asset_path)
        if extension in {".zip", ".tar", ".gz", ".tgz", ".xz", ".tar.gz", ".tar.xz"}:
            extracted_root = self._extract_archive(asset_path, target_dir)
            if not is_deployment:
                self._merge_component_archive_payload(target_dir, extracted_root)
            return
        if extension in {".exe", ".msi"}:
            subprocess.run([asset_path], cwd=target_dir, check=True)
            return
        if extension == ".ps1":
            subprocess.run(["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", asset_path], cwd=target_dir, check=True)
            return
        if extension in {".bat", ".cmd"}:
            subprocess.run(["cmd.exe", "/c", asset_path], cwd=target_dir, check=True)
            return
        if extension == ".sh":
            subprocess.run(["bash", asset_path], cwd=target_dir, check=True)
            return
        if extension == ".py":
            subprocess.run([sys.executable, asset_path], cwd=target_dir, check=True)
            return
        if is_deployment:
            shutil.copy2(asset_path, os.path.join(target_dir, os.path.basename(asset_path)))

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

    def _extract_archive(self, archive_path: str, target_dir: str) -> str:
        temp_extract = os.path.join(target_dir, "__extract__")
        if os.path.isdir(temp_extract):
            self._safe_rmtree(temp_extract)
        os.makedirs(temp_extract, exist_ok=True)

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
            return os.path.join(temp_extract, entries[0])
        return temp_extract

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

    def _git_clone(self, repo_url: str, target_dir: str, ref_name: Optional[str]) -> bool:
        if os.path.isdir(target_dir):
            self._safe_rmtree(target_dir)
        cmd = ["git", "clone", "--depth", "1"]
        if ref_name:
            cmd.extend(["-b", ref_name])
        cmd.extend([repo_url, target_dir])
        result = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
        if result.returncode == 0:
            return True
        logger.warning("Git 克隆失败，准备回退", repo=repo_url, target=target_dir, error=result.stderr or result.stdout)
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

    @staticmethod
    def _notify(
        state: RuntimeState,
        step: int,
        total_steps: int,
        step_name: str,
        status: str,
        message: str,
        event: str = "stage",
        data: Optional[Dict[str, Any]] = None,
    ) -> None:
        if state.progress_callback:
            payload = data or {}
            state.progress_callback(
                step=step,
                total_steps=total_steps,
                step_name=step_name,
                status=status,
                message=message,
                event=event,
                **payload,
            )

    @staticmethod
    def _script_extension(runtime: str) -> str:
        return {"powershell": ".ps1", "cmd": ".cmd", "bash": ".sh", "python3": ".py"}.get(runtime, ".txt")

    @staticmethod
    def _build_shell_command(runtime: str, script_path: str) -> List[str]:
        if runtime == "powershell":
            return ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script_path]
        if runtime == "cmd":
            return ["cmd.exe", "/c", script_path]
        if runtime == "bash":
            return ["bash", script_path]
        if runtime == "python3":
            return [sys.executable, script_path]
        raise RuntimeError(f"不支持的运行时: {runtime}")

    @staticmethod
    def _write_script(runtime: str, script_path: str, commands: Sequence[str]) -> None:
        if runtime == "powershell":
            Path(script_path).write_text("\n".join(["$ErrorActionPreference = 'Stop'"] + list(commands)), encoding="utf-8-sig")
            return
        if runtime == "cmd":
            Path(script_path).write_text("\r\n".join(["@echo off", "chcp 65001 >nul"] + list(commands)), encoding="utf-8")
            return
        if runtime == "bash":
            Path(script_path).write_text("\n".join(["#!/usr/bin/env bash", "set -e"] + list(commands)), encoding="utf-8")
            os.chmod(script_path, os.stat(script_path).st_mode | stat.S_IEXEC)
            return
        if runtime == "python3":
            Path(script_path).write_text("\n".join(commands), encoding="utf-8")
            return
        raise RuntimeError(f"不支持的运行时: {runtime}")

    @staticmethod
    def _normalize_extension(path: str) -> str:
        lower_name = path.lower()
        for extension in (".tar.gz", ".tar.xz", ".tgz", ".zip", ".tar", ".gz", ".xz", ".msi", ".exe", ".ps1", ".bat", ".cmd", ".sh", ".py"):
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
            with open(file_path, "r", encoding="utf-8") as handle:
                return json.load(handle)
        if lower_name.endswith(".toml"):
            with open(file_path, "r", encoding="utf-8") as handle:
                return toml.load(handle)
        if lower_name.endswith(".xml"):
            root = ElementTree.parse(file_path).getroot()
            return DeploymentModRuntime._xml_to_tree(root)
        with open(file_path, "r", encoding="utf-8") as handle:
            return [line.rstrip("\n") for line in handle]

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
            with open(source[8:], "r", encoding="utf-8") as handle:
                return handle.read()
        if re.match(r"^https?://", source, re.I):
            response = requests.get(source, timeout=30, **self._get_request_kwargs())
            response.raise_for_status()
            return response.text
        with open(source, "r", encoding="utf-8") as handle:
            return handle.read()

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
