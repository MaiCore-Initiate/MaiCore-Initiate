from __future__ import annotations

import os
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional, Sequence

import psutil


class DebugSessionStopped(RuntimeError):
    """调试会话已被用户停止。"""


class DebugMonitorUnavailable(RuntimeError):
    """请求的监控级别在当前环境不可用。"""


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _duration_ms(started: Optional[float], ended: Optional[float] = None) -> int:
    if not started:
        return 0
    end_value = ended if ended is not None else time.monotonic()
    return max(0, int((end_value - started) * 1000))


def _safe_int(value: Any) -> Optional[int]:
    try:
        if value in (None, ""):
            return None
        return int(value)
    except Exception:
        return None


def _join_command_line(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, Sequence):
        return " ".join(str(item) for item in value)
    return str(value or "")


def _process_snapshot(pid: int) -> Dict[str, Any]:
    snapshot: Dict[str, Any] = {"pid": pid}
    try:
        proc = psutil.Process(pid)
        with proc.oneshot():
            snapshot.update(
                {
                    "name": proc.name(),
                    "status": proc.status(),
                    "parent_pid": proc.ppid(),
                    "exe": proc.exe(),
                    "cwd": proc.cwd(),
                    "cmdline": _join_command_line(proc.cmdline()),
                    "username": proc.username(),
                    "create_time": proc.create_time(),
                    "cpu_percent": proc.cpu_percent(interval=None),
                    "memory_mb": round(proc.memory_info().rss / (1024 * 1024), 2),
                    "thread_count": proc.num_threads(),
                }
            )
    except psutil.NoSuchProcess:
        snapshot["status"] = "terminated"
    except psutil.AccessDenied:
        snapshot["status"] = snapshot.get("status") or "access_denied"
    except Exception as exc:
        snapshot["status"] = snapshot.get("status") or "unknown"
        snapshot["error"] = str(exc)
    return snapshot


class PsutilTreeMonitor:
    """常规级监控：递归扫描已登记根进程的进程树。"""

    def __init__(self, session: "DebugSession", interval_seconds: float = 0.5) -> None:
        self.session = session
        self.interval_seconds = interval_seconds
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run, name=f"debug-psutil-{self.session.session_id}", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=1)

    def _run(self) -> None:
        while not self._stop_event.is_set():
            try:
                self._scan_once()
            except Exception as exc:
                self.session.record_monitor_warning(f"进程树扫描失败: {exc}")
            self._stop_event.wait(self.interval_seconds)

    def _scan_once(self) -> None:
        root_pids = self.session.root_pids()
        seen: set[int] = set()
        for root_pid in root_pids:
            try:
                root = psutil.Process(root_pid)
                candidates = [root, *root.children(recursive=True)]
            except psutil.NoSuchProcess:
                self.session.mark_process_ended(root_pid, source="psutil")
                continue
            except psutil.AccessDenied:
                candidates = []
            for proc in candidates:
                pid = getattr(proc, "pid", None)
                if pid is None or pid in seen:
                    continue
                seen.add(pid)
                self.session.refresh_process(pid, source="psutil")
        self.session.mark_missing_processes(seen, source="psutil")


class StrictWindowsEventMonitor:
    """严格级监控：Windows 进程创建事件 + 常规进程树扫描兜底。"""

    def __init__(self, session: "DebugSession") -> None:
        if os.name != "nt":
            raise DebugMonitorUnavailable("严格监控当前只支持 Windows。")
        try:
            import pythoncom  # type: ignore
            import wmi  # type: ignore
        except Exception as exc:
            raise DebugMonitorUnavailable("严格监控需要安装 WMI 与 pywin32 后端依赖。") from exc

        self.session = session
        self._pythoncom = pythoncom
        self._wmi = wmi
        self._fallback = PsutilTreeMonitor(session, interval_seconds=0.5)
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None

    def start(self) -> None:
        self._fallback.start()
        if self._thread and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run, name=f"debug-wmi-{self.session.session_id}", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        self._fallback.stop()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=1)

    def _run(self) -> None:
        self._pythoncom.CoInitialize()
        try:
            client = self._wmi.WMI()
            watcher = client.Win32_Process.watch_for("creation")
            while not self._stop_event.is_set():
                try:
                    process = watcher(timeout_ms=500)
                except Exception as exc:
                    if exc.__class__.__name__ == "x_wmi_timed_out":
                        continue
                    self.session.record_monitor_warning(f"系统进程事件监听失败: {exc}")
                    self._stop_event.wait(1)
                    continue

                pid = _safe_int(getattr(process, "ProcessId", None))
                parent_pid = _safe_int(getattr(process, "ParentProcessId", None))
                if not pid or not parent_pid:
                    continue
                if not self.session.is_known_process_or_descendant(parent_pid):
                    continue
                self.session.register_external_process(
                    pid=pid,
                    parent_pid=parent_pid,
                    name=str(getattr(process, "Name", "") or ""),
                    exe=str(getattr(process, "ExecutablePath", "") or ""),
                    cmdline=str(getattr(process, "CommandLine", "") or ""),
                    source="windows_event",
                )
        finally:
            try:
                self._pythoncom.CoUninitialize()
            except Exception:
                pass


class DebugSession:
    """工作台调试会话状态与运行时控制器。"""

    def __init__(
        self,
        *,
        session_id: str,
        task_id: str,
        project_sequence: str,
        template_path: str,
        scope: str,
        stage: str,
        block_key: str,
        monitor_level: str,
        hydrate_context: bool,
        on_update: Optional[Callable[[Dict[str, Any]], None]] = None,
    ) -> None:
        self.session_id = session_id
        self.task_id = task_id
        self.project_sequence = project_sequence
        self.template_path = template_path
        self.scope = scope
        self.stage = stage
        self.block_key = block_key
        self.monitor_level = "strict" if monitor_level == "strict" else "normal"
        self.hydrate_context = hydrate_context
        self.on_update = on_update

        self.status = "pending"
        self.message = "等待启动"
        self.error = ""
        self.started_at = ""
        self.ended_at = ""
        self.duration_ms = 0
        self._started_monotonic: Optional[float] = None
        self._ended_monotonic: Optional[float] = None
        self.last_event_at = _now_iso()

        self._lock = threading.RLock()
        self._pause_condition = threading.Condition(self._lock)
        self._stop_requested = False
        self._block_stack: List[str] = []
        self._active_command_id = ""
        self._root_pids: set[int] = set()
        self._known_pids: set[int] = set()
        self._event_counter = 0
        self._command_counter = 0

        self.blocks: Dict[str, Dict[str, Any]] = {}
        self.block_order: List[str] = []
        self.commands: Dict[str, Dict[str, Any]] = {}
        self.processes: Dict[int, Dict[str, Any]] = {}
        self.logs: List[str] = []
        self.monitor_warnings: List[str] = []

        if self.monitor_level == "strict":
            self._monitor: Any = StrictWindowsEventMonitor(self)
        else:
            self._monitor = PsutilTreeMonitor(self)

    def mark_running(self, message: str = "调试会话已启动") -> None:
        with self._lock:
            self.status = "running"
            self.message = message
            self.started_at = _now_iso()
            self._started_monotonic = time.monotonic()
            self._touch_locked()
            self._monitor.start()
        self.emit()

    def finish(self, *, success: bool, message: str, result: Optional[Dict[str, Any]] = None, error: str = "") -> None:
        with self._lock:
            if self.status == "stopped":
                success = False
                message = self.message or "调试会话已停止"
            elif self.status == "stopping":
                self.status = "stopped"
                success = False
                message = "调试会话已停止"
            else:
                self.status = "completed" if success else "failed"
            self.message = message
            self.error = error or ("" if success else message)
            self.ended_at = _now_iso()
            self._ended_monotonic = time.monotonic()
            self.duration_ms = _duration_ms(self._started_monotonic, self._ended_monotonic)
            self._finish_open_records_locked(self.status, self.error)
            if result is not None:
                self.result = result
            self._touch_locked()
        self._monitor.stop()
        self.emit()

    def pause(self) -> None:
        with self._lock:
            if self.status not in {"running"}:
                return
            self.status = "paused"
            self.message = "调试已暂停"
            self._touch_locked()
            pids = list(self._known_pids)
        self._suspend_processes(pids)
        self.emit()

    def resume(self) -> None:
        with self._lock:
            if self.status != "paused":
                return
            pids = list(self._known_pids)
        self._resume_processes(pids)
        with self._lock:
            self.status = "running"
            self.message = "调试已恢复"
            self._touch_locked()
            self._pause_condition.notify_all()
        self.emit()

    def stop(self) -> None:
        with self._lock:
            if self.status in {"completed", "failed", "stopped"}:
                return
            self._stop_requested = True
            self.status = "stopping"
            self.message = "正在停止调试会话"
            self._touch_locked()
            pids = list(self._known_pids)
            self._pause_condition.notify_all()
        self._terminate_processes(pids)
        with self._lock:
            self.status = "stopped"
            self.message = "调试会话已停止"
            self.ended_at = _now_iso()
            self._ended_monotonic = time.monotonic()
            self.duration_ms = _duration_ms(self._started_monotonic, self._ended_monotonic)
            self._finish_open_records_locked("stopped", "")
            self._touch_locked()
        self._monitor.stop()
        self.emit()

    def wait_if_paused(self) -> None:
        with self._pause_condition:
            while self.status == "paused" and not self._stop_requested:
                self._pause_condition.wait(timeout=0.2)
            if self._stop_requested or self.status in {"stopping", "stopped"}:
                raise DebugSessionStopped("调试会话已停止")

    def enter_block(self, *, stage: str, block_id: str, label: str, item_id: str = "") -> None:
        self.wait_if_paused()
        with self._lock:
            block = self._ensure_block_locked(stage=stage, block_id=block_id, label=label, item_id=item_id)
            if not block.get("started_at") or block.get("status") in {"completed", "failed", "skipped", "stopped"}:
                self._begin_record_locked(block)
            block["status"] = "running"
            self._block_stack.append(block_id)
            self.message = f"正在调试: {label}"
            self._append_log_locked("block", label, "running")
            self._touch_locked()
        self.emit()

    def leave_block(self, *, status: str, error: str = "") -> None:
        with self._lock:
            block_id = self._block_stack.pop() if self._block_stack else ""
            block = self.blocks.get(block_id)
            if block:
                block["status"] = status
                if error:
                    block["error"] = error
                self._finish_record_locked(block)
                self._append_log_locked("block", block.get("label", block_id), status)
            self._touch_locked()
        self.emit()

    def command_started(self, **payload: Any) -> str:
        self.wait_if_paused()
        with self._lock:
            self._command_counter += 1
            command_id = f"cmd-{self._command_counter}"
            block_id = self._block_stack[-1] if self._block_stack else "session"
            block = self._ensure_block_locked(stage=str(payload.get("stage") or ""), block_id=block_id, label=block_id)
            command = {
                "id": command_id,
                "block_id": block_id,
                "label": str(payload.get("label") or ""),
                "runtime": str(payload.get("runtime") or ""),
                "runtime_label": str(payload.get("runtime_label") or ""),
                "cwd": str(payload.get("cwd") or ""),
                "script_path": str(payload.get("script_path") or ""),
                "primary_command": str(payload.get("primary_command") or ""),
                "commands": [str(item) for item in list(payload.get("commands") or [])],
                "command_count": int(payload.get("command_count") or 0),
                "status": "running",
                "returncode": None,
                "pid": None,
                "active_command_index": None,
                "output_lines": [],
                "process_ids": [],
                "call_stack": [
                    item
                    for item in [
                        str(payload.get("scope") or self.scope),
                        str(payload.get("stage") or block.get("stage") or ""),
                        block_id,
                        str(payload.get("label") or ""),
                        command_id,
                    ]
                    if item
                ],
            }
            self._begin_record_locked(command)
            self.commands[command_id] = command
            self._active_command_id = command_id
            block.setdefault("command_ids", []).append(command_id)
            block["command_count"] = len(block.get("command_ids", []))
            self._append_log_locked("command", command["label"], "running")
            self._touch_locked()
        self.emit()
        return command_id

    def command_meta(self, command_id: str, payload: Dict[str, Any]) -> None:
        with self._lock:
            command = self.commands.get(command_id)
            if not command:
                return
            if payload.get("command_index") not in (None, ""):
                command["active_command_index"] = _safe_int(payload.get("command_index"))
            meta_events = command.setdefault("meta_events", [])
            meta_events.append(dict(payload))
            if len(meta_events) > 120:
                del meta_events[:-120]
            self._touch_locked()
        self.emit()

    def command_output(self, command_id: str, line: str, command_index: Optional[int] = None, runtime: str = "") -> None:
        with self._lock:
            command = self.commands.get(command_id)
            if not command:
                return
            entry = {
                "line": line,
                "command_index": command_index,
                "runtime": runtime,
                "timestamp": _now_iso(),
            }
            output_lines = command.setdefault("output_lines", [])
            output_lines.append(entry)
            if len(output_lines) > 400:
                del output_lines[:-400]
            command["active_command_index"] = command_index
            self._append_log_locked("output", line, "running")
            self._touch_locked()
        self.emit()

    def command_finished(self, command_id: str, *, status: str, returncode: Any = None, error: str = "") -> None:
        with self._lock:
            command = self.commands.get(command_id)
            if not command:
                return
            command["status"] = status
            if returncode not in (None, ""):
                command["returncode"] = _safe_int(returncode)
            if error:
                command["error"] = error
            self._finish_record_locked(command)
            self._append_log_locked("command", command.get("label", command_id), status)
            self._touch_locked()
        self.emit()

    def register_process(
        self,
        process: Any,
        *,
        command_id: str,
        label: str,
        command_line: Any = "",
        source: str = "runtime",
    ) -> None:
        pid = _safe_int(getattr(process, "pid", None))
        if not pid:
            return
        snapshot = _process_snapshot(pid)
        if command_line:
            snapshot["cmdline"] = _join_command_line(command_line)
        with self._lock:
            self._root_pids.add(pid)
            self._known_pids.add(pid)
            self._upsert_process_locked(
                pid,
                snapshot,
                command_id=command_id,
                block_id=self.commands.get(command_id, {}).get("block_id", self._block_stack[-1] if self._block_stack else "session"),
                label=label,
                source=source,
                root=True,
            )
            self._touch_locked()
        self.emit()

    def register_external_process(
        self,
        *,
        pid: int,
        parent_pid: int,
        name: str = "",
        exe: str = "",
        cmdline: str = "",
        source: str = "windows_event",
    ) -> None:
        snapshot = _process_snapshot(pid)
        snapshot.update({key: value for key, value in {"name": name, "exe": exe, "cmdline": cmdline, "parent_pid": parent_pid}.items() if value})
        with self._lock:
            parent = self.processes.get(parent_pid, {})
            command_id = str(parent.get("command_id") or self._active_command_id)
            block_id = str(parent.get("block_id") or (self._block_stack[-1] if self._block_stack else "session"))
            self._known_pids.add(pid)
            self._upsert_process_locked(pid, snapshot, command_id=command_id, block_id=block_id, label=name or str(pid), source=source, root=False)
            self._touch_locked()
        self.emit()

    def refresh_process(self, pid: int, *, source: str) -> None:
        snapshot = _process_snapshot(pid)
        parent_pid = _safe_int(snapshot.get("parent_pid"))
        with self._lock:
            if pid not in self._known_pids and parent_pid not in self._known_pids and pid not in self._root_pids:
                return
            parent = self.processes.get(parent_pid or 0, {})
            current = self.processes.get(pid, {})
            command_id = str(current.get("command_id") or parent.get("command_id") or self._active_command_id)
            block_id = str(current.get("block_id") or parent.get("block_id") or (self._block_stack[-1] if self._block_stack else "session"))
            self._known_pids.add(pid)
            self._upsert_process_locked(pid, snapshot, command_id=command_id, block_id=block_id, label=str(snapshot.get("name") or pid), source=source, root=pid in self._root_pids)
            self._touch_locked()

    def mark_process_ended(self, pid: int, *, source: str) -> None:
        with self._lock:
            process = self.processes.get(pid)
            if not process or process.get("ended_at"):
                return
            process["status"] = "terminated"
            process["source"] = process.get("source") or source
            self._finish_record_locked(process)
            self._touch_locked()
        self.emit()

    def mark_missing_processes(self, seen: set[int], *, source: str) -> None:
        ended = False
        with self._lock:
            for pid in list(self._known_pids):
                process = self.processes.get(pid)
                if not process or process.get("ended_at") or pid in seen:
                    continue
                if self._process_exists(pid):
                    continue
                process["status"] = "terminated"
                process["source"] = process.get("source") or source
                self._finish_record_locked(process)
                ended = True
            if ended:
                self._touch_locked()
        if ended:
            self.emit()

    def root_pids(self) -> List[int]:
        with self._lock:
            return list(self._root_pids)

    def is_known_process_or_descendant(self, pid: int) -> bool:
        with self._lock:
            if pid in self._known_pids or pid in self._root_pids:
                return True
        try:
            proc = psutil.Process(pid)
            return any(parent.pid in self._known_pids or parent.pid in self._root_pids for parent in proc.parents())
        except Exception:
            return False

    def record_monitor_warning(self, message: str) -> None:
        with self._lock:
            self.monitor_warnings.append(message)
            if len(self.monitor_warnings) > 80:
                del self.monitor_warnings[:-80]
            self._append_log_locked("monitor", message, "warning")
            self._touch_locked()
        self.emit()

    def record_runtime_event(self, payload: Dict[str, Any]) -> None:
        event = str(payload.get("event") or "stage")
        status = str(payload.get("status") or "running")
        step_name = str(payload.get("step_name") or "")
        message = str(payload.get("message") or "")
        with self._lock:
            if message:
                label = f"{step_name}: {message}" if step_name else message
                self._append_log_locked(event, label, status)
                if event != "command_output":
                    self.message = label
            self._touch_locked()
        self.emit()

    def to_dict(self) -> Dict[str, Any]:
        with self._lock:
            result = {
                "session_id": self.session_id,
                "task_id": self.task_id,
                "project_sequence": self.project_sequence,
                "template_path": self.template_path,
                "scope": self.scope,
                "stage": self.stage,
                "block_key": self.block_key,
                "monitor_level": self.monitor_level,
                "hydrate_context": self.hydrate_context,
                "status": self.status,
                "message": self.message,
                "error": self.error,
                "started_at": self.started_at,
                "ended_at": self.ended_at,
                "duration_ms": self.duration_ms or _duration_ms(self._started_monotonic, self._ended_monotonic),
                "last_event_at": self.last_event_at,
                "blocks": [self._public_record(self.blocks[block_id]) for block_id in self.block_order if block_id in self.blocks],
                "commands": [self._public_record(command) for command in self.commands.values()],
                "processes": [self._public_record(process) for process in self.processes.values()],
                "logs": list(self.logs[-500:]),
                "monitor_warnings": list(self.monitor_warnings[-80:]),
            }
            if hasattr(self, "result"):
                result["result"] = getattr(self, "result")
            return result

    def emit(self) -> None:
        if not self.on_update:
            return
        self.on_update(self.to_dict())

    def _ensure_block_locked(self, *, stage: str, block_id: str, label: str, item_id: str = "") -> Dict[str, Any]:
        if block_id not in self.blocks:
            self.blocks[block_id] = {
                "id": block_id,
                "stage": stage,
                "item_id": item_id,
                "label": label or block_id,
                "status": "pending",
                "command_ids": [],
                "process_ids": [],
                "command_count": 0,
                "process_count": 0,
            }
            self.block_order.append(block_id)
        block = self.blocks[block_id]
        if label and block.get("label") == block_id:
            block["label"] = label
        if stage:
            block["stage"] = stage
        if item_id:
            block["item_id"] = item_id
        return block

    def _upsert_process_locked(
        self,
        pid: int,
        snapshot: Dict[str, Any],
        *,
        command_id: str,
        block_id: str,
        label: str,
        source: str,
        root: bool,
    ) -> Dict[str, Any]:
        process = self.processes.get(pid)
        if not process:
            process = {
                "pid": pid,
                "id": str(pid),
                "block_id": block_id,
                "command_id": command_id,
                "label": label,
                "source": source,
                "root": root,
                "status": "running",
                "children": [],
                "call_stack": self._process_call_stack_locked(block_id, command_id, pid),
            }
            self._begin_record_locked(process)
            self.processes[pid] = process
            block = self._ensure_block_locked(stage="", block_id=block_id, label=block_id)
            block.setdefault("process_ids", []).append(pid)
            block["process_count"] = len(block.get("process_ids", []))
            command = self.commands.get(command_id)
            if command is not None:
                command.setdefault("process_ids", []).append(pid)
                if root:
                    command["pid"] = pid
        process.update({key: value for key, value in snapshot.items() if value not in (None, "")})
        process["source"] = process.get("source") or source
        parent_pid = _safe_int(process.get("parent_pid"))
        if parent_pid and parent_pid in self.processes:
            children = self.processes[parent_pid].setdefault("children", [])
            if pid not in children:
                children.append(pid)
        if process.get("status") == "terminated" and not process.get("ended_at"):
            self._finish_record_locked(process)
        return process

    def _process_call_stack_locked(self, block_id: str, command_id: str, pid: int) -> List[str]:
        command = self.commands.get(command_id, {})
        stack = list(command.get("call_stack", []))
        stack.append(f"pid:{pid}")
        return stack

    def _finish_open_records_locked(self, status: str, error: str) -> None:
        for command in self.commands.values():
            if not command.get("ended_at"):
                command["status"] = status
                if error:
                    command["error"] = error
                self._finish_record_locked(command)
        for process in self.processes.values():
            if not process.get("ended_at"):
                process["status"] = "terminated" if status in {"completed", "failed", "stopped"} else status
                self._finish_record_locked(process)
        for block in self.blocks.values():
            if not block.get("ended_at") and block.get("status") == "running":
                block["status"] = status
                if error:
                    block["error"] = error
                self._finish_record_locked(block)

    def _begin_record_locked(self, record: Dict[str, Any]) -> None:
        record["started_at"] = _now_iso()
        record["_started_monotonic"] = time.monotonic()
        record.pop("ended_at", None)
        record.pop("_ended_monotonic", None)
        record["duration_ms"] = 0

    def _finish_record_locked(self, record: Dict[str, Any]) -> None:
        if record.get("ended_at"):
            return
        record["ended_at"] = _now_iso()
        record["_ended_monotonic"] = time.monotonic()
        record["duration_ms"] = _duration_ms(record.get("_started_monotonic"), record.get("_ended_monotonic"))

    def _public_record(self, record: Dict[str, Any]) -> Dict[str, Any]:
        public = {key: value for key, value in record.items() if not key.startswith("_")}
        if public.get("started_at") and not public.get("ended_at"):
            public["duration_ms"] = _duration_ms(record.get("_started_monotonic"))
        return public

    def _append_log_locked(self, event: str, message: str, status: str) -> None:
        if not message:
            return
        self._event_counter += 1
        self.logs.append(f"[{datetime.now().strftime('%H:%M:%S')}] [{event}] [{status}] {message}")
        if len(self.logs) > 1200:
            del self.logs[:-1200]

    def _touch_locked(self) -> None:
        self.last_event_at = _now_iso()

    @staticmethod
    def _process_exists(pid: int) -> bool:
        try:
            return psutil.Process(pid).is_running()
        except Exception:
            return False

    def _suspend_processes(self, pids: Sequence[int]) -> None:
        for pid in sorted(set(pids), reverse=True):
            try:
                proc = psutil.Process(pid)
                proc.suspend()
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
            except Exception as exc:
                self.record_monitor_warning(f"暂停进程 {pid} 失败: {exc}")

    def _resume_processes(self, pids: Sequence[int]) -> None:
        for pid in sorted(set(pids)):
            try:
                proc = psutil.Process(pid)
                proc.resume()
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
            except Exception as exc:
                self.record_monitor_warning(f"恢复进程 {pid} 失败: {exc}")

    def _terminate_processes(self, pids: Sequence[int]) -> None:
        for pid in sorted(set(pids), reverse=True):
            try:
                proc = psutil.Process(pid)
                children = proc.children(recursive=True)
                for child in reversed(children):
                    try:
                        child.terminate()
                    except Exception:
                        pass
                proc.terminate()
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
            except Exception as exc:
                self.record_monitor_warning(f"停止进程 {pid} 失败: {exc}")


class DebugSessionManager:
    def __init__(self) -> None:
        self._sessions: Dict[str, DebugSession] = {}
        self._lock = threading.RLock()

    def create(
        self,
        *,
        task_id: str,
        project_sequence: str,
        template_path: str,
        scope: str,
        stage: str,
        block_key: str,
        monitor_level: str,
        hydrate_context: bool,
        on_update: Optional[Callable[[Dict[str, Any]], None]] = None,
    ) -> DebugSession:
        session_id = f"debug_{uuid.uuid4().hex[:10]}"
        session = DebugSession(
            session_id=session_id,
            task_id=task_id,
            project_sequence=project_sequence,
            template_path=template_path,
            scope=scope,
            stage=stage,
            block_key=block_key,
            monitor_level=monitor_level,
            hydrate_context=hydrate_context,
            on_update=on_update,
        )
        with self._lock:
            self._sessions[session_id] = session
        return session

    def get(self, session_id: str) -> Optional[DebugSession]:
        with self._lock:
            return self._sessions.get(session_id)


debug_session_manager = DebugSessionManager()
