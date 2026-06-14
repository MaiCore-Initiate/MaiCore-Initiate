from __future__ import annotations

import os
import re
import sys
import threading
import time
import math
import unicodedata
from collections import deque
from typing import Any, Callable, Deque, Dict, Iterable, List, Optional

from rich import box
from rich.align import Align
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


class _DirectoryChange:
    def __init__(self, old_path: str, new_path: str) -> None:
        self.old_path = old_path
        self.new_path = new_path


class _CommandEntry:
    def __init__(
        self,
        *,
        entry_id: int,
        session_id: int,
        command_index: int,
        label: str,
        runtime: str,
        runtime_label: str,
        command: str,
        cwd: str,
        command_theme: str,
    ) -> None:
        self.entry_id = entry_id
        self.session_id = session_id
        self.command_index = command_index
        self.label = label
        self.runtime = runtime
        self.runtime_label = runtime_label
        self.command = command
        self.cwd_initial = cwd
        self.cwd_current = cwd
        self.command_theme = command_theme or "classical"
        self.status = "pending"
        self.returncode: Optional[int] = None
        self.detached_pid: Optional[int] = None
        self.output_lines: List[str] = []
        self.clear_points: List[int] = []
        self.directory_changes: List[_DirectoryChange] = []

    @property
    def preview_output_start(self) -> int:
        return self.clear_points[-1] if self.clear_points else 0


class _TemplateExecutionDisplay:
    """命令行模板执行期的 Rich 动画与命令检视展示器。"""

    HISTORY_LIMIT = 18
    PREVIEW_OUTPUT_LINES = 5
    PREVIEW_ENTRY_LIMIT = 3

    def __init__(self, title: str) -> None:
        self.title = title
        self.current_step = 0
        self.total_steps = 0
        self.current_stage = "等待执行"
        self.current_message = "准备开始..."
        self.history: Deque[tuple[str, str]] = deque(maxlen=self.HISTORY_LIMIT)
        self.download_tasks: Dict[str, TaskID] = {}
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
        self._lock = threading.RLock()
        self._stop_input = threading.Event()
        self._input_thread: Optional[threading.Thread] = None
        self._command_entries: List[_CommandEntry] = []
        self._session_entries: Dict[int, List[int]] = {}
        self._entry_lookup: Dict[int, _CommandEntry] = {}
        self._active_session_id = 0
        self._active_command_id: Optional[int] = None
        self._selected_command_id: Optional[int] = None
        self._view_mode = False
        self._preview_anchor_id = 1

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
        self._start_input_listener()

    def stop(self) -> None:
        if not self._started:
            return
        self._stop_input.set()
        if self._input_thread is not None:
            self._input_thread.join(timeout=1)
            self._input_thread = None
        self.live.stop()
        self._started = False

    def __rich__(self) -> Group:
        with self._lock:
            renderables: List[Any] = [self._render_status_panel()]
            if self.download_tasks:
                renderables.append(
                    Panel(
                        self.progress,
                        title="[bold]下载进度[/bold]",
                        title_align="left",
                        border_style=ui.colors["border"],
                    )
                )
            command_panel = self._render_command_panel()
            if command_panel is not None:
                renderables.append(command_panel)
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
        should_wait_for_exit = False
        with self._lock:
            if event == "download":
                self._update_download(step_name=step_name, status=status, message=message, **payload)
            elif event == "command":
                should_wait_for_exit = self._update_command(step_name=step_name, status=status, message=message, **payload)
            elif event == "command_meta":
                self._update_command_meta(step_name=step_name, **payload)
            elif event == "command_output":
                self._update_command_output(step_name=step_name, message=message, **payload)
            elif event == "detail":
                self._update_detail(step=step, total_steps=total_steps, step_name=step_name, status=status, message=message)
            else:
                self._update_stage(step=step, total_steps=total_steps, step_name=step_name, status=status, message=message)
            self._refresh()

        if should_wait_for_exit:
            while self._started:
                with self._lock:
                    if not self._view_mode:
                        break
                    self.current_message = "命令已结束；退出命令检视模式后继续后续步骤"
                    self._refresh()
                time.sleep(0.05)

    def _update_command(self, *, step_name: str, status: str, message: str, **payload: Any) -> bool:
        command_status = str(payload.get("command_status") or status or "running")
        runtime = str(payload.get("runtime") or "").strip().lower()
        runtime_label = str(payload.get("runtime_label") or payload.get("runtime") or "shell")
        cwd = str(payload.get("cwd") or "")
        commands = [str(item) for item in list(payload.get("commands") or []) if str(item).strip()]
        primary_command = str(payload.get("primary_command") or message or "")
        command_theme = str(payload.get("command_theme") or "")
        returncode = payload.get("returncode")
        pid = payload.get("pid")

        if command_status == "started":
            session_id = len(self._session_entries) + 1
            self._active_session_id = session_id
            session_command_ids: List[int] = []
            if not commands:
                commands = [primary_command] if primary_command else []
            for index, command in enumerate(commands):
                entry_id = len(self._command_entries) + 1
                entry = _CommandEntry(
                    entry_id=entry_id,
                    session_id=session_id,
                    command_index=index,
                    label=step_name,
                    runtime=runtime,
                    runtime_label=runtime_label,
                    command=command,
                    cwd=cwd,
                    command_theme=command_theme,
                )
                self._command_entries.append(entry)
                self._entry_lookup[entry_id] = entry
                session_command_ids.append(entry_id)
            self._session_entries[session_id] = session_command_ids
            self._active_command_id = session_command_ids[0] if session_command_ids else None
            if self._selected_command_id is None or not self._view_mode:
                self._selected_command_id = self._active_command_id
            self.current_message = self._compact_message(message) or f"{step_name} 正在执行"
            return False

        entry = self._get_active_entry()
        if entry is None and self._active_session_id in self._session_entries:
            session_ids = self._session_entries[self._active_session_id]
            if session_ids:
                entry = self._entry_lookup.get(session_ids[-1])
        if entry is not None:
            entry.status = command_status
            entry.returncode = self._safe_int(returncode) if returncode not in (None, "") else None
            entry.detached_pid = self._safe_int(pid) if pid not in (None, "") else None
        summary = self._compact_message(message) or f"{step_name} 已结束"
        if command_status == "detached" and entry is not None and entry.detached_pid:
            summary = f"{summary} (PID: {entry.detached_pid})"
        if command_status in {"completed", "failed"} and entry is not None and entry.returncode is not None:
            summary = f"{summary} (返回码: {entry.returncode})"
        self._append_history("failed" if command_status == "failed" else "completed", f"{step_name}: {summary}")
        self.current_message = summary
        return self._view_mode and command_status in {"completed", "failed", "detached"}

    def _update_command_meta(self, *, step_name: str, **payload: Any) -> None:
        _ = step_name
        meta_type = str(payload.get("meta_type") or "")
        command_index = self._safe_int(payload.get("command_index"))
        entry = self._get_session_entry(command_index)
        if entry is None:
            return
        if meta_type == "begin":
            active = self._get_active_entry()
            if active is not None and active.entry_id != entry.entry_id and active.status == "running":
                active.status = "completed"
            entry.status = "running"
            if payload.get("command"):
                entry.command = str(payload.get("command") or entry.command)
            self._active_command_id = entry.entry_id
            if self._selected_command_id is None or not self._view_mode:
                self._selected_command_id = entry.entry_id
            return
        if meta_type == "cwd":
            cwd = str(payload.get("cwd") or "")
            if cwd and cwd != entry.cwd_current:
                entry.directory_changes.append(_DirectoryChange(entry.cwd_current, cwd))
                entry.cwd_current = cwd
            return
        if meta_type == "clear":
            entry.clear_points.append(len(entry.output_lines))
            self._preview_anchor_id = entry.entry_id

    def _update_command_output(self, *, step_name: str, message: str, **payload: Any) -> None:
        _ = step_name
        entry = None
        if payload.get("command_index") not in (None, ""):
            entry = self._get_session_entry(self._safe_int(payload.get("command_index")))
        if entry is None:
            entry = self._get_active_entry()
        if entry is None or not message:
            return
        for line in message.splitlines() or [message]:
            entry.output_lines.append(line.rstrip("\r\n"))
        if entry.status == "pending":
            entry.status = "running"
        self._active_command_id = entry.entry_id
        if self._selected_command_id is None or not self._view_mode:
            self._selected_command_id = entry.entry_id

    def _update_detail(self, *, step: int, total_steps: int, step_name: str, status: str, message: str) -> None:
        detail = self._format_detail(step, total_steps, step_name, message)
        compact_message = self._compact_message(message)
        if step and total_steps:
            self.current_step = step
            self.total_steps = total_steps
        if step_name:
            self.current_stage = step_name
        if compact_message:
            self.current_message = compact_message
        self._append_history(status, detail)

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
        if self._view_mode:
            if body:
                body.append("\n")
            body.append("命令检视模式已启用，按 Ctrl + O 退出，按 R/L 切换命令。", style="bold cyan")
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

    def _render_command_panel(self) -> Optional[Panel]:
        if not self._command_entries:
            return None
        if self._view_mode:
            content = self._render_command_view()
            title = "[bold]命令检视模式[/bold]"
            border_style = ui.colors["primary"]
        else:
            content = self._render_command_preview()
            title = "[bold]命令运行[/bold]"
            border_style = ui.colors["border"]
        return Panel(content, title=title, title_align="left", border_style=border_style, box=box.ASCII)

# === PATCH 5: 修复 _render_command_preview 底部分割线和提示 ===
# 找到 def _render_command_preview(self) -> Group: 方法
# 替换整个方法体

    def _render_command_preview(self) -> Group:
        visible_entries = [entry for entry in self._command_entries if entry.entry_id >= self._preview_anchor_id]
        visible_entries = visible_entries[-self.PREVIEW_ENTRY_LIMIT:]
        renderables: List[Any] = []
        for index, entry in enumerate(visible_entries):
            if index:
                renderables.append(Text("─" * max(12, ui.console.size.width - 12), style="grey35"))
            renderables.append(self._render_preview_entry(entry))

        # 底部全宽分割线
        renderables.append(Text("─" * ui.console.size.width, style="grey35"))
        # 状态提示
        running_entry = self._get_active_entry()
        if running_entry and running_entry.status == "running":
            extra = len(running_entry.output_lines) - running_entry.preview_output_start - self.PREVIEW_OUTPUT_LINES
            if extra > 0:
                renderables.insert(-1, Text(f"      ... +{extra} line{'s' if extra > 1 else ''}", style="grey42"))
        renderables.append(Text("Running, press Ctrl + O to enter command view mode.", style="cyan"))
        return Group(*renderables)

# === PATCH 6: 修复 _render_preview_entry 中输出行超出后的省略计数 ===
# 找到 def _render_preview_entry(self, entry: _CommandEntry) -> Group:
# 替换整个方法体

    def _render_preview_entry(self, entry: _CommandEntry) -> Group:
        renderables = self._render_entry_header(entry, preview=True)
        width = max(20, ui.console.size.width - 20)
        preview_lines = entry.output_lines[entry.preview_output_start:]
        if not preview_lines:
            renderables.append(Text("  └── <等待输出>", style="grey54"))
            return Group(*renderables)

        shown_lines = preview_lines[:self.PREVIEW_OUTPUT_LINES]
        for idx, raw_line in enumerate(shown_lines):
            is_first = idx == 0 and not entry.directory_changes
            prefix = "  └── " if is_first else "      "
            line = Text(prefix, style="grey42")
            line.append_text(self._render_output_line(raw_line, preview=True, width=width))
            renderables.append(line)
        extra = len(preview_lines) - self.PREVIEW_OUTPUT_LINES
        if extra > 0:
            renderables.append(Text(f"      ... +{extra} line{'s' if extra > 1 else ''}", style="grey42"))
        return Group(*renderables)

    def _render_entry_header(self, entry: _CommandEntry, *, preview: bool) -> List[Any]:
        width = max(20, ui.console.size.width - 20)
        header_lines = self._wrap_text(entry.command or "", width)
        runtime_prefix = Text()
        runtime_prefix.append("● ", style=self._command_dot_style(entry))
        runtime_prefix.append(f"{entry.runtime_label} ", style="bold white")
        header_first = runtime_prefix.copy()
        command_chunks = self._highlight_command(header_lines[0] if header_lines else "", entry.runtime, preview=preview)
        header_first.append_text(command_chunks)
        renderables: List[Any] = [header_first]
        for extra in header_lines[1:]:
            line = Text("  │   ", style="grey42")
            line.append_text(self._highlight_command(extra, entry.runtime, preview=preview))
            renderables.append(line)

        cwd_text = self._format_workdir(entry.cwd_current or entry.cwd_initial, entry.command_theme)
        cwd_lines = self._wrap_path(cwd_text, width)
        for idx, chunk in enumerate(cwd_lines):
            prefix = "  ├── " if idx == 0 else "  │   "
            line = Text(prefix, style="grey42")
            line.append(chunk, style="grey54" if preview else "#4DA3FF")
            renderables.append(line)
        return renderables

    def _render_command_view(self) -> Group:
        entry = self._selected_entry()
        if entry is None:
            return Group(Text("暂无可查看的命令输出。", style="grey58"))
        renderables: List[Any] = list(self._render_entry_header(entry, preview=False))
        if entry.directory_changes:
            for change in entry.directory_changes:
                text = Text()
                text.append(change.old_path, style="#1F4E79")
                text.append(" -> ", style="grey54")
                text.append(change.new_path, style="#4DA3FF")
                renderables.append(Panel(text, border_style="grey50", box=box.ROUNDED, expand=False))
        clear_points = list(entry.clear_points)
        if entry.output_lines:
            for idx, raw_line in enumerate(entry.output_lines):
                if clear_points and idx == clear_points[0]:
                    renderables.append(Text("  ├" + "─" * max(8, ui.console.size.width - 22), style="grey35"))
                    clear_points.pop(0)
                prefix = "  └── " if idx == 0 else "      "
                line = Text(prefix, style="grey42")
                line.append_text(self._render_output_line(raw_line, preview=False, width=max(20, ui.console.size.width - 20)))
                renderables.append(line)
            while clear_points:
                renderables.append(Text("  ├" + "─" * max(8, ui.console.size.width - 22), style="grey35"))
                clear_points.pop(0)
        else:
            renderables.append(Text("  └── <当前命令尚未产生输出>", style="grey58"))
        renderables.append(Align.center(self._render_command_footer(), vertical="middle"))
        return Group(*renderables)

    def _render_command_footer(self) -> Text:
        total = len(self._command_entries)
        selected = self._selected_command_position()
        footer = Text()
        has_prev = selected > 1
        has_next = selected < total
        if has_prev:
            footer.append("<- ", style="cyan")
            footer.append("(R) ", style="bold cyan")
        else:
            footer.append("(R) ", style="grey42")
        indexes = self._command_footer_indexes(total, selected)
        last_value = 0
        for value in indexes:
            if footer.plain and not footer.plain.endswith(" "):
                footer.append(" ")
            if last_value and value - last_value > 1:
                footer.append("... ", style="grey42")
            if value == selected:
                footer.append("●", style="bold white")
            else:
                footer.append(str(value), style="cyan")
            last_value = value
        footer.append(" ")
        if has_next:
            footer.append("(L) ", style="bold cyan")
            footer.append("->", style="cyan")
        else:
            footer.append("(L)", style="grey42")
        footer.append(" | Press Ctrl + O to exit command view.", style="grey58")
        return footer

    @staticmethod
    def _command_footer_indexes(total: int, selected: int) -> List[int]:
        if total <= 9:
            return list(range(1, total + 1))
        start = max(1, selected - 4)
        end = min(total, selected + 4)
        return list(range(start, end + 1))

# === PATCH 3: 替换 _render_output_line 方法 ===
# 找到 def _render_output_line(self, raw_line: str, *, preview: bool, width: int) -> Text:
# 替换整个方法体

    def _render_output_line(self, raw_line: str, *, preview: bool, width: int) -> Text:
        """
        渲染输出行：
        - preview 模式：所有颜色暗一级，超宽截断并留 "..." （提前 3 字符）
        - view 模式：原样显示，不截断
        """
        text = Text.from_ansi(str(raw_line or ""))
        if preview:
            text.stylize("dim")
        if not preview:
            return text

        # 计算可见宽度并截断（考虑中文等宽字符）
        max_visible = max(8, width - 3)  # 预留 3 字符给 "..."
        plain = text.plain
        visible_width = 0
        cut_index = len(plain)
        for i, ch in enumerate(plain):
            # 东亚宽字符占 2 列            
            char_width = 2 if unicodedata.east_asian_width(ch) in ("W", "F") else 1
            if visible_width + char_width > max_visible:
                cut_index = i
                break
            visible_width += char_width

        if cut_index < len(plain):
            # 获取截断点前最后一个字符的样式，用于 "..." 的颜色
            truncated = text[:cut_index]
            # 附加 "..."，继承末尾样式
            last_style = text.get_style_at_offset(max(0, cut_index - 1))
            ellipsis = Text("...", style=last_style)
            if preview:
                ellipsis.stylize("dim")
            truncated.append_text(ellipsis)
            return truncated

        return text

    # === PATCH 1: 替换整个 _highlight_command 方法 ===
# 找到 def _highlight_command(self, command: str, runtime: str, *, preview: bool) -> Text:
# 替换为以下完整方法（约第 260-350 行的整个方法体）

    def _highlight_command(self, command: str, runtime: str, *, preview: bool) -> Text:
        """对命令字符串进行语法高亮，根据 runtime 微调规则。"""
        text = Text(str(command or ""))
        plain = text.plain
        if not plain:
            if preview:
                text.stylize("dim")
            return text

        length = len(plain)
        claimed = [False] * length

        def _claim(start: int, end: int) -> bool:
            if any(claimed[start:end]):
                return False
            for i in range(start, end):
                claimed[i] = True
            return True

        def stylize_first(pattern: str, style: str, flags: int = 0, group: int = 0) -> None:
            for m in re.finditer(pattern, plain, flags):
                s, e = m.start(group), m.end(group)
                if s < e and _claim(s, e):
                    text.stylize(style, s, e)

        is_ps = runtime in {"pwsh", "powershell"}
        is_cmd = runtime in {"cmd", "bat"}
        is_node = runtime in {"node", "bun", "deno"}
        is_posix = runtime in {"bash", "sh", "zsh", "fish", ""}

        # ── 1. Comments ──
        if is_ps:
            stylize_first(r"(?:^|(?<=\s))#.*$", "dim italic grey58", re.MULTILINE)
        elif is_cmd:
            stylize_first(r"(?:^|(?<=\s))(?:REM|::)\s.*$", "dim italic grey58", re.MULTILINE | re.IGNORECASE)
        elif not is_node:
            stylize_first(r"(?:^|(?<=\s))#.*$", "dim italic grey58", re.MULTILINE)

        # ── 2. Strings ──
        # Backtick strings (JS/TS)
        if is_node:
            stylize_first(r"`[^`\\]*(?:\\.[^`\\]*)*`", "green")
        stylize_first(r'"[^"\\]*(?:\\.[^"\\]*)*"', "green")
        stylize_first(r"'[^'\\]*(?:\\.[^'\\]*)*'", "green")

        # ── 3. Here-strings (bash/pwsh) ──
        if is_posix:
            stylize_first(r"<<-?\s*['\"]?(\w+)['\"]?.*?\n.*?\1", "green dim", re.DOTALL)
        if is_ps:
            stylize_first(r"@[\"'][\s\S]*?[\"']@", "green")

        # ── 4. Template / interpolation ──
        stylize_first(r"\{\{[^{}]*\}\}", "bright_magenta bold")
        stylize_first(r"\$\{[^}]*\}", "bright_magenta")
        if is_posix or is_ps:
            stylize_first(r"\$\([^)]*\)", "bright_magenta")

        # ── 5. Environment variables ──
        if is_ps:
            stylize_first(r"\$(?:env:)?[A-Za-z_][A-Za-z0-9_]*", "magenta")
        elif is_cmd:
            stylize_first(r"%[A-Za-z_][A-Za-z0-9_]*%", "magenta")
            stylize_first(r"%~?[0-9dpnx]+", "magenta")
        else:
            stylize_first(r"\$[A-Za-z_][A-Za-z0-9_]*", "magenta")

        # ── 6. Operators ──
        stylize_first(r"2>&1|1>&2", "bright_yellow bold")
        stylize_first(r"[12]?>>|[12]?>|<", "bright_yellow bold")
        stylize_first(r"\|{1,2}|&&|;{1,2}", "bright_yellow bold")
        if is_ps:
            stylize_first(r"`(?=\s*$)", "bright_yellow", re.MULTILINE)
            stylize_first(r"(?:^|(?<=\s))-(?:and|or|not|eq|ne|gt|ge|lt|le|like|match|contains|in|replace|split|join|is|isnot|as|f|band|bor|bnot|bxor|shl|shr)(?=\s|$)", "bright_yellow bold", re.IGNORECASE)
        if is_cmd:
            stylize_first(r"\^(?=\s*$)", "bright_yellow", re.MULTILINE)

        # ── 7. Flags / options ──
        if is_cmd:
            stylize_first(r"(?:^|(?<=\s))/[A-Za-z0-9?][\w-]*(?::[\w]*)?", "cyan")
        stylize_first(r"(?:^|(?<=\s))--[A-Za-z0-9][\w-]*(?:=\S*)?", "cyan")
        stylize_first(r"(?:^|(?<=\s))-[A-Za-z0-9][\w-]*", "cyan")

        # ── 8. Numeric literals ──
        stylize_first(r"(?<![.\w])0x[0-9A-Fa-f]+(?!\w)", "bright_cyan")
        stylize_first(r"(?<![.\w])\d+(?:\.\d+)?(?!\w)", "bright_cyan")

        # ── 9. Well-known commands / keywords ──
        _KW_POSIX = (
            r"if|then|else|elif|fi|for|in|do|done|while|until|case|esac|"
            r"function|return|exit|break|continue|select|trap|"
            r"source|eval|exec|wait|true|false|test"
        )
        _KW_PS = (
            r"if|else|elseif|switch|default|for|foreach|while|do|until|"
            r"try|catch|finally|throw|return|exit|break|continue|"
            r"function|filter|param|begin|process|end|"
            r"Import-Module|Get-Command|Set-Location|Get-ChildItem|"
            r"Write-Host|Write-Output|Write-Error|Write-Warning|"
            r"Invoke-Expression|Invoke-WebRequest|Invoke-RestMethod|"
            r"New-Item|Remove-Item|Copy-Item|Move-Item|"
            r"Get-Content|Set-Content|Add-Content|"
            r"Start-Process|Stop-Process|Get-Process|"
            r"ForEach-Object|Where-Object|Select-Object|Sort-Object|"
            r"Out-Null|Out-File|Tee-Object|Measure-Object"
        )
        _KW_CMD = (
            r"if|else|for|in|do|goto|call|exit|"
            r"set|setlocal|endlocal|echo|pause|rem|"
            r"copy|xcopy|robocopy|move|del|rd|md|"
            r"type|more|find|findstr|sort|"
            r"start|taskkill|tasklist|net|sc|reg|"
            r"assoc|ftype|mklink|attrib|icacls|"
            r"errorlevel|exist|not|defined|equ|neq|lss|leq|gtr|geq"
        )
        _KW_COMMON = (
            r"cd|pushd|popd|echo|printf|cat|ls|dir|cp|mv|rm|mkdir|rmdir|"
            r"chmod|chown|grep|sed|awk|find|xargs|sort|uniq|wc|head|tail|tee|"
            r"curl|wget|tar|gzip|gunzip|zip|unzip|ssh|scp|rsync|"
            r"set|unset|export|alias|unalias|env|sudo|su|"
            r"git|python|python3|pip|pip3|node|npm|npx|yarn|pnpm|bun|deno|"
            r"docker|docker-compose|podman|kubectl|helm|terraform|"
            r"make|cmake|cargo|go|rustc|rustup|javac|java|dotnet|"
            r"pwsh|powershell|bash|sh|zsh|fish|cmd|"
            r"uv|uvx|ruff|mypy|pytest|tox|nox|black|isort|flake8|"
            r"cls|clear|which|where|type|man|help|"
            r"systemctl|journalctl|service|crontab|"
            r"apt|apt-get|dpkg|yum|dnf|pacman|brew|choco|scoop|winget|"
            r"nc|netstat|ss|ip|ifconfig|ping|traceroute|nslookup|dig"
        )

        if is_ps:
            kw = f"{_KW_PS}|{_KW_COMMON}"
        elif is_cmd:
            kw = f"{_KW_CMD}|{_KW_COMMON}"
        elif is_node:
            kw = _KW_COMMON
        else:
            kw = f"{_KW_POSIX}|{_KW_COMMON}"

        stylize_first(
            rf"(?:^|(?<=\s))(?:{kw})(?=\s|$|;|\||&|>|<|\)|`)",
            "bright_yellow bold",
            re.IGNORECASE if is_cmd else 0,
        )

        # ── 10. Path-like patterns ──
        stylize_first(
            r"(?:^|(?<=\s))(?:\.{1,2}[/\\]|~[/\\]|[A-Za-z]:[/\\])[\w./\\:@*?=-]*",
            "underline",
        )

        # ── 11. Sub-commands (stdlib re compatible) ──
        _TOOLS_WITH_SUB = (
            r"git|docker|kubectl|npm|npx|yarn|pnpm|cargo|go|pip|pip3|uv|uvx|"
            r"docker-compose|podman|helm|make|cmake|systemctl|"
            r"apt|apt-get|brew|dnf|yum|pacman|choco|scoop|winget|"
            r"dotnet|rustup|terraform"
        )
        for m in re.finditer(
            rf"(?:^|(?<=\s))(?:{_TOOLS_WITH_SUB})\s+([a-z][\w-]*)",
            plain,
            re.IGNORECASE if is_cmd else 0,
        ):
            s, e = m.start(1), m.end(1)
            if s < e and _claim(s, e):
                text.stylize("bright_green", s, e)

        # ── 12. PowerShell cmdlet pattern: Verb-Noun (unclaimed) ──
        if is_ps:
            stylize_first(
                r"(?:^|(?<=\s))[A-Z][a-z]+-[A-Z][\w]*",
                "bright_yellow",
            )

        # ── 13. Assignment operator (=) not yet claimed ──
        stylize_first(r"(?<!=)=(?!=)", "bright_yellow bold")

        if preview:
            text.stylize("dim")
        return text

    def _format_workdir(self, cwd: str, command_theme: str) -> str:
        normalized_theme = str(command_theme or "classical").strip().lower()
        if normalized_theme == "oh-my-push":
            normalized_theme = "oh-my-posh"
        path = str(cwd or "")
        if normalized_theme == "oh-my-posh":
            name = os.path.basename(path.rstrip("\\/")) or path
            return f"{path} [{name}]"
        return f"{path}>"

    @staticmethod
    def _wrap_text(text: str, width: int) -> List[str]:
        source = str(text or "")
        if not source:
            return [""]
        width = max(12, width)
        wrapped: List[str] = []
        remaining = source
        while len(remaining) > width:
            split_at = remaining.rfind(" ", 0, width)
            if split_at <= 0:
                split_at = width
            wrapped.append(remaining[:split_at].rstrip())
            remaining = remaining[split_at:].lstrip()
        if remaining:
            wrapped.append(remaining)
        return wrapped or [source]

    @staticmethod
    def _wrap_path(text: str, width: int) -> List[str]:
        source = str(text or "")
        if not source:
            return [""]
        width = max(12, width)
        wrapped: List[str] = []
        remaining = source
        while len(remaining) > width:
            split_at = max(remaining.rfind("\\", 0, width), remaining.rfind("/", 0, width))
            if split_at <= 0:
                split_at = width
            wrapped.append(remaining[:split_at + 1].rstrip())
            remaining = remaining[split_at + 1 :].lstrip()
        if remaining:
            wrapped.append(remaining)
        return wrapped or [source]

    def _selected_entry(self) -> Optional[_CommandEntry]:
        if self._selected_command_id is None:
            return None
        return self._entry_lookup.get(self._selected_command_id)

    def _selected_command_position(self) -> int:
        if self._selected_command_id is None:
            return 0
        return self._selected_command_id

    def _get_active_entry(self) -> Optional[_CommandEntry]:
        if self._active_command_id is None:
            return None
        return self._entry_lookup.get(self._active_command_id)

    def _get_session_entry(self, command_index: int) -> Optional[_CommandEntry]:
        session_ids = self._session_entries.get(self._active_session_id, [])
        if 0 <= command_index < len(session_ids):
            return self._entry_lookup.get(session_ids[command_index])
        return None

    def _start_input_listener(self) -> None:
        self._stop_input.clear()
        self._input_thread = threading.Thread(target=self._input_loop, daemon=True)
        self._input_thread.start()

    def _input_loop(self) -> None:
        if os.name == "nt":
            self._input_loop_windows()
            return
        self._input_loop_posix()

    def _input_loop_windows(self) -> None:
        try:
            import msvcrt
        except Exception:
            return
        while not self._stop_input.is_set():
            try:
                if not msvcrt.kbhit():
                    time.sleep(0.05)
                    continue
                ch = msvcrt.getwch()
            except Exception:
                break
            if not ch:
                continue
            if ch == "\x0f":
                self._toggle_view_mode()
                continue
            if ch.lower() == "r":
                self._move_selection(-1)
                continue
            if ch.lower() == "l":
                self._move_selection(1)

    def _input_loop_posix(self) -> None:
        try:
            import select
            import termios
            import tty
        except Exception:
            return
        fd = None
        old_settings = None
        try:
            fd = sys.stdin.fileno()
            old_settings = termios.tcgetattr(fd)
            tty.setcbreak(fd)
            while not self._stop_input.is_set():
                ready, _, _ = select.select([sys.stdin], [], [], 0.05)
                if not ready:
                    continue
                ch = sys.stdin.read(1)
                if ch == "\x0f":
                    self._toggle_view_mode()
                elif ch.lower() == "r":
                    self._move_selection(-1)
                elif ch.lower() == "l":
                    self._move_selection(1)
        except Exception:
            return
        finally:
            if fd is not None and old_settings is not None:
                try:
                    termios.tcsetattr(fd, termios.TCSADRAIN, old_settings)
                except Exception:
                    pass

    def _toggle_view_mode(self) -> None:
        with self._lock:
            if not self._command_entries:
                return
            self._view_mode = not self._view_mode
            active = self._get_active_entry()
            if self._view_mode and active is not None:
                self._selected_command_id = active.entry_id
            elif self._selected_command_id is None:
                self._selected_command_id = active.entry_id if active is not None else self._command_entries[-1].entry_id
            self._refresh()

    def _move_selection(self, delta: int) -> None:
        with self._lock:
            if not self._view_mode or self._selected_command_id is None:
                return
            new_value = min(max(1, self._selected_command_id + delta), len(self._command_entries))
            if new_value == self._selected_command_id:
                return
            self._selected_command_id = new_value
            self._refresh()

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
        if self._view_mode:
            return "●"
        return "●" if int(time.monotonic() * 4) % 2 == 0 else "○"

# === PATCH 2: 替换 _command_dot_style 方法 ===
# 找到 def _command_dot_style(self, entry: _CommandEntry) -> str:
# 替换整个方法体

    def _command_dot_style(self, entry: _CommandEntry) -> str:
        """命令状态圆点颜色：完成=绿，失败=红，运行中=呼吸灯效果。"""
        if entry.status == "failed":
            return ui.colors["error"]
        if entry.status in {"completed", "detached"}:
            return ui.colors["success"]
        # 呼吸灯：在 grey23 ~ white 之间平滑过渡
        # grey 级别范围: 23 (暗) → 100 (亮白)
        t = time.monotonic()
        # 用 sin 产生 0~1 的平滑值，周期约 2 秒       
        phase = (math.sin(t * math.pi) + 1.0) / 2.0  # 0.0 ~ 1.0
        # 映射到 grey 级别 30 ~ 100
        grey_level = int(30 + phase * 70)
        # Rich 支持 rgb(...) 颜色
        v = int(grey_level * 255 / 100)
        return f"rgb({v},{v},{v})"

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
        if getattr(result, "runtime_log_file", ""):
            ui.print_info(f"执行日志文件: {result.runtime_log_file}")
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
        if event == "command":
            command_status = str(payload.get("command_status") or status or "running")
            runtime_label = str(payload.get("runtime_label") or payload.get("runtime") or "Shell")
            primary_command = str(payload.get("primary_command") or "")
            cwd = str(payload.get("cwd") or "")
            if command_status == "started":
                if primary_command:
                    ui.console.print(f"● {runtime_label} {primary_command}", highlight=False)
                if cwd:
                    ui.console.print(f"  ⎿ 工作目录: {cwd}", highlight=False)
                if payload.get("command_count"):
                    ui.console.print(f"  ⎿ 命令数量: {payload.get('command_count')}", highlight=False)
                return
            if command_status == "detached":
                ui.print_success(f"{step_name}: {message}")
                return
            if command_status == "failed":
                ui.print_error(f"{step_name}: {message}")
                return
            ui.print_success(f"{step_name}: {message}")
            return
        if event == "command_meta":
            return
        if event == "command_output":
            if message.strip():
                ui.console.print(f"│ {message}", highlight=False)
            return
        if event == "detail":
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
        """对需要动态获取的版本/链接字段进行交互式选择。"""
        result = dict(inputs)
        version_items: List[tuple[str, str, Any]] = []
        link_items: List[tuple[str, str, Any]] = []

        for component in template.components:
            if not self._is_component_enabled(component, result):
                continue
            if self._needs_dynamic_version_selection(component) and not str(result.get(f"version::component::{component.id}", "") or "").strip():
                version_items.append(("component", component.id, component))
            if self._needs_dynamic_link_selection(component) and not str(result.get(f"link::component::{component.id}", "") or "").strip():
                link_items.append(("component", component.id, component))

        for deployment in template.deployments:
            if not self._is_deployment_enabled(deployment, result):
                continue
            if self._needs_dynamic_version_selection(deployment) and not str(result.get(f"version::deployment::{deployment.id}", "") or "").strip():
                version_items.append(("deployment", deployment.id, deployment))
            if self._needs_dynamic_link_selection(deployment) and not str(result.get(f"link::deployment::{deployment.id}", "") or "").strip():
                link_items.append(("deployment", deployment.id, deployment))

        if not version_items and not link_items:
            return result

        if version_items:
            ui.console.print()
            ui.print_info("正在获取版本信息，请稍候...")

        for stage_name, item_id, definition in version_items:
            version_key = f"version::{stage_name}::{item_id}"
            result[version_key] = self._resolve_single_version_with_fallback(template, stage_name, item_id, definition)

        if link_items:
            ui.console.print()
            ui.print_info("正在获取下载链接信息，请稍候...")

        for stage_name, item_id, definition in link_items:
            link_key = f"link::{stage_name}::{item_id}"
            result[link_key] = self._resolve_single_link_with_fallback(template, stage_name, item_id, definition)

        return result

    def _resolve_single_version_with_fallback(
        self,
        template: TemplateDefinition,
        stage_name: str,
        item_id: str,
        definition: Any,
    ) -> str:
        while True:
            ui.console.print()
            ui.print_info(f"正在获取 {item_id} 的版本信息...")

            try:
                candidates = self.runtime.fetch_version_candidates(template, stage_name, item_id, definition)
                filtered = self._filter_version_candidates(definition, candidates)
                if not filtered:
                    ui.print_warning(f"无法获取 {item_id} 的版本列表")
                else:
                    ui.console.print()
                    ui.console.print(f"[bold cyan]请选择 {item_id} 的版本[/bold cyan]")
                    for idx, item in enumerate(filtered, 1):
                        type_label = {"release": "Release", "tag": "Tag", "branch": "Branch", "file": "文件", "custom": "自定义", "explicit": "显式"}.get(
                            item.get("type", ""), item.get("type", "")
                        )
                        ui.console.print(f"  [{idx}] {item['name']} [{type_label}]")

                    selected = self._prompt_candidate_selection(f"选择版本 (1-{len(filtered)}, 默认 1)", filtered)
                    version = selected.get("raw_name") or selected.get("name", "")
                    ui.print_success(f"已选择版本: {version}")
                    return str(version)

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
                        break
                    elif choice == "2":
                        ui.console.print()
                        version_input = ui.get_input(f"请输入 {item_id} 的版本号或分支名").strip()
                        if version_input:
                            ui.print_success(f"已输入版本: {version_input}")
                            return version_input
                        ui.print_warning("版本号不能为空，请重新选择")
                    elif choice == "3":
                        ui.print_info(f"将跳过 {item_id} 的版本选择，使用默认版本")
                        return ""
                    else:
                        ui.print_warning("请输入 1-3 之间的数字")

                continue
            except Exception as exc:
                ui.print_error(f"获取 {item_id} 版本列表时发生异常: {exc}")

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
                        break
                    elif choice == "2":
                        version_input = ui.get_input(f"请输入 {item_id} 的版本号或分支名").strip()
                        if version_input:
                            return version_input
                        ui.print_warning("版本号不能为空")
                    elif choice == "3":
                        return ""

                continue

    def _resolve_single_link_with_fallback(
        self,
        template: TemplateDefinition,
        stage_name: str,
        item_id: str,
        definition: Any,
    ) -> str:
        while True:
            ui.console.print()
            ui.print_info(f"正在获取 {item_id} 的下载链接...")

            try:
                candidates = self.runtime.fetch_link_candidates(template, stage_name, item_id, definition)
                if not candidates:
                    ui.print_warning(f"无法获取 {item_id} 的下载链接列表")
                else:
                    ui.console.print()
                    ui.console.print(f"[bold cyan]请选择 {item_id} 的下载链接[/bold cyan]")
                    for idx, item in enumerate(candidates, 1):
                        type_label = {"provided": "模板", "file": "文件", "custom": "自定义"}.get(
                            item.get("type", ""), item.get("type", "")
                        )
                        ui.console.print(f"  [{idx}] {item['name']} [{type_label}]")

                    selected = self._prompt_candidate_selection(f"选择链接 (1-{len(candidates)}, 默认 1)", candidates)
                    link_value = selected.get("raw_name") or selected.get("name", "")
                    ui.print_success(f"已选择下载链接: {link_value}")
                    return str(link_value)

                ui.console.print()
                ui.console.print(f"[bold yellow]获取 {item_id} 下载链接失败，请选择处理方式:[/bold yellow]")
                ui.console.print("  [1] 手动重试")
                ui.console.print("  [2] 自行输入下载链接")
                ui.console.print("  [3] 跳过（使用默认行为）")

                while True:
                    choice = ui.get_input("请选择 (1-3)", default="3").strip()
                    if not choice:
                        choice = "3"

                    if choice == "1":
                        break
                    if choice == "2":
                        ui.console.print()
                        link_input = ui.get_input(f"请输入 {item_id} 的完整下载链接").strip()
                        if link_input:
                            ui.print_success(f"已输入下载链接: {link_input}")
                            return link_input
                        ui.print_warning("下载链接不能为空，请重新选择")
                    elif choice == "3":
                        ui.print_info(f"将跳过 {item_id} 的下载链接选择，使用默认行为")
                        return ""
                    else:
                        ui.print_warning("请输入 1-3 之间的数字")

                continue
            except Exception as exc:
                ui.print_error(f"获取 {item_id} 下载链接列表时发生异常: {exc}")
                ui.console.print()
                ui.console.print(f"[bold yellow]获取 {item_id} 下载链接失败，请选择处理方式:[/bold yellow]")
                ui.console.print("  [1] 手动重试")
                ui.console.print("  [2] 自行输入下载链接")
                ui.console.print("  [3] 跳过（使用默认行为）")

                while True:
                    choice = ui.get_input("请选择 (1-3)", default="3").strip()
                    if not choice:
                        choice = "3"

                    if choice == "1":
                        break
                    elif choice == "2":
                        link_input = ui.get_input(f"请输入 {item_id} 的完整下载链接").strip()
                        if link_input:
                            return link_input
                        ui.print_warning("下载链接不能为空")
                    elif choice == "3":
                        return ""

                continue

    def _prompt_candidate_selection(self, prompt: str, candidates: List[Dict[str, Any]]) -> Dict[str, Any]:
        while True:
            choice = ui.get_input(prompt, default="1").strip()
            if not choice:
                choice = "1"
            if choice.isdigit():
                idx = int(choice) - 1
                if 0 <= idx < len(candidates):
                    return candidates[idx]
            ui.print_warning(f"请输入 1 到 {len(candidates)} 之间的数字")

    @staticmethod
    def _is_component_enabled(definition: Any, inputs: Dict[str, Any]) -> bool:
        if getattr(definition, "install", False):
            if getattr(definition, "choose", False):
                return bool(inputs.get(f"component::{definition.id}", True))
            return True
        return bool(getattr(definition, "check", False))

    @staticmethod
    def _is_deployment_enabled(definition: Any, inputs: Dict[str, Any]) -> bool:
        default_enabled = bool(getattr(definition, "deploy", False))
        if getattr(definition, "choose", False):
            return bool(inputs.get(f"deployment::{definition.id}", default_enabled))
        return default_enabled

    @staticmethod
    def _needs_dynamic_version_selection(definition: Any) -> bool:
        if not getattr(definition, "user_choose", False):
            return False
        if str(getattr(definition, "get_method", "") or "").strip().lower() != "get_version":
            return False
        choose_list = list(getattr(definition, "choose_list", []) or [])
        string_choices = [item for item in choose_list if isinstance(item, str)]
        if string_choices and len(string_choices) == len(choose_list):
            return False
        return True

    @staticmethod
    def _needs_dynamic_link_selection(definition: Any) -> bool:
        if str(getattr(definition, "get_method", "") or "").strip().lower() != "get_link":
            return False
        if any(str(item).strip() for item in getattr(definition, "get_link_provide_list", []) or []):
            return False
        return str(getattr(definition, "get_link", "") or "").strip().lower() in {"filelink", "custom"}

    def _filter_version_candidates(
        self,
        definition: Any,
        candidates: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """应用模板的 choose_list 过滤规则到版本候选列表。"""
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
            for item in candidates:
                if str(item.get("name", "")).lower() in explicit_set:
                    results.append(item)
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


deployment_mod_cli_runner = DeploymentModCliRunner()
