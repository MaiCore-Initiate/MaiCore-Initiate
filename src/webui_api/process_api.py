# -*- coding: utf-8 -*-
"""
进程管理API模块
为WebUI提供进程监控和管理的API接口
"""
import os
import psutil
import time
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from datetime import datetime

router = APIRouter()


# --- 请求/响应模型 ---

class ProcessFilter(BaseModel):
    """进程过滤条件"""
    name: Optional[str] = None
    port: Optional[int] = None


# --- 辅助函数 ---

def get_process_by_port(port: int) -> Optional[Dict[str, Any]]:
    """通过端口查找进程"""
    for proc in psutil.process_iter(['pid', 'name', 'connections']):
        try:
            connections = proc.connections()
            for conn in connections:
                if conn.laddr.port == port:
                    return {
                        "pid": proc.pid,
                        "name": proc.name(),
                        "port": port
                    }
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    return None


def get_all_managed_processes() -> List[Dict[str, Any]]:
    """获取所有受管进程"""
    return []


# --- API端点 ---

@router.get("/process/list", summary="获取所有进程")
async def get_process_list():
    """获取当前系统所有进程"""
    try:
        processes = []
        for proc in psutil.process_iter(['pid', 'name', 'status', 'cpu_percent', 'memory_percent']):
            try:
                info = proc.info
                processes.append({
                    "pid": info.get('pid'),
                    "name": info.get('name'),
                    "status": info.get('status'),
                    "cpu_percent": info.get('cpu_percent', 0),
                    "memory_percent": info.get('memory_percent', 0)
                })
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        
        return {
            "success": True,
            "count": len(processes),
            "processes": processes
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取进程列表失败: {str(e)}")


@router.get("/process/{pid}", summary="获取进程详情")
async def get_process_detail(pid: int):
    """
    获取指定进程的详细信息
    
    - **pid**: 进程PID
    """
    try:
        proc = psutil.Process(pid)
        
        with proc.oneshot():
            detail = {
                "pid": proc.pid,
                "name": proc.name(),
                "status": proc.status(),
                "create_time": datetime.fromtimestamp(proc.create_time()).isoformat(),
                "cpu_percent": proc.cpu_percent(),
                "memory_info": {
                    "rss": proc.memory_info().rss,
                    "rss_mb": proc.memory_info().rss / (1024 * 1024),
                    "vms": proc.memory_info().vms,
                    "vms_mb": proc.memory_info().vms / (1024 * 1024)
                },
                "num_threads": proc.num_threads(),
                "connections": len(proc.connections()),
                "cmdline": proc.cmdline(),
                "cwd": proc.cwd(),
                "exe": proc.exe(),
                "username": proc.username()
            }
        
        return {
            "success": True,
            "process": detail
        }
    except psutil.NoSuchProcess:
        raise HTTPException(status_code=404, detail=f"进程 {pid} 不存在")
    except psutil.AccessDenied:
        raise HTTPException(status_code=403, detail=f"无权限访问进程 {pid}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取进程详情失败: {str(e)}")


@router.get("/process/{pid}/memory", summary="获取进程内存详情")
async def get_process_memory(pid: int):
    """
    获取进程的内存使用详情
    
    - **pid**: 进程PID
    """
    try:
        proc = psutil.Process(pid)
        mem = proc.memory_info()
        
        return {
            "success": True,
            "pid": pid,
            "memory": {
                "rss": mem.rss,
                "rss_mb": round(mem.rss / (1024 * 1024), 2),
                "vms": mem.vms,
                "vms_mb": round(mem.vms / (1024 * 1024), 2),
                "percent": round(proc.memory_percent(), 2)
            }
        }
    except psutil.NoSuchProcess:
        raise HTTPException(status_code=404, detail=f"进程 {pid} 不存在")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取进程内存失败: {str(e)}")


@router.get("/process/{pid}/cpu", summary="获取进程CPU使用率")
async def get_process_cpu(pid: int):
    """
    获取进程的CPU使用率
    
    - **pid**: 进程PID
    """
    try:
        proc = psutil.Process(pid)
        
        # CPU使用率需要间隔采样
        cpu_percent = proc.cpu_percent(interval=0.1)
        
        return {
            "success": True,
            "pid": pid,
            "cpu_percent": cpu_percent,
            "num_threads": proc.num_threads()
        }
    except psutil.NoSuchProcess:
        raise HTTPException(status_code=404, detail=f"进程 {pid} 不存在")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取CPU使用率失败: {str(e)}")


@router.get("/process/port/{port}", summary="通过端口查找进程")
async def get_process_by_port_api(port: int):
    """
    通过端口查找对应进程
    
    - **port**: 端口号
    """
    try:
        result = get_process_by_port(port)
        
        if result:
            return {
                "success": True,
                "port": port,
                "process": result
            }
        else:
            return {
                "success": False,
                "port": port,
                "message": f"未找到使用端口 {port} 的进程"
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"查找进程失败: {str(e)}")


@router.get("/process/search", summary="搜索进程")
async def search_processes(name: str = None):
    """
    根据名称搜索进程
    
    - **name**: 进程名称（支持模糊匹配）
    """
    try:
        results = []
        for proc in psutil.process_iter(['pid', 'name', 'status']):
            try:
                proc_name = proc.info.get('name', '')
                if name and name.lower() in proc_name.lower():
                    results.append({
                        "pid": proc.pid,
                        "name": proc_name,
                        "status": proc.info.get('status')
                    })
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        
        return {
            "success": True,
            "count": len(results),
            "processes": results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"搜索进程失败: {str(e)}")


@router.get("/process/system", summary="获取系统资源使用情况")
async def get_system_resources():
    """获取系统整体资源使用情况"""
    try:
        cpu_count = psutil.cpu_count()
        cpu_percent = psutil.cpu_percent(interval=0.1, percpu=True)
        
        memory = psutil.virtual_memory()
        swap = psutil.swap_memory()
        
        disk = psutil.disk_usage('/')
        
        return {
            "success": True,
            "cpu": {
                "count": cpu_count,
                "percent": sum(cpu_percent) / len(cpu_percent) if cpu_percent else 0,
                "per_cpu": cpu_percent
            },
            "memory": {
                "total": memory.total,
                "available": memory.available,
                "used": memory.used,
                "percent": memory.percent,
                "total_gb": round(memory.total / (1024**3), 2),
                "available_gb": round(memory.available / (1024**3), 2),
                "used_gb": round(memory.used / (1024**3), 2)
            },
            "swap": {
                "total": swap.total,
                "used": swap.used,
                "percent": swap.percent
            },
            "disk": {
                "total": disk.total,
                "used": disk.used,
                "free": disk.free,
                "percent": disk.percent
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取系统资源失败: {str(e)}")


@router.get("/process/network", summary="获取网络连接")
async def get_network_connections():
    """获取当前系统网络连接"""
    try:
        connections = []
        for conn in psutil.net_connections(kind='inet'):
            try:
                connections.append({
                    "family": str(conn.family),
                    "type": str(conn.type),
                    "local_addr": f"{conn.laddr.ip}:{conn.laddr.port}" if conn.laddr else None,
                    "remote_addr": f"{conn.raddr.ip}:{conn.raddr.port}" if conn.raddr else None,
                    "status": conn.status,
                    "pid": conn.pid
                })
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        
        return {
            "success": True,
            "count": len(connections),
            "connections": connections[:100]  # 限制返回数量
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取网络连接失败: {str(e)}")
