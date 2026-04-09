from __future__ import annotations

import os
from typing import Dict

from rich.console import Console
from rich.text import Text

from ...utils.common import setup_console
from .checker import CheckIssue, CheckReport, DeploymentModTemplateChecker
from .versioning import get_current_mod_schema_version, get_mod_version_file_path


class DeploymentModTestCliRunner:
    STYLE_MAP: Dict[str, tuple[str, str, str]] = {
        "ok": ("#4DA3FF", "#1F4E79", "[OK]"),
        "warning": ("#FFD24D", "#8C6D00", "[WARN]"),
        "error": ("#FF5F5F", "#7F1D1D", "[ERR]"),
    }

    def __init__(self) -> None:
        self.checker = DeploymentModTemplateChecker()
        self.console = Console(highlight=False)

    def run(self, template_path: str) -> int:
        setup_console()
        resolved_path = self._resolve_template_path(template_path)
        report = self.checker.check(resolved_path)
        self._render_report(report)
        return 0 if report.success else 1

    def _render_report(self, report: CheckReport) -> None:
        try:
            standard_version = get_current_mod_schema_version()
            version_file_text = str(get_mod_version_file_path())
        except Exception as exc:
            standard_version = f"读取失败: {exc}"
            version_file_text = str(get_mod_version_file_path())
        self.console.print()
        self.console.print(
            Text("DeploymentMOD 模板语法检测", style="bold #4DA3FF"),
        )
        self.console.print(
            Text(f"模板路径: {report.template_path}", style="#1F4E79"),
        )
        self.console.print(
            Text(
                f"检测标准: 严格对齐 MOD/MCStart_部署模版开发文档.md / "
                f"当前标准版本 {standard_version} "
                f"（{version_file_text}）",
                style="#1F4E79",
            ),
        )
        self.console.print()

        for index, issue in enumerate(report.issues, start=1):
            self._render_issue(index, issue)

        summary = Text()
        if report.success:
            summary.append("检测通过", style="bold #4DA3FF")
        else:
            summary.append("检测失败", style="bold #FF5F5F")
        summary.append(
            f"  健康 {report.ok_count}  警告 {report.warning_count}  错误 {report.error_count}",
            style="#1F4E79" if report.success else "#7F1D1D",
        )
        self.console.print()
        self.console.print(summary)
        self.console.print()

    def _render_issue(self, index: int, issue: CheckIssue) -> None:
        primary, secondary, prefix = self.STYLE_MAP.get(issue.severity, ("white", "grey50", "[INFO]"))

        headline = Text(style=primary)
        headline.append(f"{prefix} ")
        headline.append(f"{index:02d}. {issue.title}")
        self.console.print(headline)

        if issue.location is not None:
            self.console.print(Text(f"     位置: {issue.location.render()}", style=secondary))
        if issue.detail:
            for line in str(issue.detail).splitlines():
                self.console.print(Text(f"     说明: {line}", style=secondary))

    @staticmethod
    def _resolve_template_path(template_path: str) -> str:
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
        return resolved_path


deployment_mod_test_cli_runner = DeploymentModTestCliRunner()
