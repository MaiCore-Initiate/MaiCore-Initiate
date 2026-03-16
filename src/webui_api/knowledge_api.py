# -*- coding: utf-8 -*-
"""
知识库构建API模块
为WebUI提供知识库构建的API接口

版本策略：
- >= 0.10.0: txt → data/lpmm_raw_data → info_extraction.py → import_openie.py
              json(OpenIE) → data/openie → import_openie.py
- >= 0.8.0 ~ < 0.10.0: 旧版 info_extraction.py + import_openie.py（虚拟环境）
- < 0.8.0: raw_data_preprocessor.py + info_extraction.py + import_openie.py
"""
import os
import json
import shutil
import asyncio
import subprocess
import logging
import threading
import time
import re
from typing import Dict, Any, Optional, List
from pathlib import Path
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel

try:
    import toml as toml_lib
except ImportError:
    try:
        import tomli as toml_lib
    except ImportError:
        toml_lib = None

try:
    import toml as toml_writer
except ImportError:
    toml_writer = None

router = APIRouter()
logger = logging.getLogger(__name__)

# --- 全局任务状态追踪 ---
# key: "{serial_number}:{task_type}", value: dict with status/log/pid
_running_tasks: Dict[str, Dict[str, Any]] = {}
_TASK_TTL = 3600  # 已完成任务保留1小时


def _cleanup_old_tasks():
    """清理已完成超过 TTL 的任务条目"""
    now = time.time()
    to_remove = [
        k for k, v in _running_tasks.items()
        if v["status"] not in ("running",) and now - v.get("start_time", now) > _TASK_TTL
    ]
    for k in to_remove:
        del _running_tasks[k]


# --- 辅助函数 ---

def _get_instance_config(serial_number: str) -> Optional[Dict[str, Any]]:
    """根据序列号获取实例配置"""
    from ..modules.config_manager import config_manager
    configs = config_manager.get_all_configurations()
    for config in configs.values():
        if config.get("serial_number") == serial_number:
            return config
    return None


def _get_bot_path(config: Dict[str, Any]) -> str:
    """获取实例本体路径"""
    bot_type = config.get("bot_type", "MaiBot")
    if bot_type == "MoFox_bot":
        return config.get("mofox_path", "")
    return config.get("mai_path", "")


def _get_version(config: Dict[str, Any]) -> str:
    return config.get("version_path", "")


def _is_version_gte(version: str, target_minor: int) -> bool:
    """检查版本 >= 0.{target_minor}.0"""
    try:
        v = version.lower().strip()
        if v in ('main', 'dev', 'master'):
            return True
        parts = v.split('-')[0].split('.')
        major, minor = int(parts[0]), int(parts[1])
        return major > 0 or (major == 0 and minor >= target_minor)
    except (ValueError, IndexError):
        return False


def _get_venv_activate_cmd(bot_path: str) -> Optional[str]:
    """获取虚拟环境激活命令（Windows）"""
    for venv_dir in ("venv", ".venv", "env"):
        activate = os.path.join(bot_path, venv_dir, "Scripts", "activate.bat")
        if os.path.exists(activate):
            return f'"{activate}"'
    return None


def _list_dir_files(dir_path: str) -> List[Dict[str, Any]]:
    """列出目录中的文件信息"""
    files = []
    if not os.path.isdir(dir_path):
        return files
    for name in os.listdir(dir_path):
        fp = os.path.join(dir_path, name)
        if os.path.isfile(fp):
            files.append({
                "name": name,
                "size": os.path.getsize(fp),
                "size_kb": round(os.path.getsize(fp) / 1024, 2),
            })
    return files


def _safe_filename(filename: str) -> str:
    """清理文件名，防止路径遍历攻击"""
    return os.path.basename(filename).strip()


def _validate_path_within(filepath: str, base_dir: str):
    """验证路径在预期目录内，否则抛出 HTTPException"""
    real_fp = os.path.realpath(filepath)
    real_base = os.path.realpath(base_dir)
    if not real_fp.startswith(real_base + os.sep) and real_fp != real_base:
        raise HTTPException(400, "非法文件路径")


def _task_key(serial: str, task_type: str) -> str:
    return f"{serial}:{task_type}"


def _build_cmd_string(bot_path: str, script_parts: List[str], use_venv: bool = True) -> str:
    """构建在 CMD 中执行的命令字符串"""
    parts = [f'cd /d "{bot_path}"']
    if use_venv:
        activate_cmd = _get_venv_activate_cmd(bot_path)
        if activate_cmd:
            parts.append(f'call {activate_cmd}')
    parts.extend(script_parts)
    parts.append('echo.')
    parts.append('echo 执行完成！')
    parts.append('pause')
    return ' && '.join(parts)


def _launch_in_new_console(cmd_str: str, bot_path: str, task_key_str: str):
    """用 Popen + CREATE_NEW_CONSOLE 启动命令，记录 PID 到 _running_tasks，后台线程监控进程退出"""
    _running_tasks[task_key_str] = {"status": "running", "log": [], "pid": None, "return_code": None, "start_time": time.time()}
    try:
        proc = subprocess.Popen(
            f'cmd /c "{cmd_str}"',
            cwd=bot_path,
            shell=False,
            creationflags=subprocess.CREATE_NEW_CONSOLE,
        )
        _running_tasks[task_key_str]["pid"] = proc.pid
        _running_tasks[task_key_str]["log"].append(f"已在新窗口中启动 (PID: {proc.pid})")

        # 后台线程等待进程结束并更新状态
        def _wait():
            rc = proc.wait()
            _running_tasks[task_key_str]["return_code"] = rc
            _running_tasks[task_key_str]["status"] = "done" if rc == 0 else "error"
            _running_tasks[task_key_str]["log"].append(f"进程已退出 (返回码: {rc})")
        threading.Thread(target=_wait, daemon=True).start()
    except Exception as e:
        _running_tasks[task_key_str]["status"] = "error"
        _running_tasks[task_key_str]["log"].append(f"执行异常: {str(e)}")


# ============================================================
# API 端点
# ============================================================

@router.get("/knowledge/{serial_number}/info", summary="获取知识库目录状态")
async def get_knowledge_info(serial_number: str):
    """
    返回目标实例的 lpmm_raw_data 和 openie 目录文件列表，
    以及版本信息，供前端判断可用操作。
    """
    config = _get_instance_config(serial_number)
    if not config:
        raise HTTPException(404, f"未找到实例 {serial_number}")

    bot_path = _get_bot_path(config)
    if not bot_path:
        raise HTTPException(400, "实例路径未配置")

    version = _get_version(config)
    raw_dir = os.path.join(bot_path, "data", "lpmm_raw_data")
    openie_dir = os.path.join(bot_path, "data", "openie")

    return {
        "success": True,
        "version": version,
        "is_v0100": _is_version_gte(version, 10),
        "is_v080": _is_version_gte(version, 8),
        "raw_data": {
            "path": raw_dir,
            "exists": os.path.isdir(raw_dir),
            "files": _list_dir_files(raw_dir),
        },
        "openie": {
            "path": openie_dir,
            "exists": os.path.isdir(openie_dir),
            "files": _list_dir_files(openie_dir),
        },
    }


@router.post("/knowledge/{serial_number}/upload/txt", summary="上传txt文件到lpmm_raw_data")
async def upload_txt_files(
    serial_number: str,
    files: List[UploadFile] = File(...),
    clear_existing: bool = Form(False),
):
    """
    上传 .txt 文件到目标实例的 data/lpmm_raw_data 目录。
    - clear_existing=true 时先清空目录
    """
    config = _get_instance_config(serial_number)
    if not config:
        raise HTTPException(404, f"未找到实例 {serial_number}")

    bot_path = _get_bot_path(config)
    if not bot_path:
        raise HTTPException(400, "实例路径未配置")

    raw_dir = os.path.join(bot_path, "data", "lpmm_raw_data")
    os.makedirs(raw_dir, exist_ok=True)

    if clear_existing:
        for f in os.listdir(raw_dir):
            fp = os.path.join(raw_dir, f)
            if os.path.isfile(fp):
                os.remove(fp)

    saved = []
    for upload in files:
        if not upload.filename or not upload.filename.lower().endswith(".txt"):
            continue
        safe_name = _safe_filename(upload.filename)
        if not safe_name:
            continue
        dest = os.path.join(raw_dir, safe_name)
        _validate_path_within(dest, raw_dir)
        content = await upload.read()
        with open(dest, "wb") as f:
            f.write(content)
        saved.append(safe_name)

    return {
        "success": True,
        "saved_files": saved,
        "count": len(saved),
        "directory": raw_dir,
    }


@router.post("/knowledge/{serial_number}/upload/openie", summary="上传OpenIE JSON文件到openie目录")
async def upload_openie_files(
    serial_number: str,
    files: List[UploadFile] = File(...),
    clear_existing: bool = Form(False),
):
    """
    上传已提取好的 OpenIE JSON 文件到 data/openie 目录。
    - clear_existing=true 时先清空目录
    """
    config = _get_instance_config(serial_number)
    if not config:
        raise HTTPException(404, f"未找到实例 {serial_number}")

    bot_path = _get_bot_path(config)
    if not bot_path:
        raise HTTPException(400, "实例路径未配置")

    openie_dir = os.path.join(bot_path, "data", "openie")
    os.makedirs(openie_dir, exist_ok=True)

    if clear_existing:
        for f in os.listdir(openie_dir):
            fp = os.path.join(openie_dir, f)
            if os.path.isfile(fp):
                os.remove(fp)

    saved = []
    for upload in files:
        if not upload.filename or not upload.filename.lower().endswith(".json"):
            continue
        safe_name = _safe_filename(upload.filename)
        if not safe_name:
            continue
        dest = os.path.join(openie_dir, safe_name)
        _validate_path_within(dest, openie_dir)
        content = await upload.read()
        with open(dest, "wb") as f:
            f.write(content)
        saved.append(safe_name)

    return {
        "success": True,
        "saved_files": saved,
        "count": len(saved),
        "directory": openie_dir,
    }


class DeleteFileRequest(BaseModel):
    folder: str
    filename: str

@router.post("/knowledge/{serial_number}/delete_file", summary="删除指定文件")
async def delete_file(serial_number: str, req: DeleteFileRequest):
    """删除 lpmm_raw_data 或 openie 目录中的单个文件。"""
    if req.folder not in ("raw_data", "openie"):
        raise HTTPException(400, "folder 必须为 raw_data 或 openie")

    config = _get_instance_config(serial_number)
    if not config:
        raise HTTPException(404, f"未找到实例 {serial_number}")

    bot_path = _get_bot_path(config)
    if not bot_path:
        raise HTTPException(400, "实例路径未配置")

    dir_name = "lpmm_raw_data" if req.folder == "raw_data" else "openie"
    base_dir = os.path.join(bot_path, "data", dir_name)
    safe_name = _safe_filename(req.filename)
    if not safe_name:
        raise HTTPException(400, "非法文件名")
    fp = os.path.join(base_dir, safe_name)
    _validate_path_within(fp, base_dir)

    if not os.path.isfile(fp):
        raise HTTPException(404, f"文件不存在: {safe_name}")

    os.remove(fp)
    return {"success": True, "deleted": safe_name}


@router.post("/knowledge/{serial_number}/clear/{folder}", summary="清空指定目录")
async def clear_folder(serial_number: str, folder: str):
    """
    清空 lpmm_raw_data 或 openie 目录。
    folder: "raw_data" | "openie"
    """
    if folder not in ("raw_data", "openie"):
        raise HTTPException(400, "folder 必须为 raw_data 或 openie")

    config = _get_instance_config(serial_number)
    if not config:
        raise HTTPException(404, f"未找到实例 {serial_number}")

    bot_path = _get_bot_path(config)
    if not bot_path:
        raise HTTPException(400, "实例路径未配置")

    dir_name = "lpmm_raw_data" if folder == "raw_data" else "openie"
    target_dir = os.path.join(bot_path, "data", dir_name)

    removed = 0
    if os.path.isdir(target_dir):
        for f in os.listdir(target_dir):
            fp = os.path.join(target_dir, f)
            if os.path.isfile(fp):
                os.remove(fp)
                removed += 1

    return {"success": True, "removed_count": removed}


@router.post("/knowledge/{serial_number}/run/extraction", summary="运行文本分割 & 实体提取")
async def run_extraction(serial_number: str):
    """
    >= 0.10.0: 运行 scripts/info_extraction.py（文本分割+实体提取合并）
    >= 0.8.0:  同上
    < 0.8.0:   运行 scripts/raw_data_preprocessor.py（仅文本分割）
    
    后台异步执行，返回 task_key 供轮询状态。
    """
    config = _get_instance_config(serial_number)
    if not config:
        raise HTTPException(404, f"未找到实例 {serial_number}")

    bot_path = _get_bot_path(config)
    if not bot_path:
        raise HTTPException(400, "实例路径未配置")

    version = _get_version(config)
    tk = _task_key(serial_number, "extraction")

    # 检查是否已有任务在运行
    if tk in _running_tasks and _running_tasks[tk]["status"] == "running":
        raise HTTPException(409, "该实例已有提取任务在运行中")

    use_venv = _is_version_gte(version, 8)

    if _is_version_gte(version, 8):
        script = "scripts/info_extraction.py"
    else:
        script = "scripts/raw_data_preprocessor.py"

    # 检查脚本存在
    if not os.path.exists(os.path.join(bot_path, script)):
        raise HTTPException(400, f"脚本不存在: {script}")

    cmd_str = _build_cmd_string(bot_path, [f'python {script}'], use_venv=use_venv)
    _launch_in_new_console(cmd_str, bot_path, tk)

    return {
        "success": True,
        "task_key": tk,
        "script": script,
        "message": "提取任务已启动",
    }


@router.post("/knowledge/{serial_number}/run/import", summary="运行知识图谱导入")
async def run_import(serial_number: str):
    """
    运行 scripts/import_openie.py 进行知识图谱导入。
    后台异步执行，返回 task_key 供轮询状态。
    """
    config = _get_instance_config(serial_number)
    if not config:
        raise HTTPException(404, f"未找到实例 {serial_number}")

    bot_path = _get_bot_path(config)
    if not bot_path:
        raise HTTPException(400, "实例路径未配置")

    version = _get_version(config)
    tk = _task_key(serial_number, "import")

    if tk in _running_tasks and _running_tasks[tk]["status"] == "running":
        raise HTTPException(409, "该实例已有导入任务在运行中")

    script = "scripts/import_openie.py"
    if not os.path.exists(os.path.join(bot_path, script)):
        raise HTTPException(400, f"脚本不存在: {script}")

    use_venv = _is_version_gte(version, 8)
    cmd_str = _build_cmd_string(bot_path, [f'python {script}'], use_venv=use_venv)
    _launch_in_new_console(cmd_str, bot_path, tk)

    return {
        "success": True,
        "task_key": tk,
        "script": script,
        "message": "导入任务已启动",
    }


@router.post("/knowledge/{serial_number}/run/pipeline", summary="一条龙：提取 → 导入")
async def run_pipeline(serial_number: str):
    """
    >= 0.10.0: info_extraction.py → import_openie.py（顺序执行）
    >= 0.8.0:  同上
    < 0.8.0:   raw_data_preprocessor.py → info_extraction.py → import_openie.py
    
    后台异步顺序执行，返回 task_key。
    """
    config = _get_instance_config(serial_number)
    if not config:
        raise HTTPException(404, f"未找到实例 {serial_number}")

    bot_path = _get_bot_path(config)
    if not bot_path:
        raise HTTPException(400, "实例路径未配置")

    version = _get_version(config)
    tk = _task_key(serial_number, "pipeline")

    if tk in _running_tasks and _running_tasks[tk]["status"] == "running":
        raise HTTPException(409, "该实例已有流水线任务在运行中")

    use_venv = _is_version_gte(version, 8)

    if _is_version_gte(version, 8):
        scripts = ["scripts/info_extraction.py", "scripts/import_openie.py"]
    else:
        scripts = ["scripts/raw_data_preprocessor.py", "scripts/info_extraction.py", "scripts/import_openie.py"]

    # 检查所有脚本存在
    for s in scripts:
        if not os.path.exists(os.path.join(bot_path, s)):
            raise HTTPException(400, f"脚本不存在: {s}")

    # 构建一条龙命令
    script_parts = []
    for s in scripts:
        script_parts.append(f'echo === 正在执行: {s} ===')
        script_parts.append(f'python {s}')
    cmd_str = _build_cmd_string(bot_path, script_parts, use_venv=use_venv)
    _launch_in_new_console(cmd_str, bot_path, tk)

    return {
        "success": True,
        "task_key": tk,
        "scripts": scripts,
        "message": "流水线任务已启动",
    }


@router.get("/knowledge/task/{task_key}/status", summary="查询后台任务状态")
async def get_task_status(task_key: str):
    """
    轮询后台任务状态。
    返回 status: "running" | "done" | "error"，以及最近日志。
    """
    _cleanup_old_tasks()
    task = _running_tasks.get(task_key)
    if not task:
        raise HTTPException(404, f"任务不存在: {task_key}")

    return {
        "success": True,
        "task_key": task_key,
        "status": task["status"],
        "pid": task.get("pid"),
        "return_code": task.get("return_code"),
        "log_lines": task["log"][-100:],  # 返回最近100行
        "total_lines": len(task["log"]),
    }


@router.get("/knowledge/task/{task_key}/log", summary="获取完整任务日志")
async def get_task_log(task_key: str, offset: int = 0):
    """获取任务日志，支持 offset 分页"""
    task = _running_tasks.get(task_key)
    if not task:
        raise HTTPException(404, f"任务不存在: {task_key}")

    logs = task["log"]
    return {
        "success": True,
        "task_key": task_key,
        "status": task["status"],
        "offset": offset,
        "lines": logs[offset:],
        "total": len(logs),
    }


@router.post("/knowledge/{serial_number}/stop", summary="终止知识库构建任务")
async def stop_knowledge_task(serial_number: str):
    """终止该实例所有正在运行的知识库构建任务（杀死 CMD 窗口及其子进程）"""
    stopped = []
    for task_type in ("extraction", "import", "pipeline"):
        tk = _task_key(serial_number, task_type)
        task = _running_tasks.get(tk)
        if not task or task["status"] != "running" or not task.get("pid"):
            continue
        pid = task["pid"]
        try:
            # taskkill /F /T 强制终止进程树
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(pid)],
                capture_output=True, timeout=10,
                creationflags=subprocess.CREATE_NO_WINDOW,
            )
            task["status"] = "stopped"
            task["log"].append(f"任务已被终止 (PID: {pid})")
            stopped.append(tk)
        except Exception as e:
            task["log"].append(f"终止失败: {e}")

    if not stopped:
        return {"success": True, "message": "没有正在运行的构建任务"}
    return {"success": True, "stopped": stopped, "message": f"已终止 {len(stopped)} 个任务"}


# ============================================================
# 知识库设置 (bot_config.toml [lpmm_knowledge])
# ============================================================

_LPMM_DEFAULTS: Dict[str, Any] = {
    "enable": False,
    "lpmm_mode": "agent",
    "rag_synonym_search_top_k": 10,
    "rag_synonym_threshold": 0.8,
    "info_extraction_workers": 3,
    "qa_relation_search_top_k": 10,
    "qa_relation_threshold": 0.5,
    "qa_paragraph_search_top_k": 1000,
    "qa_paragraph_node_weight": 0.05,
    "qa_ent_filter_top_k": 10,
    "qa_ppr_damping": 0.8,
    "qa_res_top_k": 3,
    "embedding_dimension": 1024,
    "max_embedding_workers": 3,
    "embedding_chunk_size": 4,
    "max_synonym_entities": 2000,
    "enable_ppr": True,
}


def _read_toml(path: str) -> Dict[str, Any]:
    """读取 toml 文件，兼容 toml / tomli / 内置 tomllib"""
    if toml_lib:
        if hasattr(toml_lib, 'load'):
            # toml 库
            try:
                with open(path, "r", encoding="utf-8") as f:
                    return toml_lib.load(f)
            except Exception:
                with open(path, "rb") as f:
                    return toml_lib.load(f)
        else:
            with open(path, "rb") as f:
                return toml_lib.load(f)
    # fallback: Python 3.11+ tomllib
    import tomllib
    with open(path, "rb") as f:
        return tomllib.load(f)


def _write_toml(path: str, data: Dict[str, Any]):
    """写入 toml 文件"""
    if toml_writer:
        with open(path, "w", encoding="utf-8") as f:
            toml_writer.dump(data, f)
        return
    # 简易 fallback：手动序列化
    lines = []
    # 先写非 table 的顶层键
    for k, v in data.items():
        if isinstance(v, dict):
            continue
        lines.append(f"{k} = {_toml_val(v)}")
    # 再写 table
    for k, v in data.items():
        if isinstance(v, dict):
            lines.append(f"\n[{k}]")
            for sk, sv in v.items():
                lines.append(f"{sk} = {_toml_val(sv)}")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def _toml_val(v: Any) -> str:
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, str):
        return f'"{v}"'
    return str(v)


_LPMM_HEADER_RE = re.compile(r'^\s*\[\s*lpmm_knowledge\s*\]\s*(?:[#;].*)?$', re.IGNORECASE)
_TABLE_HEADER_RE = re.compile(r'^\s*\[\[?.+?\]\]?\s*(?:[#;].*)?$')
_KEY_VALUE_LINE_RE = re.compile(r'^(\s*)([A-Za-z0-9_]+)(\s*=\s*)(.*?)(\r?\n?)$')


def _split_toml_value_and_comment(raw_value: str) -> tuple[str, str]:
    """
    拆分 toml 行中的 value 与行尾注释。
    仅处理单行值，且避免把字符串内的 # / ; 误判为注释。
    """
    in_double = False
    in_single = False
    escaped = False
    for idx, ch in enumerate(raw_value):
        if ch == '"' and not in_single and not escaped:
            in_double = not in_double
        elif ch == "'" and not in_double:
            in_single = not in_single
        elif (ch == '#' or ch == ';') and not in_double and not in_single:
            return raw_value[:idx].rstrip(), raw_value[idx:]
        escaped = (ch == '\\' and in_double and not escaped)
        if ch != '\\':
            escaped = False
    return raw_value.rstrip(), ""


def _update_lpmm_section_in_place(raw: str, updates: Dict[str, Any]) -> tuple[str, Dict[str, Any], bool]:
    """
    仅在 [lpmm_knowledge] 段中原位更新已存在键，不新增键。
    返回: (新文本, 实际更新键值, 是否找到该段)
    """
    lines = raw.splitlines(keepends=True)
    section_start = None
    for i, line in enumerate(lines):
        if _LPMM_HEADER_RE.match(line):
            section_start = i
            break
    if section_start is None:
        return raw, {}, False

    section_end = len(lines)
    for i in range(section_start + 1, len(lines)):
        if _TABLE_HEADER_RE.match(lines[i]) and not _LPMM_HEADER_RE.match(lines[i]):
            section_end = i
            break

    applied: Dict[str, Any] = {}
    for i in range(section_start + 1, section_end):
        m = _KEY_VALUE_LINE_RE.match(lines[i])
        if not m:
            continue
        indent, key, eq, value_and_comment, newline = m.groups()
        if key not in _LPMM_DEFAULTS or key not in updates:
            continue

        _, comment = _split_toml_value_and_comment(value_and_comment)
        new_line = f"{indent}{key}{eq}{_toml_val(updates[key])}"
        if comment:
            if comment[0] not in (" ", "\t"):
                new_line += " "
            new_line += comment
        if newline:
            new_line += newline
        lines[i] = new_line
        applied[key] = updates[key]

    return "".join(lines), applied, True


def _get_bot_config_path(config: Dict[str, Any]) -> Optional[str]:
    """获取 bot_config.toml 路径"""
    bot_path = _get_bot_path(config)
    if not bot_path:
        return None
    p = os.path.join(bot_path, "config", "bot_config.toml")
    return p if os.path.isfile(p) else None


@router.get("/knowledge/{serial_number}/settings", summary="读取知识库设置")
async def get_knowledge_settings(serial_number: str):
    config = _get_instance_config(serial_number)
    if not config:
        raise HTTPException(404, f"未找到实例 {serial_number}")
    if config.get("bot_type") == "MoFox_bot":
        raise HTTPException(400, "MoFox_bot 不支持 LPMM 知识库功能")

    cfg_path = _get_bot_config_path(config)
    if not cfg_path:
        return {"success": True, "settings": dict(_LPMM_DEFAULTS), "from_default": True, "source_keys": []}

    try:
        data = _read_toml(cfg_path)
    except Exception as e:
        raise HTTPException(500, f"读取配置失败: {e}")

    section = data.get("lpmm_knowledge", {})
    if not isinstance(section, dict):
        section = {}
    merged = {**_LPMM_DEFAULTS, **section}
    source_keys = [k for k in _LPMM_DEFAULTS.keys() if k in section]
    return {"success": True, "settings": merged, "from_default": False, "source_keys": source_keys}


class LpmmSettingsRequest(BaseModel):
    settings: Dict[str, Any]

@router.post("/knowledge/{serial_number}/settings", summary="保存知识库设置")
async def save_knowledge_settings(serial_number: str, req: LpmmSettingsRequest):
    config = _get_instance_config(serial_number)
    if not config:
        raise HTTPException(404, f"未找到实例 {serial_number}")
    if config.get("bot_type") == "MoFox_bot":
        raise HTTPException(400, "MoFox_bot 不支持 LPMM 知识库功能")

    bot_path = _get_bot_path(config)
    if not bot_path:
        raise HTTPException(400, "实例路径未配置")

    cfg_path = os.path.join(bot_path, "config", "bot_config.toml")
    os.makedirs(os.path.dirname(cfg_path), exist_ok=True)
    if not os.path.isfile(cfg_path):
        raise HTTPException(400, "未找到 bot_config.toml，无法只更新源字段")

    try:
        with open(cfg_path, "r", encoding="utf-8") as f:
            raw = f.read()

        filtered_updates = {k: v for k, v in req.settings.items() if k in _LPMM_DEFAULTS}
        new_raw, applied, found_section = _update_lpmm_section_in_place(raw, filtered_updates)
        if not found_section:
            raise HTTPException(400, "配置文件缺少 [lpmm_knowledge] 段，无法只更新源字段")

        if new_raw != raw:
            with open(cfg_path, "w", encoding="utf-8") as f:
                f.write(new_raw)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"保存配置失败: {e}")

    return {"success": True, "settings": applied, "updated_keys": list(applied.keys())}
