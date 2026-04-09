from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence
from xml.etree import ElementTree

try:
    import tomllib as toml_reader
except ModuleNotFoundError:  # pragma: no cover
    import tomli as toml_reader  # type: ignore[no-redef]

from .parser import DeploymentModParser

PLACEHOLDER_PATTERN = re.compile(r"\{\{([^{}]+)}}")
ARRAY_SECTIONS = {"Component", "Deployment", "LaunchItem", "ConfigItem", "UninstallItem"}
TABLE_SECTIONS = {"MCStart", "MODINFO", "COMPONENTS", "DEPLOY", "LAUNCH", "CONFIG", "UNINSTALL"}
TOP_LEVEL_KEYS = TABLE_SECTIONS | ARRAY_SECTIONS
ALLOWED_PLACEHOLDER_KINDS = {"key", "env", "install_path", "deploy_path", "version", "file_path", "file_key"}

VALID_RUNTIMES = {"powershell", "cmd", "bash", "python3"}
VALID_PLATFORMS = {"windows", "linux", "macos"}
VALID_COMPONENT_GET_METHODS = {"direct", "get_version", "get_link"}
VALID_DEPLOYMENT_GET_METHODS = {"get_version", "get_link"}
VALID_GET_VERSION_SOURCES = {"github_repo", "filelink", "custom"}
VALID_GET_LINK_SOURCES = {"filelink", "custom", "user_input"}
VALID_INSTALL_OPERATIONS = {"auto", "no", "custom"}
VALID_DEPLOY_METHODS = {"auto", "gitclone", "!gitclone", "getfile"}
KNOWN_PATH_VARIABLES = {
    "$Temporary",
    "$ProgramFiles",
    "$ProgramFiles(x86)",
    "$AppData",
    "$LocalAppData",
    "$UserProfile",
    "$UserProfile\\Desktop",
    "$UserProfile\\Documents",
    "$UserProfile\\Downloads",
    "$UserProfile\\Music",
    "$UserProfile\\Pictures",
    "$UserProfile\\Videos",
    "$CustomPath",
}

COMPONENT_ALLOWED_FIELDS = {
    "name",
    "id",
    "choose",
    "install",
    "check",
    "check_command",
    "check_version_contains",
    "check_version_regex",
    "command_install",
    "install_command_list",
    "get_method",
    "direct_link",
    "get_version",
    "github_repo",
    "get_link",
    "get_link_provide_list",
    "user_choose",
    "choose_list",
    "format_version",
    "version_formatting_formula",
    "install_operate",
    "install_custom_list",
    "install_path",
    "custom_path",
    "splicing_link",
    "before_command",
    "before_command_list",
    "after_command",
    "after_command_list",
    "env_output",
    "env_output_list",
    "env_input",
    "env_input_list",
}

DEPLOYMENT_ALLOWED_FIELDS = {
    "name",
    "id",
    "choose",
    "deploy",
    "command_deploy",
    "deploy_command_list",
    "deploy_method",
    "base_link",
    "deploy_path",
    "custom_path",
    "get_method",
    "get_version",
    "github_repo",
    "get_link",
    "get_link_provide_list",
    "user_choose",
    "choose_list",
    "format_version",
    "version_formatting_formula",
    "splicing_link",
    "before_command",
    "before_command_list",
    "after_command",
    "after_command_list",
    "env_output",
    "env_output_list",
    "env_input",
    "env_input_list",
}

LAUNCH_ALLOWED_FIELDS = {
    "id",
    "name",
    "choose",
    "launch",
    "launch_command",
    "env_output",
    "env_output_list",
    "env_input",
    "env_input_list",
}

CONFIG_ALLOWED_FIELDS = {
    "id",
    "name",
    "file_path",
    "choose",
    "env_input",
    "env_input_list",
    "env_output",
    "env_output_list",
}

UNINSTALL_ALLOWED_FIELDS = {
    "id",
    "name",
    "choose",
    "uninstall",
    "stop_before_uninstall",
    "stop_command_list",
    "remove_instance_config",
    "remove_runtime_files",
    "remove_deploy_root",
    "remove_component",
    "deployment_targets",
    "component_targets",
    "before_command",
    "before_command_list",
    "after_command",
    "after_command_list",
    "env_output",
    "env_output_list",
    "env_input",
    "env_input_list",
}

FILELINK_FIELD_ALIASES = ("file_link", "version_file_link", "get_version_file_link", "get_link_file_link")
SCRIPT_FIELD_ALIASES = ("custom_script", "version_script", "get_version_script", "get_link_script", "script_path")
COMPONENT_ID_PATTERN = re.compile(r"^[a-z0-9-]+$")
MOD_ID_PATTERN = re.compile(r"^[A-Za-z0-9_.-]+\.[A-Za-z0-9_.-]+$")
SEMVER_PATTERN = re.compile(r"^v?\d+(?:\.\d+){1,3}(?:[-+][0-9A-Za-z.-]+)?$")
GITHUB_REPO_PATTERN = re.compile(r"^https?://github\.com/[^/]+/[^/]+/?$", re.I)


@dataclass
class CheckLocation:
    file_path: str
    line: int = 0
    column: int = 1
    label: str = ""

    def render(self) -> str:
        base = self.file_path
        if self.line > 0:
            base = f"{base}:{self.line}:{self.column}"
        if self.label:
            return f"{base} ({self.label})"
        return base


@dataclass
class CheckIssue:
    severity: str
    title: str
    detail: str = ""
    location: Optional[CheckLocation] = None


@dataclass
class CheckReport:
    template_path: str
    issues: List[CheckIssue] = field(default_factory=list)

    def add(self, severity: str, title: str, detail: str = "", location: Optional[CheckLocation] = None) -> None:
        self.issues.append(CheckIssue(severity=severity, title=title, detail=detail, location=location))

    def ok(self, title: str, detail: str = "", location: Optional[CheckLocation] = None) -> None:
        self.add("ok", title, detail, location)

    def warn(self, title: str, detail: str = "", location: Optional[CheckLocation] = None) -> None:
        self.add("warning", title, detail, location)

    def error(self, title: str, detail: str = "", location: Optional[CheckLocation] = None) -> None:
        self.add("error", title, detail, location)

    @property
    def error_count(self) -> int:
        return sum(1 for item in self.issues if item.severity == "error")

    @property
    def warning_count(self) -> int:
        return sum(1 for item in self.issues if item.severity == "warning")

    @property
    def ok_count(self) -> int:
        return sum(1 for item in self.issues if item.severity == "ok")

    @property
    def success(self) -> bool:
        return self.error_count == 0


class TemplateSourceMap:
    TABLE_PATTERN = re.compile(r"^\s*(\[\[?)([A-Za-z0-9_]+)(\]\]?)\s*(?:#.*)?$")
    KEY_PATTERN = re.compile(r"^\s*([A-Za-z0-9_]+)\s*=")

    def __init__(self, file_path: str, text: str) -> None:
        self.file_path = file_path
        self.table_lines: Dict[str, int] = {}
        self.table_field_lines: Dict[tuple[str, str], int] = {}
        self.array_item_lines: Dict[tuple[str, int], int] = {}
        self.array_field_lines: Dict[tuple[str, int, str], int] = {}
        self._parse(text)

    def _parse(self, text: str) -> None:
        counts: Dict[str, int] = {}
        current_section = ""
        current_index: Optional[int] = None
        in_array = False
        for lineno, line in enumerate(text.splitlines(), start=1):
            header = self.TABLE_PATTERN.match(line)
            if header:
                current_section = header.group(2)
                in_array = header.group(1) == "[["
                current_index = None
                if in_array:
                    current_index = counts.get(current_section, 0)
                    counts[current_section] = current_index + 1
                    self.array_item_lines[(current_section, current_index)] = lineno
                else:
                    self.table_lines[current_section] = lineno
                continue
            key_match = self.KEY_PATTERN.match(line)
            if not key_match or not current_section:
                continue
            key = key_match.group(1)
            if in_array and current_index is not None:
                self.array_field_lines[(current_section, current_index, key)] = lineno
            else:
                self.table_field_lines[(current_section, key)] = lineno

    def table(self, section: str, key: str = "") -> CheckLocation:
        line = self.table_field_lines.get((section, key)) if key else self.table_lines.get(section)
        label = f"{section}.{key}" if key else section
        return CheckLocation(self.file_path, line or 0, 1, label)

    def array_item(self, section: str, index: int, item_id: str = "") -> CheckLocation:
        line = self.array_item_lines.get((section, index))
        label = f"{section}.{item_id or index}"
        return CheckLocation(self.file_path, line or 0, 1, label)

    def array_field(self, section: str, index: int, key: str, item_id: str = "") -> CheckLocation:
        line = self.array_field_lines.get((section, index, key)) or self.array_item_lines.get((section, index))
        label = f"{section}.{item_id or index}.{key}"
        return CheckLocation(self.file_path, line or 0, 1, label)


class DeploymentModTemplateChecker:
    def __init__(self) -> None:
        self.parser = DeploymentModParser()

    def check(self, template_path: str) -> CheckReport:
        path = Path(template_path).resolve()
        report = CheckReport(template_path=str(path))
        if not path.is_file():
            report.error("模板文件不存在", f"未找到模板文件: {path}", CheckLocation(str(path), 0, 1, "template"))
            return report

        text = self._read_text_file(path)
        report.ok("已读取模板文件", str(path), CheckLocation(str(path), 1, 1, "template"))
        source_map = TemplateSourceMap(str(path), text)
        raw = self._load_toml(text, report, source_map)
        if raw is None:
            return report
        report.ok("TOML 语法解析通过", "模板文件可以被 TOML 解析器正确读取。", source_map.table("MCStart"))

        self._validate_top_level(raw, report, source_map)
        imported_files = self._validate_mcstart_and_modinfo(raw, report, source_map, path.parent)
        component_ids = self._validate_components(raw, report, source_map, path.parent)
        deployment_ids = self._validate_deployments(raw, report, source_map, path.parent)
        launch_ids = self._validate_launches(raw, report, source_map)
        config_ids = self._validate_configs(raw, report, source_map, deployment_ids)
        self._validate_uninstalls(raw, report, source_map, component_ids, deployment_ids)
        self._validate_placeholders(raw, report, source_map, path.parent, imported_files, component_ids, deployment_ids, launch_ids, config_ids)
        self._validate_engine_parser(raw, report, path.parent)

        if report.error_count == 0:
            report.ok("模板合法性检测完成", "未发现会导致运行失败的语法错误。")
        return report

    def _load_toml(self, text: str, report: CheckReport, source_map: TemplateSourceMap) -> Optional[Dict[str, Any]]:
        try:
            raw = toml_reader.loads(text)
        except Exception as exc:
            line = int(getattr(exc, "lineno", 0) or 0)
            column = int(getattr(exc, "colno", 1) or 1)
            report.error("TOML 语法错误", str(exc), CheckLocation(source_map.file_path, line, column, "toml"))
            return None
        if not isinstance(raw, dict):
            report.error("模板根节点非法", "DeploymentMOD.toml 解析后必须是一个表对象。", CheckLocation(source_map.file_path, 1, 1, "root"))
            return None
        return raw

    def _validate_top_level(self, raw: Dict[str, Any], report: CheckReport, source_map: TemplateSourceMap) -> None:
        for key in raw.keys():
            if key in TOP_LEVEL_KEYS:
                continue
            location = source_map.table(key)
            if location.line == 0:
                location = CheckLocation(source_map.file_path, 1, 1, key)
            report.warn("发现未文档化的顶层区块", f"区块 `{key}` 未在开发文档中声明，请确认不是拼写错误。", location)

        for key in ARRAY_SECTIONS:
            value = raw.get(key)
            if value is None:
                continue
            if not isinstance(value, list):
                report.error("表数组类型错误", f"`{key}` 必须使用 `[[{key}]]` 表数组语法。", source_map.table(key))
                continue
            for index, item in enumerate(value):
                if not isinstance(item, dict):
                    report.error("表数组元素类型错误", f"`{key}` 的第 {index + 1} 项必须是表对象。", source_map.array_item(key, index))

    def _validate_mcstart_and_modinfo(
        self,
        raw: Dict[str, Any],
        report: CheckReport,
        source_map: TemplateSourceMap,
        template_root: Path,
    ) -> set[str]:
        imported_files: set[str] = set()
        mcstart = raw.get("MCStart")
        if not isinstance(mcstart, dict):
            report.error("缺少 [MCStart] 区块", "模板必须声明 `[MCStart]`，并设置 `MCStart = true`。", source_map.table("MCStart"))
        else:
            self._warn_unknown_fields(mcstart, {"MCStart"}, report, lambda key: source_map.table("MCStart", key))
            if "MCStart" not in mcstart:
                report.error("缺少 MCStart 标记", "`[MCStart]` 区块中必须包含 `MCStart = true`。", source_map.table("MCStart"))
            elif mcstart.get("MCStart") is not True:
                report.error("MCStart 标记非法", "`MCStart` 必须为布尔值 `true`。", source_map.table("MCStart", "MCStart"))
            else:
                report.ok("MCStart 标记合法", "模板入口标记已正确声明。", source_map.table("MCStart", "MCStart"))

        modinfo = raw.get("MODINFO")
        if not isinstance(modinfo, dict):
            report.error("缺少 [MODINFO] 区块", "模板必须声明 `[MODINFO]` 元信息区块。", source_map.table("MODINFO"))
            return imported_files

        self._warn_unknown_fields(
            modinfo,
            {
                "author",
                "tags",
                "description",
                "mod_id",
                "mod_name",
                "version",
                "min_version",
                "max_version",
                "file_import",
                "file_import_list",
                "runtime",
                "platforms",
                "schema_version",
            },
            report,
            lambda key: source_map.table("MODINFO", key),
        )

        for key in ("author", "description", "mod_id", "mod_name", "version", "runtime", "schema_version"):
            if key not in modinfo:
                report.error("缺少必填字段", f"`MODINFO.{key}` 是开发文档要求的必填字段。", source_map.table("MODINFO"))
            elif not isinstance(modinfo.get(key), str) or not str(modinfo.get(key) or "").strip():
                report.error("字段值非法", f"`MODINFO.{key}` 必须是非空字符串。", source_map.table("MODINFO", key))

        if "tags" not in modinfo:
            report.error("缺少必填字段", "`MODINFO.tags` 是开发文档要求的必填字段。", source_map.table("MODINFO"))
        else:
            tags = modinfo.get("tags")
            if not isinstance(tags, list) or not tags:
                report.error("标签列表非法", "`MODINFO.tags` 必须是非空字符串数组。", source_map.table("MODINFO", "tags"))
            else:
                for tag in tags:
                    if not isinstance(tag, str) or not tag.strip():
                        report.error("标签值非法", "`MODINFO.tags` 中只能包含非空字符串。", source_map.table("MODINFO", "tags"))
                        break

        if "platforms" not in modinfo:
            report.error("缺少必填字段", "`MODINFO.platforms` 是开发文档要求的必填字段。", source_map.table("MODINFO"))
        else:
            platforms = modinfo.get("platforms")
            if not isinstance(platforms, list):
                report.error("字段类型错误", "`MODINFO.platforms` 必须是字符串数组。", source_map.table("MODINFO", "platforms"))
            else:
                invalid_platforms = [str(item) for item in platforms if str(item).strip().lower() not in VALID_PLATFORMS]
                if invalid_platforms:
                    report.error(
                        "平台声明非法",
                        f"不支持的平台值: {', '.join(invalid_platforms)}。可选值: {', '.join(sorted(VALID_PLATFORMS))}。",
                        source_map.table("MODINFO", "platforms"),
                    )

        if "file_import" not in modinfo:
            report.error("缺少必填字段", "`MODINFO.file_import` 是开发文档要求的必填字段。", source_map.table("MODINFO"))
            file_import = False
        else:
            file_import = modinfo.get("file_import") is True
            if not isinstance(modinfo.get("file_import"), bool):
                report.error("字段类型错误", "`MODINFO.file_import` 必须是布尔值。", source_map.table("MODINFO", "file_import"))
                file_import = False

        file_import_list = modinfo.get("file_import_list", [])
        if file_import:
            if not isinstance(file_import_list, list) or not file_import_list:
                report.error("文件导入列表非法", "启用 `file_import` 时 `file_import_list` 必须是非空字符串数组。", source_map.table("MODINFO", "file_import_list"))
            else:
                for item in file_import_list:
                    if not isinstance(item, str) or not item.strip():
                        report.error("文件导入项非法", "`file_import_list` 中只能包含非空字符串。", source_map.table("MODINFO", "file_import_list"))
                        continue
                    imported_files.add(item.strip())
                    if not (template_root / item.strip()).is_file():
                        report.error("导入文件不存在", f"模板声明了导入文件 `{item}`，但模板目录中找不到它。", source_map.table("MODINFO", "file_import_list"))
        elif isinstance(file_import_list, list) and file_import_list:
            report.warn("文件导入列表将被忽略", "`file_import = false` 时 `file_import_list` 不会生效。", source_map.table("MODINFO", "file_import_list"))

        runtime = str(modinfo.get("runtime", "") or "").strip().lower()
        if runtime and runtime not in VALID_RUNTIMES:
            report.error("运行时声明非法", f"`MODINFO.runtime` 只支持: {', '.join(sorted(VALID_RUNTIMES))}。", source_map.table("MODINFO", "runtime"))

        mod_id = str(modinfo.get("mod_id", "") or "").strip()
        if mod_id and not MOD_ID_PATTERN.match(mod_id):
            report.error("mod_id 格式非法", "`mod_id` 应形如 `GitHubUser.ModName`，且不应包含空格。", source_map.table("MODINFO", "mod_id"))

        version = str(modinfo.get("version", "") or "").strip()
        if version and not SEMVER_PATTERN.match(version):
            report.warn("模板版本号不规范", "开发文档建议 `version` 使用 SemVer 风格字符串。", source_map.table("MODINFO", "version"))

        schema_version = str(modinfo.get("schema_version", "") or "").strip()
        if schema_version and schema_version != "2.1":
            report.warn("schema_version 与当前文档版本不一致", "当前开发文档标注的模板格式版本为 `2.1`。", source_map.table("MODINFO", "schema_version"))

        min_version = str(modinfo.get("min_version", "") or "").strip()
        max_version = str(modinfo.get("max_version", "") or "").strip()
        if min_version and max_version and self._compare_versions(min_version, max_version) > 0:
            report.error("版本范围非法", "`min_version` 不能高于 `max_version`。", source_map.table("MODINFO", "min_version"))

        report.ok("MODINFO 基本字段已检查", "已完成元信息、平台和版本范围校验。", source_map.table("MODINFO"))
        return imported_files

    def _validate_components(
        self,
        raw: Dict[str, Any],
        report: CheckReport,
        source_map: TemplateSourceMap,
        template_root: Path,
    ) -> set[str]:
        items = raw.get("Component") or []
        if items and not isinstance(raw.get("COMPONENTS"), dict):
            report.error("缺少 [COMPONENTS] 区块", "声明了 `[[Component]]` 时，必须同时声明 `[COMPONENTS]`。", source_map.array_item("Component", 0))
        section_order = self._validate_stage_section("COMPONENTS", "Component", raw, report, source_map)

        component_ids: List[str] = []
        seen_ids: set[str] = set()
        for index, item in enumerate(items if isinstance(items, list) else []):
            if not isinstance(item, dict):
                continue
            item_id = self._item_id(item, index)
            self._warn_unknown_fields(item, COMPONENT_ALLOWED_FIELDS, report, lambda key, i=index: source_map.array_field("Component", i, key, item_id))
            item_id = self._require_string(item, "id", report, source_map.array_field("Component", index, "id", item_id))
            self._require_string(item, "name", report, source_map.array_field("Component", index, "name", item_id))

            if item_id:
                component_ids.append(item_id)
                if item_id in seen_ids:
                    report.error("组件 ID 重复", f"组件 ID `{item_id}` 在模板中重复定义。", source_map.array_field("Component", index, "id", item_id))
                seen_ids.add(item_id)
                if not COMPONENT_ID_PATTERN.match(item_id):
                    report.error("组件 ID 格式非法", "组件 ID 只能包含小写字母、数字和连字符 `-`。", source_map.array_field("Component", index, "id", item_id))

            install = self._require_bool(item, "install", report, source_map.array_field("Component", index, "install", item_id), required=True)
            check = self._require_bool(item, "check", report, source_map.array_field("Component", index, "check", item_id), required=True)
            before_command = self._require_bool(item, "before_command", report, source_map.array_field("Component", index, "before_command", item_id), required=True)
            after_command = self._require_bool(item, "after_command", report, source_map.array_field("Component", index, "after_command", item_id), required=True)
            env_output = self._require_bool(item, "env_output", report, source_map.array_field("Component", index, "env_output", item_id), required=False)
            env_input = self._require_bool(item, "env_input", report, source_map.array_field("Component", index, "env_input", item_id), required=False)

            if install:
                self._require_bool(item, "choose", report, source_map.array_field("Component", index, "choose", item_id), required=True)
                command_install = self._require_bool(item, "command_install", report, source_map.array_field("Component", index, "command_install", item_id), required=True)
            else:
                command_install = bool(item.get("command_install", False))
                if "choose" in item:
                    report.warn("choose 在 install=false 时没有意义", "当前组件不会执行安装流程，`choose` 开关不会生效。", source_map.array_field("Component", index, "choose", item_id))

            install_path = str(item.get("install_path", "") or "").strip()
            custom_path = str(item.get("custom_path", "") or "").strip()
            if install or check:
                if not install_path:
                    report.error("缺少安装路径", "组件会进入检查或安装流程时，必须提供 `install_path`。", source_map.array_item("Component", index, item_id))
                else:
                    self._validate_stage_path_value("install_path", install_path, custom_path, report, source_map.array_field("Component", index, "install_path", item_id))

            if check:
                self._require_command_list(item, "check_command", report, source_map.array_field("Component", index, "check_command", item_id), raw, template_root, component_ids, set(), set(), set())
                contains_tokens = self._string_list(item.get("check_version_contains"))
                regex_tokens = self._string_list(item.get("check_version_regex"))
                if not contains_tokens and not regex_tokens:
                    report.error("组件检查条件缺失", "`check = true` 时，至少需要配置 `check_version_contains` 或 `check_version_regex`。", source_map.array_field("Component", index, "check", item_id))
                for pattern in regex_tokens:
                    self._validate_regex(pattern, report, source_map.array_field("Component", index, "check_version_regex", item_id), "check_version_regex")
            else:
                if item.get("check_command"):
                    report.warn("检查命令将被忽略", "`check = false` 时 `check_command` 不会执行。", source_map.array_field("Component", index, "check_command", item_id))
                if item.get("check_version_contains") or item.get("check_version_regex"):
                    report.warn("检查匹配规则将被忽略", "`check = false` 时版本检查相关字段不会生效。", source_map.array_field("Component", index, "check", item_id))

            if before_command:
                self._require_command_list(item, "before_command_list", report, source_map.array_field("Component", index, "before_command_list", item_id), raw, template_root, component_ids, set(), set(), set())
            elif item.get("before_command_list"):
                report.warn("安装前命令将被忽略", "`before_command = false` 时 `before_command_list` 不会执行。", source_map.array_field("Component", index, "before_command_list", item_id))

            if after_command:
                self._require_command_list(item, "after_command_list", report, source_map.array_field("Component", index, "after_command_list", item_id), raw, template_root, component_ids, set(), set(), set())
            elif item.get("after_command_list"):
                report.warn("安装后命令将被忽略", "`after_command = false` 时 `after_command_list` 不会执行。", source_map.array_field("Component", index, "after_command_list", item_id))

            self._validate_env_lists(item, env_output, env_input, report, source_map, "Component", index, item_id, raw, template_root, component_ids, set(), set(), set())

            if install:
                get_method = str(item.get("get_method", "") or "").strip().lower()
                user_choose = bool(item.get("user_choose", False))
                format_version = bool(item.get("format_version", False))
                if command_install:
                    install_commands = self._require_command_list(item, "install_command_list", report, source_map.array_field("Component", index, "install_command_list", item_id), raw, template_root, component_ids, set(), set(), set())
                    self._warn_command_mode_fields(
                        "组件",
                        item_id,
                        item,
                        {"install_operate", "install_custom_list", "direct_link", "get_method", "get_version", "github_repo", "get_link", "get_link_provide_list", "choose_list", "format_version", "version_formatting_formula", "splicing_link"},
                        report,
                        source_map.array_field("Component", index, "command_install", item_id),
                    )
                    if get_method == "get_version":
                        self._validate_component_source(item, report, source_map, index, item_id, template_root, command_mode=True)
                        if not self._command_uses_version(install_commands, item_id, "Component", index):
                            report.warn("命令行安装没有使用版本占位符", "当前组件声明了版本获取逻辑，但安装命令中没有使用 `{{version|组件ID}}` 或引用 `splicing_link`，最终选中的版本很可能不会参与实际下载。", source_map.array_field("Component", index, "install_command_list", item_id))
                    elif get_method in {"direct", "get_link"}:
                        report.warn("命令行安装不会自动注入下载链接", "`command_install = true` 时，引擎不会把解析后的链接自动替换进命令列表；如需使用，请在命令中自行构造下载命令。", source_map.array_field("Component", index, "get_method", item_id))
                else:
                    if get_method not in VALID_COMPONENT_GET_METHODS:
                        report.error("组件获取方式缺失或非法", "自动安装组件时必须设置合法的 `get_method`。", source_map.array_field("Component", index, "get_method", item_id))
                    else:
                        self._validate_component_source(item, report, source_map, index, item_id, template_root, command_mode=False)
                    install_operate = str(item.get("install_operate", "") or "").strip().lower()
                    if install_operate not in VALID_INSTALL_OPERATIONS:
                        report.error("安装操作方式缺失或非法", f"`install_operate` 只支持: {', '.join(sorted(VALID_INSTALL_OPERATIONS))}。", source_map.array_field("Component", index, "install_operate", item_id))
                    elif install_operate == "custom":
                        self._validate_install_custom_list(item, report, source_map.array_field("Component", index, "install_custom_list", item_id))
                    elif item.get("install_custom_list"):
                        report.warn("install_custom_list 将被忽略", "只有 `install_operate = \"custom\"` 时 `install_custom_list` 才会生效。", source_map.array_field("Component", index, "install_custom_list", item_id))

                if user_choose:
                    self._validate_choose_list(item, report, source_map.array_field("Component", index, "choose_list", item_id), get_method)
                elif item.get("choose_list"):
                    report.warn("choose_list 将被忽略", "只有 `user_choose = true` 时 `choose_list` 才会生效。", source_map.array_field("Component", index, "choose_list", item_id))

                if format_version:
                    self._validate_version_formula(item, report, source_map.array_field("Component", index, "version_formatting_formula", item_id))
                elif item.get("version_formatting_formula"):
                    report.warn("版本格式化公式将被忽略", "只有 `format_version = true` 时 `version_formatting_formula` 才会生效。", source_map.array_field("Component", index, "version_formatting_formula", item_id))

        self._validate_stage_order("COMPONENTS.list", section_order, component_ids, report, source_map.table("COMPONENTS", "list"), "Component")
        if component_ids:
            report.ok("组件区块已检查", f"共检查 {len(component_ids)} 个组件定义。", source_map.table("COMPONENTS"))
        return set(component_ids)

    def _validate_component_source(
        self,
        item: Dict[str, Any],
        report: CheckReport,
        source_map: TemplateSourceMap,
        index: int,
        item_id: str,
        template_root: Path,
        command_mode: bool,
    ) -> None:
        get_method = str(item.get("get_method", "") or "").strip().lower()
        if not get_method:
            report.warn("未声明 get_method", "命令行安装可以只靠命令列表完成，但这样会失去声明式下载元数据。", source_map.array_field("Component", index, "get_method", item_id))
            return
        if get_method == "direct":
            direct_link = str(item.get("direct_link", "") or "").strip()
            if not direct_link:
                report.error("direct_link 缺失", "`get_method = \"direct\"` 时必须提供 `direct_link`。", source_map.array_field("Component", index, "direct_link", item_id))
            return
        if get_method == "get_version":
            version_source = str(item.get("get_version", "") or "").strip().lower()
            if version_source not in VALID_GET_VERSION_SOURCES:
                report.error("get_version 声明非法", f"`get_version` 只支持: {', '.join(sorted(VALID_GET_VERSION_SOURCES))}。", source_map.array_field("Component", index, "get_version", item_id))
            else:
                self._validate_version_provider(item, version_source, report, source_map.array_field("Component", index, "get_version", item_id), template_root)
            splicing_link = str(item.get("splicing_link", "") or "").strip()
            if not command_mode and not splicing_link:
                report.error("splicing_link 缺失", "组件使用 `get_method = \"get_version\"` 自动安装时必须提供 `splicing_link`。", source_map.array_field("Component", index, "splicing_link", item_id))
            if splicing_link:
                self._validate_splicing_link(splicing_link, item_id, report, source_map.array_field("Component", index, "splicing_link", item_id))
            return
        if get_method == "get_link":
            link_source = str(item.get("get_link", "") or "").strip().lower()
            if link_source not in VALID_GET_LINK_SOURCES:
                report.error("get_link 声明非法", f"`get_link` 只支持: {', '.join(sorted(VALID_GET_LINK_SOURCES))}。", source_map.array_field("Component", index, "get_link", item_id))
            else:
                self._validate_link_provider(item, link_source, report, source_map.array_field("Component", index, "get_link", item_id), template_root)
            return
        report.error("get_method 非法", f"组件 `get_method` 只支持: {', '.join(sorted(VALID_COMPONENT_GET_METHODS))}。", source_map.array_field("Component", index, "get_method", item_id))

    def _validate_deployments(
        self,
        raw: Dict[str, Any],
        report: CheckReport,
        source_map: TemplateSourceMap,
        template_root: Path,
    ) -> set[str]:
        items = raw.get("Deployment") or []
        if items and not isinstance(raw.get("DEPLOY"), dict):
            report.error("缺少 [DEPLOY] 区块", "声明了 `[[Deployment]]` 时，必须同时声明 `[DEPLOY]`。", source_map.array_item("Deployment", 0))
        section_order = self._validate_stage_section("DEPLOY", "Deployment", raw, report, source_map)

        deployment_ids: List[str] = []
        seen_ids: set[str] = set()
        for index, item in enumerate(items if isinstance(items, list) else []):
            if not isinstance(item, dict):
                continue
            item_id = self._item_id(item, index)
            self._warn_unknown_fields(item, DEPLOYMENT_ALLOWED_FIELDS, report, lambda key, i=index: source_map.array_field("Deployment", i, key, item_id))
            item_id = self._require_string(item, "id", report, source_map.array_field("Deployment", index, "id", item_id))
            self._require_string(item, "name", report, source_map.array_field("Deployment", index, "name", item_id))
            if item_id:
                deployment_ids.append(item_id)
                if item_id in seen_ids:
                    report.error("部署 ID 重复", f"部署 ID `{item_id}` 在模板中重复定义。", source_map.array_field("Deployment", index, "id", item_id))
                seen_ids.add(item_id)

            deploy = self._require_bool(item, "deploy", report, source_map.array_field("Deployment", index, "deploy", item_id), required=True)
            command_deploy = self._require_bool(item, "command_deploy", report, source_map.array_field("Deployment", index, "command_deploy", item_id), required=deploy)
            self._require_bool(item, "choose", report, source_map.array_field("Deployment", index, "choose", item_id), required=True)
            before_command = self._require_bool(item, "before_command", report, source_map.array_field("Deployment", index, "before_command", item_id), required=True)
            after_command = self._require_bool(item, "after_command", report, source_map.array_field("Deployment", index, "after_command", item_id), required=True)
            env_output = self._require_bool(item, "env_output", report, source_map.array_field("Deployment", index, "env_output", item_id), required=False)
            env_input = self._require_bool(item, "env_input", report, source_map.array_field("Deployment", index, "env_input", item_id), required=False)

            deploy_path = str(item.get("deploy_path", "") or "").strip()
            custom_path = str(item.get("custom_path", "") or "").strip()
            if deploy:
                if not deploy_path:
                    report.error("缺少部署路径", "部署项执行时必须提供 `deploy_path`。", source_map.array_item("Deployment", index, item_id))
                else:
                    self._validate_stage_path_value("deploy_path", deploy_path, custom_path, report, source_map.array_field("Deployment", index, "deploy_path", item_id))

            if before_command:
                self._require_command_list(item, "before_command_list", report, source_map.array_field("Deployment", index, "before_command_list", item_id), raw, template_root, set(), deployment_ids, set(), set())
            elif item.get("before_command_list"):
                report.warn("部署前命令将被忽略", "`before_command = false` 时 `before_command_list` 不会执行。", source_map.array_field("Deployment", index, "before_command_list", item_id))

            if after_command:
                self._require_command_list(item, "after_command_list", report, source_map.array_field("Deployment", index, "after_command_list", item_id), raw, template_root, set(), deployment_ids, set(), set())
            elif item.get("after_command_list"):
                report.warn("部署后命令将被忽略", "`after_command = false` 时 `after_command_list` 不会执行。", source_map.array_field("Deployment", index, "after_command_list", item_id))

            self._validate_env_lists(item, env_output, env_input, report, source_map, "Deployment", index, item_id, raw, template_root, set(), deployment_ids, set(), set())

            if deploy:
                get_method = str(item.get("get_method", "") or "").strip().lower()
                user_choose = bool(item.get("user_choose", False))
                format_version = bool(item.get("format_version", False))
                if command_deploy:
                    deploy_commands = self._require_command_list(item, "deploy_command_list", report, source_map.array_field("Deployment", index, "deploy_command_list", item_id), raw, template_root, set(), deployment_ids, set(), set())
                    self._warn_command_mode_fields(
                        "部署",
                        item_id,
                        item,
                        {"deploy_method", "base_link", "get_method", "get_version", "github_repo", "get_link", "get_link_provide_list", "choose_list", "format_version", "version_formatting_formula", "splicing_link"},
                        report,
                        source_map.array_field("Deployment", index, "command_deploy", item_id),
                    )
                    if get_method == "get_version":
                        self._validate_deployment_source(item, report, source_map, index, item_id, template_root, command_mode=True)
                        if not self._command_uses_version(deploy_commands, item_id, "Deployment", index):
                            report.warn("命令行部署没有使用版本占位符", "当前部署项声明了版本获取逻辑，但部署命令中没有使用 `{{version|部署ID}}` 或引用 `splicing_link`，最终选中的版本可能不会参与实际部署。", source_map.array_field("Deployment", index, "deploy_command_list", item_id))
                    elif get_method in {"get_link", "direct"}:
                        report.warn("命令行部署不会自动注入下载链接", "`command_deploy = true` 时，引擎不会把解析后的链接自动注入命令列表；如需使用，请在命令中自行构造下载命令。", source_map.array_field("Deployment", index, "get_method", item_id))
                else:
                    if get_method:
                        self._validate_deployment_source(item, report, source_map, index, item_id, template_root, command_mode=False)
                    elif not str(item.get("base_link", "") or "").strip():
                        report.error("缺少部署基础链接", "自动部署时至少需要提供 `base_link` 或合法的 `get_method`。", source_map.array_field("Deployment", index, "base_link", item_id))
                    deploy_method = str(item.get("deploy_method", "") or "").strip().lower()
                    if deploy_method not in VALID_DEPLOY_METHODS:
                        report.error("deploy_method 缺失或非法", f"`deploy_method` 只支持: {', '.join(sorted(VALID_DEPLOY_METHODS))}。", source_map.array_field("Deployment", index, "deploy_method", item_id))
                    if item.get("direct_link"):
                        report.error("Deployment 不支持 direct_link", "开发文档中 `[[Deployment]]` 没有 `direct` 获取模式，请改用 `base_link`、`get_version` 或 `get_link`。", source_map.array_field("Deployment", index, "direct_link", item_id))

                if user_choose:
                    self._validate_choose_list(item, report, source_map.array_field("Deployment", index, "choose_list", item_id), get_method)
                elif item.get("choose_list"):
                    report.warn("choose_list 将被忽略", "只有 `user_choose = true` 时 `choose_list` 才会生效。", source_map.array_field("Deployment", index, "choose_list", item_id))

                if format_version:
                    self._validate_version_formula(item, report, source_map.array_field("Deployment", index, "version_formatting_formula", item_id))
                elif item.get("version_formatting_formula"):
                    report.warn("版本格式化公式将被忽略", "只有 `format_version = true` 时 `version_formatting_formula` 才会生效。", source_map.array_field("Deployment", index, "version_formatting_formula", item_id))

        self._validate_stage_order("DEPLOY.list", section_order, deployment_ids, report, source_map.table("DEPLOY", "list"), "Deployment")
        if deployment_ids:
            report.ok("部署区块已检查", f"共检查 {len(deployment_ids)} 个部署定义。", source_map.table("DEPLOY"))
        return set(deployment_ids)

    def _validate_deployment_source(
        self,
        item: Dict[str, Any],
        report: CheckReport,
        source_map: TemplateSourceMap,
        index: int,
        item_id: str,
        template_root: Path,
        command_mode: bool,
    ) -> None:
        get_method = str(item.get("get_method", "") or "").strip().lower()
        if get_method == "direct":
            report.error("Deployment 不支持 direct 获取模式", "开发文档规定部署项的 `get_method` 只能是 `get_version` 或 `get_link`。", source_map.array_field("Deployment", index, "get_method", item_id))
            return
        if get_method == "get_version":
            version_source = str(item.get("get_version", "") or "").strip().lower()
            if version_source not in VALID_GET_VERSION_SOURCES:
                report.error("get_version 声明非法", f"`get_version` 只支持: {', '.join(sorted(VALID_GET_VERSION_SOURCES))}。", source_map.array_field("Deployment", index, "get_version", item_id))
            else:
                self._validate_version_provider(item, version_source, report, source_map.array_field("Deployment", index, "get_version", item_id), template_root)
            base_link = str(item.get("base_link", "") or "").strip()
            splicing_link = str(item.get("splicing_link", "") or "").strip()
            if not splicing_link and not base_link:
                report.error("版本部署缺少链接基础", "`get_method = \"get_version\"` 时，至少要提供 `base_link` 或 `splicing_link`。", source_map.array_field("Deployment", index, "splicing_link", item_id))
            if splicing_link:
                self._validate_splicing_link(splicing_link, item_id, report, source_map.array_field("Deployment", index, "splicing_link", item_id))
            elif command_mode:
                report.warn("未声明 splicing_link", "命令行部署若需要拼接下载地址，通常应在命令中显式使用 `{{version|部署ID}}` 或 `splicing_link`。", source_map.array_field("Deployment", index, "get_method", item_id))
            return
        if get_method == "get_link":
            link_source = str(item.get("get_link", "") or "").strip().lower()
            if link_source not in VALID_GET_LINK_SOURCES:
                report.error("get_link 声明非法", f"`get_link` 只支持: {', '.join(sorted(VALID_GET_LINK_SOURCES))}。", source_map.array_field("Deployment", index, "get_link", item_id))
            else:
                self._validate_link_provider(item, link_source, report, source_map.array_field("Deployment", index, "get_link", item_id), template_root)
            return
        if get_method:
            report.error("get_method 非法", f"部署项 `get_method` 只支持: {', '.join(sorted(VALID_DEPLOYMENT_GET_METHODS))}。", source_map.array_field("Deployment", index, "get_method", item_id))

    def _validate_launches(self, raw: Dict[str, Any], report: CheckReport, source_map: TemplateSourceMap) -> set[str]:
        items = raw.get("LaunchItem") or []
        if items and not isinstance(raw.get("LAUNCH"), dict):
            report.error("缺少 [LAUNCH] 区块", "声明了 `[[LaunchItem]]` 时，必须同时声明 `[LAUNCH]`。", source_map.array_item("LaunchItem", 0))
        section_order = self._validate_stage_section("LAUNCH", "LaunchItem", raw, report, source_map)

        launch_ids: List[str] = []
        seen_ids: set[str] = set()
        for index, item in enumerate(items if isinstance(items, list) else []):
            if not isinstance(item, dict):
                continue
            item_id = self._item_id(item, index)
            self._warn_unknown_fields(item, LAUNCH_ALLOWED_FIELDS, report, lambda key, i=index: source_map.array_field("LaunchItem", i, key, item_id))
            item_id = self._require_string(item, "id", report, source_map.array_field("LaunchItem", index, "id", item_id))
            self._require_string(item, "name", report, source_map.array_field("LaunchItem", index, "name", item_id))
            if item_id:
                launch_ids.append(item_id)
                if item_id in seen_ids:
                    report.error("启动项 ID 重复", f"启动项 ID `{item_id}` 在模板中重复定义。", source_map.array_field("LaunchItem", index, "id", item_id))
                seen_ids.add(item_id)
            launch = self._require_bool(item, "launch", report, source_map.array_field("LaunchItem", index, "launch", item_id), required=True)
            self._require_bool(item, "choose", report, source_map.array_field("LaunchItem", index, "choose", item_id), required=True)
            env_output = self._require_bool(item, "env_output", report, source_map.array_field("LaunchItem", index, "env_output", item_id), required=False)
            env_input = self._require_bool(item, "env_input", report, source_map.array_field("LaunchItem", index, "env_input", item_id), required=False)
            if launch:
                self._require_command_list(item, "launch_command", report, source_map.array_field("LaunchItem", index, "launch_command", item_id), raw, Path(source_map.file_path).parent, set(), set(), launch_ids, set())
            elif item.get("launch_command"):
                report.warn("启动命令将被忽略", "`launch = false` 时 `launch_command` 不会执行。", source_map.array_field("LaunchItem", index, "launch_command", item_id))
            self._validate_env_lists(item, env_output, env_input, report, source_map, "LaunchItem", index, item_id, raw, Path(source_map.file_path).parent, set(), set(), launch_ids, set())

        self._validate_stage_order("LAUNCH.list", section_order, launch_ids, report, source_map.table("LAUNCH", "list"), "LaunchItem")
        if launch_ids:
            report.ok("启动区块已检查", f"共检查 {len(launch_ids)} 个启动项定义。", source_map.table("LAUNCH"))
        return set(launch_ids)

    def _validate_configs(
        self,
        raw: Dict[str, Any],
        report: CheckReport,
        source_map: TemplateSourceMap,
        deployment_ids: set[str],
    ) -> set[str]:
        items = raw.get("ConfigItem") or []
        if items and not isinstance(raw.get("CONFIG"), dict):
            report.error("缺少 [CONFIG] 区块", "声明了 `[[ConfigItem]]` 时，必须同时声明 `[CONFIG]`。", source_map.array_item("ConfigItem", 0))
        section_order = self._validate_stage_section("CONFIG", "ConfigItem", raw, report, source_map)

        config_keys: List[str] = []
        seen_keys: set[str] = set()
        for index, item in enumerate(items if isinstance(items, list) else []):
            if not isinstance(item, dict):
                continue
            item_id = self._item_id(item, index)
            self._warn_unknown_fields(item, CONFIG_ALLOWED_FIELDS, report, lambda key, i=index: source_map.array_field("ConfigItem", i, key, item_id))
            config_id = str(item.get("id", "") or "").strip()
            name = self._require_string(item, "name", report, source_map.array_field("ConfigItem", index, "name", item_id))
            file_path = self._require_string(item, "file_path", report, source_map.array_field("ConfigItem", index, "file_path", config_id or name))
            self._require_bool(item, "choose", report, source_map.array_field("ConfigItem", index, "choose", config_id or name), required=True)
            env_input = self._require_bool(item, "env_input", report, source_map.array_field("ConfigItem", index, "env_input", config_id or name), required=False)
            env_output = self._require_bool(item, "env_output", report, source_map.array_field("ConfigItem", index, "env_output", config_id or name), required=False)

            effective_key = config_id or name
            if not config_id:
                report.warn("ConfigItem 建议显式声明 id", "开发文档建议 `ConfigItem.id` 与 `CONFIG.list` 中的条目保持一致，便于排错和引用。", source_map.array_item("ConfigItem", index, effective_key))
            if effective_key:
                config_keys.append(effective_key)
                if effective_key in seen_keys:
                    report.error("配置项标识重复", f"配置项 `{effective_key}` 在模板中重复定义。", source_map.array_item("ConfigItem", index, effective_key))
                seen_keys.add(effective_key)
                if "|" in effective_key:
                    dep_id = effective_key.split("|", 1)[0].strip()
                    if dep_id and dep_id not in deployment_ids:
                        report.error("配置项从属部署不存在", f"配置项 `{effective_key}` 指向的部署 `{dep_id}` 未定义。", source_map.array_item("ConfigItem", index, effective_key))
            if file_path:
                self._validate_text_placeholders(
                    file_path,
                    report,
                    source_map.array_field("ConfigItem", index, "file_path", effective_key),
                    raw,
                    Path(source_map.file_path).parent,
                    set(),
                    set(),
                    deployment_ids,
                    set(),
                    set(),
                )
            self._validate_env_lists(item, env_output, env_input, report, source_map, "ConfigItem", index, effective_key, raw, Path(source_map.file_path).parent, set(), deployment_ids, set(), set())

        config_section = raw.get("CONFIG") if isinstance(raw.get("CONFIG"), dict) else {}
        config_list = config_section.get("list") if isinstance(config_section, dict) else []
        if isinstance(config_list, list):
            for entry in config_list:
                if not isinstance(entry, str) or "|" not in entry:
                    report.error("CONFIG.list 条目格式非法", "`CONFIG.list` 中的每个元素都必须是 `从属ID|相对路径` 格式。", source_map.table("CONFIG", "list"))
                    continue
                dep_id = entry.split("|", 1)[0].strip()
                if dep_id and dep_id not in deployment_ids:
                    report.error("CONFIG.list 引用的部署不存在", f"`{entry}` 中的部署 ID `{dep_id}` 未定义。", source_map.table("CONFIG", "list"))

        self._validate_stage_order("CONFIG.list", section_order, config_keys, report, source_map.table("CONFIG", "list"), "ConfigItem")
        if config_keys:
            report.ok("配置区块已检查", f"共检查 {len(config_keys)} 个配置项定义。", source_map.table("CONFIG"))
        return set(config_keys)

    def _validate_uninstalls(
        self,
        raw: Dict[str, Any],
        report: CheckReport,
        source_map: TemplateSourceMap,
        component_ids: set[str],
        deployment_ids: set[str],
    ) -> None:
        items = raw.get("UninstallItem") or []
        if items and not isinstance(raw.get("UNINSTALL"), dict):
            report.error("缺少 [UNINSTALL] 区块", "声明了 `[[UninstallItem]]` 时，必须同时声明 `[UNINSTALL]`。", source_map.array_item("UninstallItem", 0))
        section_order = self._validate_stage_section("UNINSTALL", "UninstallItem", raw, report, source_map)

        uninstall_ids: List[str] = []
        seen_ids: set[str] = set()
        for index, item in enumerate(items if isinstance(items, list) else []):
            if not isinstance(item, dict):
                continue
            item_id = self._item_id(item, index)
            self._warn_unknown_fields(item, UNINSTALL_ALLOWED_FIELDS, report, lambda key, i=index: source_map.array_field("UninstallItem", i, key, item_id))
            item_id = self._require_string(item, "id", report, source_map.array_field("UninstallItem", index, "id", item_id))
            self._require_string(item, "name", report, source_map.array_field("UninstallItem", index, "name", item_id))
            if item_id:
                uninstall_ids.append(item_id)
                if item_id in seen_ids:
                    report.error("卸载项 ID 重复", f"卸载项 ID `{item_id}` 在模板中重复定义。", source_map.array_field("UninstallItem", index, "id", item_id))
                seen_ids.add(item_id)

            stop_before = self._require_bool(item, "stop_before_uninstall", report, source_map.array_field("UninstallItem", index, "stop_before_uninstall", item_id), required=False)
            remove_runtime_files = self._require_bool(item, "remove_runtime_files", report, source_map.array_field("UninstallItem", index, "remove_runtime_files", item_id), required=False)
            remove_deploy_root = self._require_bool(item, "remove_deploy_root", report, source_map.array_field("UninstallItem", index, "remove_deploy_root", item_id), required=False)
            remove_component = self._require_bool(item, "remove_component", report, source_map.array_field("UninstallItem", index, "remove_component", item_id), required=False)
            self._require_bool(item, "remove_instance_config", report, source_map.array_field("UninstallItem", index, "remove_instance_config", item_id), required=False)
            self._require_bool(item, "choose", report, source_map.array_field("UninstallItem", index, "choose", item_id), required=True)
            self._require_bool(item, "uninstall", report, source_map.array_field("UninstallItem", index, "uninstall", item_id), required=True)
            before_command = self._require_bool(item, "before_command", report, source_map.array_field("UninstallItem", index, "before_command", item_id), required=True)
            after_command = self._require_bool(item, "after_command", report, source_map.array_field("UninstallItem", index, "after_command", item_id), required=True)
            env_output = self._require_bool(item, "env_output", report, source_map.array_field("UninstallItem", index, "env_output", item_id), required=False)
            env_input = self._require_bool(item, "env_input", report, source_map.array_field("UninstallItem", index, "env_input", item_id), required=False)

            if stop_before:
                self._require_command_list(item, "stop_command_list", report, source_map.array_field("UninstallItem", index, "stop_command_list", item_id), raw, Path(source_map.file_path).parent, component_ids, deployment_ids, set(), set())
            elif item.get("stop_command_list"):
                report.warn("stop_command_list 将被忽略", "`stop_before_uninstall = false` 时停止命令不会执行。", source_map.array_field("UninstallItem", index, "stop_command_list", item_id))

            if before_command:
                self._require_command_list(item, "before_command_list", report, source_map.array_field("UninstallItem", index, "before_command_list", item_id), raw, Path(source_map.file_path).parent, component_ids, deployment_ids, set(), set())
            elif item.get("before_command_list"):
                report.warn("卸载前命令将被忽略", "`before_command = false` 时 `before_command_list` 不会执行。", source_map.array_field("UninstallItem", index, "before_command_list", item_id))

            if after_command:
                self._require_command_list(item, "after_command_list", report, source_map.array_field("UninstallItem", index, "after_command_list", item_id), raw, Path(source_map.file_path).parent, component_ids, deployment_ids, set(), set())
            elif item.get("after_command_list"):
                report.warn("卸载后命令将被忽略", "`after_command = false` 时 `after_command_list` 不会执行。", source_map.array_field("UninstallItem", index, "after_command_list", item_id))

            deployment_targets = self._string_list(item.get("deployment_targets"))
            component_targets = self._string_list(item.get("component_targets"))
            if remove_deploy_root:
                for deployment_id in deployment_targets:
                    if deployment_id not in deployment_ids:
                        report.error("deployment_targets 引用了不存在的部署项", f"部署 ID `{deployment_id}` 未定义。", source_map.array_field("UninstallItem", index, "deployment_targets", item_id))
            elif deployment_targets:
                report.warn("deployment_targets 将被忽略", "只有 `remove_deploy_root = true` 时 `deployment_targets` 才会生效。", source_map.array_field("UninstallItem", index, "deployment_targets", item_id))

            if remove_component:
                for component_id in component_targets:
                    if component_id not in component_ids:
                        report.error("component_targets 引用了不存在的组件", f"组件 ID `{component_id}` 未定义。", source_map.array_field("UninstallItem", index, "component_targets", item_id))
            elif component_targets:
                report.warn("component_targets 将被忽略", "只有 `remove_component = true` 时 `component_targets` 才会生效。", source_map.array_field("UninstallItem", index, "component_targets", item_id))

            if remove_runtime_files and section_order and index != len(section_order) - 1:
                report.warn("remove_runtime_files 建议只在最后一个卸载项启用", "开发文档建议仅在最后一个卸载项中删除运行时文件，以免后续卸载项失去上下文。", source_map.array_field("UninstallItem", index, "remove_runtime_files", item_id))

            self._validate_env_lists(item, env_output, env_input, report, source_map, "UninstallItem", index, item_id, raw, Path(source_map.file_path).parent, component_ids, deployment_ids, set(), set())

        self._validate_stage_order("UNINSTALL.list", section_order, uninstall_ids, report, source_map.table("UNINSTALL", "list"), "UninstallItem")
        if uninstall_ids:
            report.ok("卸载区块已检查", f"共检查 {len(uninstall_ids)} 个卸载项定义。", source_map.table("UNINSTALL"))

    def _validate_placeholders(
        self,
        raw: Dict[str, Any],
        report: CheckReport,
        source_map: TemplateSourceMap,
        template_root: Path,
        imported_files: set[str],
        component_ids: set[str],
        deployment_ids: set[str],
        launch_ids: set[str],
        config_ids: set[str],
    ) -> None:
        def walk(node: Any, breadcrumbs: List[str]) -> None:
            if isinstance(node, dict):
                for key, value in node.items():
                    walk(value, breadcrumbs + [key])
                return
            if isinstance(node, list):
                for index, value in enumerate(node):
                    walk(value, breadcrumbs + [str(index)])
                return
            if not isinstance(node, str) or "{{" not in node:
                return
            location = self._location_from_breadcrumbs(source_map, breadcrumbs, raw)
            self._validate_text_placeholders(node, report, location, raw, template_root, imported_files, component_ids, deployment_ids, launch_ids, config_ids)

        walk(raw, [])
        report.ok("占位符引用已检查", "已校验模板中的静态/运行时占位符语法。")

    def _validate_engine_parser(self, raw: Dict[str, Any], report: CheckReport, template_root: Path) -> None:
        try:
            template = self.parser.parse(raw, template_root=str(template_root))
        except Exception as exc:
            report.error("引擎兼容性检查失败", str(exc))
            return
        report.ok("引擎兼容性检查通过", f"DeploymentModParser 成功解析模板：组件 {len(template.components)} 个，部署 {len(template.deployments)} 个。")

    def _validate_stage_section(
        self,
        table_name: str,
        array_name: str,
        raw: Dict[str, Any],
        report: CheckReport,
        source_map: TemplateSourceMap,
    ) -> List[str]:
        section = raw.get(table_name)
        items = raw.get(array_name) or []
        if section is None:
            return []
        if not isinstance(section, dict):
            report.error("区块类型错误", f"`[{table_name}]` 必须是普通表。", source_map.table(table_name))
            return []
        self._warn_unknown_fields(section, {"env_output", "env_input", "list"}, report, lambda key: source_map.table(table_name, key))
        self._require_bool(section, "env_output", report, source_map.table(table_name, "env_output"), required=True)
        self._require_bool(section, "env_input", report, source_map.table(table_name, "env_input"), required=True)
        if "list" not in section:
            report.error("缺少区块执行顺序列表", f"`[{table_name}]` 必须声明 `list`。", source_map.table(table_name))
            return []
        value = section.get("list")
        if not isinstance(value, list):
            report.error("区块执行顺序类型错误", f"`{table_name}.list` 必须是字符串数组。", source_map.table(table_name, "list"))
            return []
        order: List[str] = []
        seen: set[str] = set()
        for item in value:
            if not isinstance(item, str) or not item.strip():
                report.error("区块执行顺序项非法", f"`{table_name}.list` 中只能包含非空字符串。", source_map.table(table_name, "list"))
                continue
            item_id = item.strip()
            order.append(item_id)
            if item_id in seen:
                report.warn("区块执行顺序存在重复项", f"`{table_name}.list` 中的 `{item_id}` 重复出现。", source_map.table(table_name, "list"))
            seen.add(item_id)
        if items and not order:
            report.error("区块执行顺序为空", f"声明了 `{array_name}`，但 `{table_name}.list` 为空，相关项将不会被执行。", source_map.table(table_name, "list"))
        return order

    def _validate_stage_order(
        self,
        label: str,
        ordered_ids: Sequence[str],
        actual_ids: Sequence[str],
        report: CheckReport,
        location: CheckLocation,
        array_name: str,
    ) -> None:
        actual_set = set(actual_ids)
        for item_id in ordered_ids:
            if item_id not in actual_set:
                report.error("执行顺序引用了未定义项", f"`{label}` 中的 `{item_id}` 在 `[[{array_name}]]` 中没有对应定义。", location)
        for item_id in actual_ids:
            if ordered_ids and item_id not in ordered_ids:
                report.error("存在未进入执行顺序的定义", f"`[[{array_name}]]` 中定义了 `{item_id}`，但它没有出现在 `{label}` 中，运行时将被忽略。", location)

    def _validate_choose_list(self, item: Dict[str, Any], report: CheckReport, location: CheckLocation, get_method: str) -> None:
        if "choose_list" not in item:
            report.error("缺少 choose_list", "`user_choose = true` 时必须显式声明 `choose_list`。可用 `[]` 或 `[0]` 表示展示全部版本。", location)
            return
        value = item.get("choose_list")
        if not isinstance(value, list):
            report.error("choose_list 类型错误", "`choose_list` 必须是数组。", location)
            return
        for entry in value:
            if isinstance(entry, bool) or not isinstance(entry, (str, int)):
                report.error("choose_list 元素类型非法", "`choose_list` 只能包含字符串版本号或整数数量。", location)
                return
            if isinstance(entry, int) and entry < 0:
                report.error("choose_list 整数值非法", "`choose_list` 中的整数不能为负数。", location)
                return
        if get_method != "get_version":
            report.warn("user_choose 可能不会生效", "`choose_list` 主要用于版本选择；如果当前项不是 `get_method = \"get_version\"`，请确认这是你想要的行为。", location)

    def _validate_version_formula(self, item: Dict[str, Any], report: CheckReport, location: CheckLocation) -> None:
        value = item.get("version_formatting_formula")
        if not isinstance(value, list) or not value:
            report.error("version_formatting_formula 缺失", "`format_version = true` 时必须提供非空 `version_formatting_formula`。", location)
            return
        for rule in value:
            if not isinstance(rule, dict):
                report.error("version_formatting_formula 项非法", "格式化规则中的每一项都必须是内联表。", location)
                return
            match = str(rule.get("match", "") or "")
            if not match:
                report.error("version_formatting_formula.match 缺失", "每条格式化规则都必须提供 `match`。", location)
                return
            self._validate_regex(match, report, location, "version_formatting_formula.match")

    def _validate_install_custom_list(self, item: Dict[str, Any], report: CheckReport, location: CheckLocation) -> None:
        value = item.get("install_custom_list")
        if not isinstance(value, list) or not value:
            report.error("install_custom_list 缺失", "`install_operate = \"custom\"` 时必须提供非空 `install_custom_list`。", location)
            return
        seen_extensions: set[str] = set()
        for rule in value:
            if not isinstance(rule, dict):
                report.error("install_custom_list 项非法", "自定义安装规则中的每一项都必须是内联表。", location)
                return
            extension = str(rule.get("extension", "") or "").strip().lower()
            if not extension:
                report.error("install_custom_list.extension 缺失", "每条自定义安装规则都必须声明 `extension`。", location)
                return
            if not extension.startswith("."):
                report.warn("install_custom_list.extension 建议以点号开头", f"当前扩展名 `{extension}` 建议写成 `.zip` 这样的格式。", location)
            if extension in seen_extensions:
                report.warn("install_custom_list 扩展名重复", f"扩展名 `{extension}` 在自定义安装规则中重复出现。", location)
            seen_extensions.add(extension)
            if not isinstance(rule.get("operate"), bool):
                report.error("install_custom_list.operate 类型错误", "每条自定义安装规则都必须声明布尔值 `operate`。", location)
                return

    def _validate_stage_path_value(self, field_name: str, path_value: str, custom_path: str, report: CheckReport, location: CheckLocation) -> None:
        self._validate_path_token(path_value, report, location)
        if path_value == "$CustomPath":
            if not custom_path:
                report.error("custom_path 缺失", f"`{field_name} = \"$CustomPath\"` 时必须提供 `custom_path`。", location)
                return
            if custom_path != "$input$":
                self._validate_path_token(custom_path, report, location)
        elif custom_path:
            report.warn("custom_path 将被忽略", f"只有 `{field_name} = \"$CustomPath\"` 时 `custom_path` 才会生效。", location)

    def _validate_path_token(self, value: str, report: CheckReport, location: CheckLocation) -> None:
        stripped = str(value or "").strip()
        if stripped.startswith("$") and stripped not in KNOWN_PATH_VARIABLES and "{{" not in stripped:
            report.error("路径变量非法", f"未在开发文档中声明的路径变量: `{stripped}`。", location)

    def _validate_version_provider(self, item: Dict[str, Any], source: str, report: CheckReport, location: CheckLocation, template_root: Path) -> None:
        if source == "github_repo":
            github_repo = str(item.get("github_repo", "") or "").strip()
            if not github_repo:
                report.error("github_repo 缺失", "`get_version = \"github_repo\"` 时必须提供 `github_repo`。", location)
            elif not GITHUB_REPO_PATTERN.match(github_repo):
                report.warn("github_repo 形态可疑", "当前 GitHub 仓库地址看起来不像标准的仓库首页链接。", location)
            return
        if source == "filelink":
            self._validate_provider_source(item, FILELINK_FIELD_ALIASES, "文件链接来源", report, location, template_root)
            return
        if source == "custom":
            self._validate_provider_source(item, SCRIPT_FIELD_ALIASES, "脚本来源", report, location, template_root)

    def _validate_link_provider(self, item: Dict[str, Any], source: str, report: CheckReport, location: CheckLocation, template_root: Path) -> None:
        if source == "user_input":
            if item.get("get_link_provide_list"):
                report.warn("get_link_provide_list 将被忽略", "`get_link = \"user_input\"` 时下载链接来自用户输入，候选列表不会生效。", location)
            return
        provide_list = item.get("get_link_provide_list")
        if provide_list is not None:
            if not isinstance(provide_list, list) or not all(isinstance(entry, str) and entry.strip() for entry in provide_list):
                report.error("get_link_provide_list 类型非法", "`get_link_provide_list` 必须是非空字符串数组。", location)
                return
        allow_missing = isinstance(provide_list, list) and bool(provide_list)
        if source == "filelink":
            self._validate_provider_source(item, FILELINK_FIELD_ALIASES, "文件链接来源", report, location, template_root, allow_missing=allow_missing)
            return
        if source == "custom":
            self._validate_provider_source(item, SCRIPT_FIELD_ALIASES, "脚本来源", report, location, template_root, allow_missing=allow_missing)

    def _validate_provider_source(
        self,
        item: Dict[str, Any],
        aliases: Sequence[str],
        label: str,
        report: CheckReport,
        location: CheckLocation,
        template_root: Path,
        allow_missing: bool = False,
    ) -> None:
        raw_value = ""
        for alias in aliases:
            current = str(item.get(alias, "") or "").strip()
            if current:
                raw_value = current
                break
        if not raw_value:
            if allow_missing:
                return
            report.error("缺少来源字段", f"当前配置需要提供 {label}。运行时兼容字段包括: {', '.join(aliases)}。", location)
            return
        normalized = self._normalize_provider_source_path(raw_value, template_root)
        if normalized.startswith("http://") or normalized.startswith("https://"):
            return
        local_path = Path(normalized[8:]) if normalized.startswith("file:///") else Path(normalized)
        if not local_path.exists():
            report.error("来源文件不存在", f"配置的 {label} `{raw_value}` 无法在本地解析到实际文件。", location)

    def _validate_splicing_link(self, splicing_link: str, item_id: str, report: CheckReport, location: CheckLocation) -> None:
        if f"{{{{version|{item_id}}}}}" not in splicing_link:
            report.error("splicing_link 未使用当前项的版本占位符", f"`splicing_link` 必须包含 `{{{{version|{item_id}}}}}`，否则版本号无法被正确拼接到下载链接中。", location)

    def _warn_command_mode_fields(
        self,
        stage_name: str,
        item_id: str,
        item: Dict[str, Any],
        fields: set[str],
        report: CheckReport,
        location: CheckLocation,
    ) -> None:
        declared = [field for field in fields if field in item and self._is_meaningful_value(item.get(field))]
        if not declared:
            return
        report.warn(
            f"{stage_name}项在命令行模式下同时声明了声明式规则",
            f"`{item_id}` 开启了命令行模式，同时又声明了这些字段: {', '.join(sorted(declared))}。这在语法上合法，但容易让模板作者误判哪些字段会被自动执行；通常建议只保留命令列表和必要的路径/环境定义。",
            location,
        )

    def _validate_env_lists(
        self,
        item: Dict[str, Any],
        env_output: bool,
        env_input: bool,
        report: CheckReport,
        source_map: TemplateSourceMap,
        section: str,
        index: int,
        item_id: str,
        raw: Dict[str, Any],
        template_root: Path,
        component_ids: set[str],
        deployment_ids: set[str],
        launch_ids: set[str],
        config_ids: set[str],
    ) -> None:
        if env_output:
            self._validate_env_binding_list(item, "env_output_list", report, source_map.array_field(section, index, "env_output_list", item_id), raw, template_root, component_ids, deployment_ids, launch_ids, config_ids)
        elif item.get("env_output_list"):
            report.warn("env_output_list 将被忽略", "`env_output = false` 时导出列表不会生效。", source_map.array_field(section, index, "env_output_list", item_id))

        if env_input:
            self._validate_env_binding_list(item, "env_input_list", report, source_map.array_field(section, index, "env_input_list", item_id), raw, template_root, component_ids, deployment_ids, launch_ids, config_ids)
        elif item.get("env_input_list"):
            report.warn("env_input_list 将被忽略", "`env_input = false` 时导入列表不会生效。", source_map.array_field(section, index, "env_input_list", item_id))

    def _validate_env_binding_list(
        self,
        item: Dict[str, Any],
        key: str,
        report: CheckReport,
        location: CheckLocation,
        raw: Dict[str, Any],
        template_root: Path,
        component_ids: set[str],
        deployment_ids: set[str],
        launch_ids: set[str],
        config_ids: set[str],
    ) -> None:
        value = item.get(key)
        if not isinstance(value, list) or not value:
            report.error("环境变量绑定列表缺失", f"启用 `{key}` 对应开关时，必须提供非空 `{key}`。", location)
            return
        for binding in value:
            if not isinstance(binding, dict):
                report.error("环境变量绑定项非法", f"`{key}` 中的每一项都必须是内联表。", location)
                return
            name = str(binding.get("name", "") or "").strip()
            if not name:
                report.error("环境变量绑定缺少 name", f"`{key}` 中的每一项都必须提供 `name`。", location)
                return
            if "value" not in binding:
                report.error("环境变量绑定缺少 value", f"`{key}` 中的 `{name}` 缺少 `value`。", location)
                return
            self._validate_text_placeholders(str(binding.get("value", "") or ""), report, location, raw, template_root, set(), component_ids, deployment_ids, launch_ids, config_ids)

    def _read_text_file(self, path: Path) -> str:
        encodings = ("utf-8-sig", "utf-8", "utf-16", "gb18030", "gbk")
        last_error: Exception | None = None
        for encoding in encodings:
            try:
                return path.read_text(encoding=encoding)
            except UnicodeDecodeError as exc:
                last_error = exc
                continue
        if last_error is not None:
            raise last_error
        return path.read_text(encoding="utf-8")

    def _warn_unknown_fields(
        self,
        item: Dict[str, Any],
        allowed_fields: set[str],
        report: CheckReport,
        location_getter: Any,
    ) -> None:
        for key in item.keys():
            if key in allowed_fields:
                continue
            report.warn("发现未文档化字段", f"字段 `{key}` 未在开发文档中声明，请确认不是拼写错误。", location_getter(key))

    def _require_string(
        self,
        item: Dict[str, Any],
        key: str,
        report: CheckReport,
        location: CheckLocation,
        required: bool = True,
    ) -> str:
        if key not in item:
            if required:
                report.error("缺少必填字段", f"`{location.label}` 是开发文档要求的必填字段。", location)
            return ""
        value = item.get(key)
        if not isinstance(value, str) or not value.strip():
            report.error("字段值非法", f"`{location.label}` 必须是非空字符串。", location)
            return ""
        return value.strip()

    def _require_bool(
        self,
        item: Dict[str, Any],
        key: str,
        report: CheckReport,
        location: CheckLocation,
        required: bool = True,
    ) -> bool:
        if key not in item:
            if required:
                report.error("缺少必填字段", f"`{location.label}` 是开发文档要求的必填字段。", location)
            return False
        value = item.get(key)
        if not isinstance(value, bool):
            report.error("字段类型错误", f"`{location.label}` 必须是布尔值。", location)
            return False
        return value

    def _require_command_list(
        self,
        item: Dict[str, Any],
        key: str,
        report: CheckReport,
        location: CheckLocation,
        raw: Dict[str, Any],
        template_root: Path,
        component_ids: set[str],
        deployment_ids: set[str],
        launch_ids: set[str],
        config_ids: set[str],
    ) -> List[str]:
        value = item.get(key)
        if not isinstance(value, list) or not value:
            report.error("命令列表缺失", f"`{location.label}` 必须是非空字符串数组。", location)
            return []
        commands: List[str] = []
        for index, entry in enumerate(value):
            if not isinstance(entry, str) or not entry.strip():
                report.error("命令列表项非法", f"`{location.label}` 的第 {index + 1} 项必须是非空字符串。", location)
                continue
            command = entry.strip()
            commands.append(command)
            self._validate_text_placeholders(
                command,
                report,
                location,
                raw,
                template_root,
                set(),
                component_ids,
                deployment_ids,
                launch_ids,
                config_ids,
            )
        return commands

    @staticmethod
    def _string_list(value: Any) -> List[str]:
        if not isinstance(value, list):
            return []
        result: List[str] = []
        for item in value:
            if isinstance(item, str) and item.strip():
                result.append(item.strip())
        return result

    def _validate_regex(self, pattern: str, report: CheckReport, location: CheckLocation, label: str) -> None:
        try:
            re.compile(pattern)
        except re.error as exc:
            report.error("正则表达式非法", f"`{label}` 无法通过正则编译：{exc}。", location)

    def _validate_text_placeholders(
        self,
        text: str,
        report: CheckReport,
        location: CheckLocation,
        raw: Dict[str, Any],
        template_root: Path,
        imported_files: set[str],
        component_ids: set[str],
        deployment_ids: set[str],
        launch_ids: set[str],
        config_ids: set[str],
    ) -> None:
        if not isinstance(text, str) or "{{" not in text:
            return

        if not imported_files:
            modinfo = raw.get("MODINFO") if isinstance(raw, dict) else None
            if isinstance(modinfo, dict) and modinfo.get("file_import") is True:
                imported_files = {
                    str(item).strip()
                    for item in modinfo.get("file_import_list", [])
                    if isinstance(item, str) and item.strip()
                }

        found = False
        for match in PLACEHOLDER_PATTERN.finditer(text):
            found = True
            inner = str(match.group(1) or "").strip()
            kind, separator, payload = inner.partition("|")
            kind = kind.strip()
            payload = payload.strip()
            if separator != "|" or not kind or not payload:
                report.error("占位符语法错误", f"占位符 `{{{{{inner}}}}}` 必须使用 `{{{{类型|路径}}}}` 形式。", location)
                continue
            if kind not in ALLOWED_PLACEHOLDER_KINDS:
                report.error("占位符类型非法", f"`{kind}` 不是开发文档声明的占位符类型。", location)
                continue

            try:
                if kind == "key":
                    self._resolve_template_key(raw, payload)
                elif kind == "env":
                    if not payload:
                        raise ValueError("环境变量名不能为空")
                elif kind == "install_path":
                    if payload not in component_ids:
                        raise ValueError(f"组件 `{payload}` 未定义")
                elif kind == "deploy_path":
                    if payload not in deployment_ids:
                        raise ValueError(f"部署项 `{payload}` 未定义")
                elif kind == "version":
                    if payload not in component_ids and payload not in deployment_ids:
                        raise ValueError(f"`{payload}` 既不是组件 ID，也不是部署 ID")
                elif kind == "file_path":
                    if payload not in imported_files:
                        raise ValueError(f"导入文件 `{payload}` 未声明或 `file_import` 未启用")
                elif kind == "file_key":
                    self._resolve_file_key(template_root, imported_files, payload)
            except Exception as exc:
                report.error("占位符引用非法", f"`{{{{{kind}|{payload}}}}}` 无法解析：{exc}", location)

        remaining = PLACEHOLDER_PATTERN.sub("", text)
        if ("{{" in remaining or "}}" in remaining) and not found:
            report.error("占位符语法错误", "检测到未闭合或格式不合法的占位符。", location)
        elif "{{" in remaining or "}}" in remaining:
            report.error("占位符语法错误", "字符串中同时存在合法和不合法占位符，请检查括号或分隔符是否完整。", location)

    def _location_from_breadcrumbs(
        self,
        source_map: TemplateSourceMap,
        breadcrumbs: List[str],
        raw: Dict[str, Any],
    ) -> CheckLocation:
        if not breadcrumbs:
            return CheckLocation(source_map.file_path, 1, 1, "root")

        section = breadcrumbs[0]
        if section in TABLE_SECTIONS:
            if len(breadcrumbs) == 1:
                return source_map.table(section)
            return source_map.table(section, breadcrumbs[1])

        if section in ARRAY_SECTIONS and len(breadcrumbs) >= 2 and breadcrumbs[1].isdigit():
            index = int(breadcrumbs[1])
            item_id = self._item_id((raw.get(section) or []), index)
            if len(breadcrumbs) == 2:
                return source_map.array_item(section, index, item_id)
            return source_map.array_field(section, index, breadcrumbs[2], item_id)

        return CheckLocation(source_map.file_path, 1, 1, ".".join(breadcrumbs))

    @staticmethod
    def _item_id(item_or_items: Any, index: int) -> str:
        if isinstance(item_or_items, dict):
            value = str(item_or_items.get("id", "") or item_or_items.get("name", "") or "").strip()
            return value or str(index)
        if isinstance(item_or_items, list) and 0 <= index < len(item_or_items):
            node = item_or_items[index]
            if isinstance(node, dict):
                value = str(node.get("id", "") or node.get("name", "") or "").strip()
                return value or str(index)
        return str(index)

    @staticmethod
    def _is_meaningful_value(value: Any) -> bool:
        if value is None:
            return False
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return bool(value.strip())
        if isinstance(value, (list, tuple, set, dict)):
            return bool(value)
        return True

    def _command_uses_version(self, commands: Sequence[str], item_id: str, section: str, index: int) -> bool:
        version_token = f"{{{{version|{item_id}}}}}"
        splicing_token = f"{{{{key|{section}.{item_id}.splicing_link}}}}"
        index_splicing_token = f"{{{{key|{section}.{index}.splicing_link}}}}"
        return any(
            version_token in command
            or splicing_token in command
            or index_splicing_token in command
            or ".splicing_link" in command
            for command in commands
        )

    @staticmethod
    def _compare_versions(left: str, right: str) -> int:
        def normalize(value: str) -> tuple[List[int], List[str]]:
            text = str(value or "").strip().lstrip("vV")
            if not text:
                return [], []
            main, _, suffix = text.partition("-")
            numeric = [int(part) for part in re.findall(r"\d+", main)]
            suffix_parts = [part for part in re.split(r"[.\-+_]", suffix) if part]
            return numeric, suffix_parts

        left_num, left_suffix = normalize(left)
        right_num, right_suffix = normalize(right)
        max_len = max(len(left_num), len(right_num))
        for index in range(max_len):
            left_part = left_num[index] if index < len(left_num) else 0
            right_part = right_num[index] if index < len(right_num) else 0
            if left_part < right_part:
                return -1
            if left_part > right_part:
                return 1
        if not left_suffix and right_suffix:
            return 1
        if left_suffix and not right_suffix:
            return -1
        if left_suffix < right_suffix:
            return -1
        if left_suffix > right_suffix:
            return 1
        return 0

    def _resolve_file_key(self, template_root: Path, imported_files: set[str], path: str) -> str:
        for filename in sorted(imported_files, key=len, reverse=True):
            if path == filename:
                tree = self._parse_structured_file(template_root / filename)
                return self._stringify_value(tree, path)
            prefix = f"{filename}."
            if path.startswith(prefix):
                tree = self._parse_structured_file(template_root / filename)
                return self._resolve_tree_value(tree, path[len(prefix):].split("."), path)
        raise ValueError(f"导入文件键路径不存在: {path}")

    def _resolve_template_key(self, raw: Dict[str, Any], path: str) -> str:
        segments = [segment for segment in str(path or "").split(".") if segment]
        if not segments:
            raise ValueError("模板键路径不能为空")

        root = segments[0]
        current: Any = raw.get(root)
        if current is None:
            raise ValueError(f"模板键路径不存在: {path}")

        index = 1
        if root in ARRAY_SECTIONS:
            if index >= len(segments):
                raise ValueError(f"不允许直接引用整个表: {path}")
            selector = segments[index]
            index += 1
            if not isinstance(current, list):
                raise ValueError(f"`{root}` 不是表数组: {path}")
            if selector.isdigit():
                selector_index = int(selector)
                if selector_index >= len(current):
                    raise ValueError(f"模板键索引越界: {path}")
                current = current[selector_index]
            else:
                current = next(
                    (
                        item
                        for item in current
                        if isinstance(item, dict)
                        and str(item.get("id", "") or item.get("name", "")).strip() == selector
                    ),
                    None,
                )
                if current is None:
                    raise ValueError(f"模板键路径不存在: {path}")

        return self._resolve_tree_value(current, segments[index:], path)

    def _resolve_tree_value(self, current: Any, segments: Sequence[str], raw_path: str) -> str:
        node = current
        for segment in segments:
            if isinstance(node, list):
                if segment == "length":
                    return str(len(node))
                if not segment.isdigit():
                    raise ValueError(f"数组访问必须使用索引: {raw_path}")
                index = int(segment)
                if index >= len(node):
                    raise ValueError(f"数组索引越界: {raw_path}")
                node = node[index]
                continue
            if isinstance(node, dict):
                if segment not in node:
                    raise ValueError(f"键路径不存在: {raw_path}")
                node = node[segment]
                continue
            raise ValueError(f"键路径无法继续解析: {raw_path}")
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
            raise ValueError(f"不允许直接引用整个内联表: {raw_path}")
        return str(value)

    def _parse_structured_file(self, file_path: Path) -> Any:
        text = self._read_text_file(file_path)
        lower_name = file_path.name.lower()
        if lower_name.endswith(".json"):
            return json.loads(text)
        if lower_name.endswith(".toml"):
            return toml_reader.loads(text)
        if lower_name.endswith(".xml"):
            root = ElementTree.fromstring(text)
            return self._xml_to_tree(root)
        return [line.rstrip("\n") for line in text.splitlines()]

    def _xml_to_tree(self, node: ElementTree.Element) -> Dict[str, Any]:
        children = list(node)
        if not children:
            return {node.tag: (node.text or "").strip()}
        grouped: Dict[str, List[Any]] = {}
        for child in children:
            grouped.setdefault(child.tag, []).append(self._xml_to_tree(child)[child.tag])
        result: Dict[str, Any] = {}
        for key, items in grouped.items():
            result[key] = items[0] if len(items) == 1 else items
        return {node.tag: result}

    def _normalize_provider_source_path(self, source: str, template_root: Path) -> str:
        value = str(source or "").strip()
        if not value:
            return ""
        if re.match(r"^(?:https?://|file:///)", value, re.I):
            return value
        expanded = os.path.expandvars(os.path.expanduser(value))
        if os.path.isabs(expanded):
            return expanded
        return os.path.abspath(os.path.join(str(template_root), expanded))
