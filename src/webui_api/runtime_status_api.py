# -*- coding: utf-8 -*-
"""
运行状态可视化API
为WebUI状态页提供总览、实时指标和进程详情接口
"""
import time
import subprocess
from datetime import datetime
from typing import Dict, Any, List, Optional

import psutil
from fastapi import APIRouter, Depends, HTTPException

from ..modules.launcher import launcher
from ..modules.config_manager import config_manager
from .auth_core import require_action

router = APIRouter()


def _iso_now() -> str:
    return datetime.now().isoformat()


def _safe_iso(ts: Optional[float]) -> Optional[str]:
    if ts is None:
        return None
    try:
        return datetime.fromtimestamp(ts).isoformat()
    except Exception:
        return None


def _get_instance_name_map() -> Dict[str, str]:
    """
    serial_number -> nickname
    """
    mapping: Dict[str, str] = {}
    try:
        configs = config_manager.get_all_configurations()
        for cfg in configs.values():
            serial = str(cfg.get("serial_number") or "").strip()
            if not serial:
                continue
            nickname = str(cfg.get("nickname_path") or serial)
            mapping[serial] = nickname
    except Exception:
        pass
    return mapping


def _get_cached_process(pid: int) -> psutil.Process:
    """
    复用 launcher 内部进程缓存，保持与 launcher.show_running_processes 一致的 CPU 采样语义。
    """
    cache = getattr(launcher, "_process_cache", None)
    if not isinstance(cache, dict):
        cache = {}
        setattr(launcher, "_process_cache", cache)

    proc = cache.get(pid)
    if proc is None:
        proc = psutil.Process(pid)
        proc.cpu_percent()  # 预热采样
        cache[pid] = proc
    return proc


def _sample_cpu_percent(pid: int) -> float:
    try:
        proc = _get_cached_process(pid)
        return round(float(proc.cpu_percent()), 2)
    except Exception:
        return 0.0


def _managed_process_snapshots() -> List[Dict[str, Any]]:
    """
    返回 launcher 托管的活跃进程快照。
    """
    snapshots: List[Dict[str, Any]] = []
    instance_name_map = _get_instance_name_map()

    # 先用 launcher 自身方法过滤掉已退出进程
    managed = launcher._process_manager.get_running_processes_info()

    for info in managed:
        pid = info.get("pid")
        if not pid:
            continue

        try:
            proc = psutil.Process(pid)
            with proc.oneshot():
                mem_info = proc.memory_info()
                mem_mb = round(mem_info.rss / (1024 * 1024), 2)
                mem_pct = round(proc.memory_percent(), 2)
                status = proc.status()
                thread_count = proc.num_threads()
                create_time = proc.create_time()

            instance_id = str(info.get("_instance_id") or "")
            snapshot = {
                "pid": pid,
                "title": info.get("title", ""),
                "component": info.get("_component", ""),
                "instance_id": instance_id or None,
                "instance_name": instance_name_map.get(instance_id, instance_id) if instance_id else None,
                "command": info.get("command", ""),
                "cwd": info.get("cwd", ""),
                "status": status,
                "cpu_percent": _sample_cpu_percent(pid),
                "memory_mb": mem_mb,
                "memory_percent": mem_pct,
                "thread_count": thread_count,
                "start_time": info.get("start_time"),
                "start_time_iso": _safe_iso(info.get("start_time") or create_time),
                "uptime_s": max(0, round(time.time() - (info.get("start_time") or create_time), 1)),
            }
            snapshots.append(snapshot)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
        except Exception:
            continue

    # 清理已经不活跃的缓存
    cache = getattr(launcher, "_process_cache", None)
    if isinstance(cache, dict):
        alive_pids = {p["pid"] for p in snapshots}
        for pid in list(cache.keys()):
            if pid not in alive_pids:
                del cache[pid]

    snapshots.sort(key=lambda x: x.get("memory_mb", 0), reverse=True)
    return snapshots


def _system_snapshot() -> Dict[str, Any]:
    vm = psutil.virtual_memory()
    data = {
        "cpu_percent": round(psutil.cpu_percent(interval=None), 2),
        "cpu_count": psutil.cpu_count(),
        "memory_percent": round(vm.percent, 2),
        "memory_used_mb": round(vm.used / (1024 * 1024), 2),
        "memory_total_mb": round(vm.total / (1024 * 1024), 2),
        "memory_available_mb": round(vm.available / (1024 * 1024), 2),
        "gpu_available": False,
        "gpu_name": None,
        "gpu_percent": None,
        "gpu_memory_used_mb": None,
        "gpu_memory_total_mb": None,
    }
    try:
        result = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=name,utilization.gpu,memory.used,memory.total",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            text=True,
            timeout=1.0,
            creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, "CREATE_NO_WINDOW") else 0,
        )
        if result.returncode == 0 and result.stdout.strip():
            names: List[str] = []
            utils: List[float] = []
            mem_used: List[float] = []
            mem_total: List[float] = []
            for line in result.stdout.strip().splitlines():
                parts = [p.strip() for p in line.split(",")]
                if len(parts) < 4:
                    continue
                names.append(parts[0])
                try:
                    utils.append(float(parts[1]))
                except Exception:
                    pass
                try:
                    mem_used.append(float(parts[2]))
                except Exception:
                    pass
                try:
                    mem_total.append(float(parts[3]))
                except Exception:
                    pass

            if utils or mem_used or mem_total or names:
                data["gpu_available"] = True
                data["gpu_name"] = names[0] if names else "NVIDIA GPU"
                data["gpu_percent"] = round(sum(utils) / len(utils), 2) if utils else 0.0
                data["gpu_memory_used_mb"] = round(sum(mem_used), 2) if mem_used else 0.0
                data["gpu_memory_total_mb"] = round(sum(mem_total), 2) if mem_total else 0.0
    except Exception:
        pass

    return data


def _find_managed_process_info(pid: int) -> Optional[Dict[str, Any]]:
    for info in launcher._process_manager.running_processes:
        current_pid = info.get("pid")
        if not current_pid and info.get("process") is not None:
            current_pid = info["process"].pid
        if current_pid == pid:
            return info
    return None


@router.get("/overview", summary="运行状态总览")
async def runtime_overview():
    processes = _managed_process_snapshots()
    system = _system_snapshot()

    by_component: Dict[str, int] = {}
    running_instances = set()
    for p in processes:
        comp = str(p.get("component") or "unknown")
        by_component[comp] = by_component.get(comp, 0) + 1
        if p.get("instance_id"):
            running_instances.add(str(p["instance_id"]))

    return {
        "success": True,
        "timestamp": _iso_now(),
        "system": system,
        "summary": {
            "total_processes": len(processes),
            "running_instances": len(running_instances),
            "total_memory_mb": round(sum(p.get("memory_mb", 0.0) for p in processes), 2),
            "avg_cpu_percent": round(sum(p.get("cpu_percent", 0.0) for p in processes) / len(processes), 2) if processes else 0.0,
            "by_component": by_component,
        },
        "processes": processes,
    }


@router.get("/metrics", summary="运行状态实时指标")
async def runtime_metrics():
    """
    轻量快照接口，适合前端 1s 轮询绘图。
    """
    processes = _managed_process_snapshots()
    return {
        "success": True,
        "timestamp": _iso_now(),
        "system": _system_snapshot(),
        "processes": [
            {
                "pid": p["pid"],
                "cpu_percent": p["cpu_percent"],
                "memory_mb": p["memory_mb"],
                "memory_percent": p["memory_percent"],
                "uptime_s": p["uptime_s"],
                "status": p["status"],
            }
            for p in processes
        ],
    }


@router.get("/processes/{pid}", summary="获取单个进程详情")
async def runtime_process_detail(pid: int):
    managed_info = _find_managed_process_info(pid)
    if managed_info is None:
        raise HTTPException(status_code=404, detail=f"未找到PID为 {pid} 的托管进程")

    try:
        proc = psutil.Process(pid)
    except psutil.NoSuchProcess:
        raise HTTPException(status_code=404, detail=f"进程 {pid} 已退出")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"读取进程失败: {str(e)}")

    try:
        with proc.oneshot():
            mem = proc.memory_info()
            create_time = proc.create_time()
            cmdline = proc.cmdline()
            io_raw = proc.io_counters() if hasattr(proc, "io_counters") else None
            children = proc.children(recursive=False)

            children_data = []
            for child in children:
                try:
                    cmem = child.memory_info()
                    children_data.append({
                        "pid": child.pid,
                        "name": child.name(),
                        "status": child.status(),
                        "cpu_percent": round(float(child.cpu_percent()), 2),
                        "memory_mb": round(cmem.rss / (1024 * 1024), 2),
                    })
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    continue

            connections = []
            try:
                for conn in proc.connections(kind="inet"):
                    local_addr = None
                    remote_addr = None
                    if conn.laddr:
                        local_addr = f"{conn.laddr.ip}:{conn.laddr.port}"
                    if conn.raddr:
                        remote_addr = f"{conn.raddr.ip}:{conn.raddr.port}"
                    connections.append({
                        "status": conn.status,
                        "local_addr": local_addr,
                        "remote_addr": remote_addr,
                    })
                connections = connections[:20]
            except Exception:
                pass

            detail = {
                "pid": pid,
                "name": proc.name(),
                "title": managed_info.get("title", ""),
                "component": managed_info.get("_component", ""),
                "instance_id": managed_info.get("_instance_id"),
                "status": proc.status(),
                "cpu_percent": _sample_cpu_percent(pid),
                "memory_mb": round(mem.rss / (1024 * 1024), 2),
                "memory_percent": round(proc.memory_percent(), 2),
                "rss_bytes": mem.rss,
                "vms_bytes": mem.vms,
                "thread_count": proc.num_threads(),
                "open_files": len(proc.open_files()),
                "create_time": create_time,
                "create_time_iso": _safe_iso(create_time),
                "uptime_s": max(0, round(time.time() - (managed_info.get("start_time") or create_time), 1)),
                "cwd": managed_info.get("cwd") or (proc.cwd() if hasattr(proc, "cwd") else ""),
                "exe": proc.exe() if hasattr(proc, "exe") else "",
                "username": proc.username() if hasattr(proc, "username") else "",
                "command": managed_info.get("command") or " ".join(cmdline),
                "cmdline": cmdline,
                "io": {
                    "read_bytes": getattr(io_raw, "read_bytes", 0) if io_raw else 0,
                    "write_bytes": getattr(io_raw, "write_bytes", 0) if io_raw else 0,
                    "read_count": getattr(io_raw, "read_count", 0) if io_raw else 0,
                    "write_count": getattr(io_raw, "write_count", 0) if io_raw else 0,
                },
                "children": children_data,
                "connections": connections,
            }
    except psutil.NoSuchProcess:
        raise HTTPException(status_code=404, detail=f"进程 {pid} 已退出")
    except psutil.AccessDenied:
        raise HTTPException(status_code=403, detail=f"无权限访问进程 {pid}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取进程详情失败: {str(e)}")

    return {"success": True, "timestamp": _iso_now(), "process": detail}


@router.post("/processes/{pid}/stop", summary="停止托管进程", dependencies=[Depends(require_action("instances.control"))])
async def runtime_stop_process(pid: int):
    success = launcher.stop_process(pid)
    if not success:
        return {"success": False, "message": f"停止进程 {pid} 失败"}
    return {"success": True, "message": f"进程 {pid} 已停止"}


@router.post("/processes/{pid}/restart", summary="重启托管进程", dependencies=[Depends(require_action("instances.control"))])
async def runtime_restart_process(pid: int):
    success = launcher.restart_process(pid)
    if not success:
        return {"success": False, "message": f"重启进程 {pid} 失败"}
    return {"success": True, "message": f"进程 {pid} 已重启"}
