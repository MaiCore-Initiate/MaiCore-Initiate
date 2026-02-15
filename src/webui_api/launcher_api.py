# -*- coding: utf-8 -*-
"""
启动器管理API模块
为WebUI提供启动/停止实例的API接口
"""
import os
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from datetime import datetime

from ..modules.launcher import launcher
from ..modules.config_manager import config_manager

router = APIRouter()


# --- 请求/响应模型 ---

class StartInstanceRequest(BaseModel):
    """启动实例请求"""
    serial_number: str
    components: List[str]  # 要启动的组件列表，如 ["mai", "adapter", "napcat", "webui"]


class StopInstanceRequest(BaseModel):
    """停止实例请求"""
    serial_number: str


class RestartProcessRequest(BaseModel):
    """重启进程请求"""
    pid: int


# --- 辅助函数 ---

def get_instance_config(serial_number: str) -> Optional[Dict[str, Any]]:
    """根据序列号获取实例配置"""
    configs = config_manager.get_all_configurations()
    for config in configs.values():
        if config.get("serial_number") == serial_number:
            return config
    return None


def get_instance_launcher(serial_number: str):
    """获取实例对应的启动器"""
    config = get_instance_config(serial_number)
    if not config:
        return None
    
    # 为每个实例创建独立的启动器实例
    instance_launcher = launcher.__class__()
    instance_launcher._process_manager = launcher._ProcessManager()
    instance_launcher._register_components(config)
    instance_launcher._config = config
    
    return instance_launcher


# --- API端点 ---

@router.get("/launcher/instances/{serial_number}/status", summary="获取实例运行状态")
async def get_instance_status(serial_number: str):
    """
    获取指定实例的运行状态
    
    - **serial_number**: 实例序列号
    """
    try:
        config = get_instance_config(serial_number)
        if not config:
            raise HTTPException(status_code=404, detail=f"未找到序列号为 {serial_number} 的实例")
        
        # 获取运行中的进程信息
        running_processes = launcher._process_manager.get_running_processes_info()
        
        # 过滤出属于该实例的进程
        instance_processes = []
        instance_path = config.get("mai_path") or config.get("mofox_path", "")
        
        for proc in running_processes:
            if instance_path and instance_path in proc.get("cwd", ""):
                instance_processes.append({
                    "pid": proc.get("pid"),
                    "title": proc.get("title"),
                    "command": proc.get("command"),
                    "cwd": proc.get("cwd"),
                    "start_time": proc.get("start_time"),
                    "memory_mb": proc.get("memory_mb", 0)
                })
        
        # 检查各组件状态
        components_status = {}
        launcher_instance = get_instance_launcher(serial_number)
        if launcher_instance:
            for comp_name, comp in launcher_instance._components.items():
                components_status[comp_name] = {
                    "name": comp.name,
                    "enabled": comp.is_enabled,
                    "running": False
                }
                
                # 检查组件是否在运行
                for proc in instance_processes:
                    if comp.name.lower() in proc.get("title", "").lower():
                        components_status[comp_name]["running"] = True
                        break
        
        return {
            "success": True,
            "serial_number": serial_number,
            "running": len(instance_processes) > 0,
            "processes": instance_processes,
            "components": components_status
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取实例状态失败: {str(e)}")


@router.post("/launcher/instances/{serial_number}/start", summary="启动实例")
async def start_instance(serial_number: str, request: StartInstanceRequest):
    """
    启动指定实例的组件
    
    - **serial_number**: 实例序列号
    - **components**: 要启动的组件列表
      - mai: 主程序
      - adapter: 适配器
      - napcat: NapCatQQ
      - mongodb: MongoDB
      - webui: WebUI
    """
    try:
        config = get_instance_config(serial_number)
        if not config:
            raise HTTPException(status_code=404, detail=f"未找到序列号为 {serial_number} 的实例")
        
        # 验证组件列表
        valid_components = ["mai", "adapter", "napcat", "mongodb", "webui"]
        for comp in request.components:
            if comp not in valid_components:
                raise HTTPException(status_code=400, detail=f"无效的组件: {comp}")
        
        # 创建启动器实例并启动
        instance_launcher = get_instance_launcher(serial_number)
        if not instance_launcher:
            raise HTTPException(status_code=500, detail="创建启动器失败")
        
        # 验证配置
        errors = instance_launcher.validate_configuration(config)
        if errors:
            return {
                "success": False,
                "message": "配置验证失败",
                "errors": errors
            }
        
        # 启动组件
        success = instance_launcher.launch(request.components)
        
        if success:
            return {
                "success": True,
                "message": f"实例 {serial_number} 启动成功",
                "components": request.components
            }
        else:
            return {
                "success": False,
                "message": f"实例 {serial_number} 启动失败"
            }
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"启动实例失败: {str(e)}")


@router.post("/launcher/instances/{serial_number}/stop", summary="停止实例")
async def stop_instance(serial_number: str):
    """
    停止指定实例的所有进程
    
    - **serial_number**: 实例序列号
    """
    try:
        config = get_instance_config(serial_number)
        if not config:
            raise HTTPException(status_code=404, detail=f"未找到序列号为 {serial_number} 的实例")
        
        # 获取实例相关的进程
        running_processes = launcher._process_manager.get_running_processes_info()
        instance_path = config.get("mai_path") or config.get("mofox_path", "")
        
        # 停止属于该实例的进程
        stopped_pids = []
        for proc in running_processes:
            if instance_path and instance_path in proc.get("cwd", ""):
                pid = proc.get("pid")
                if pid:
                    success = launcher._process_manager.stop_process(pid)
                    if success:
                        stopped_pids.append(pid)
        
        return {
            "success": True,
            "message": f"已停止 {len(stopped_pids)} 个进程",
            "stopped_pids": stopped_pids
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"停止实例失败: {str(e)}")


@router.get("/launcher/processes", summary="获取所有运行中的进程")
async def get_all_processes():
    """获取所有由启动器管理的运行中的进程"""
    try:
        running_processes = launcher._process_manager.get_running_processes_info()
        
        processes = []
        for proc in running_processes:
            processes.append({
                "pid": proc.get("pid"),
                "title": proc.get("title"),
                "command": proc.get("command"),
                "cwd": proc.get("cwd"),
                "start_time": datetime.fromtimestamp(proc.get("start_time", 0)).isoformat() if proc.get("start_time") else None,
                "memory_mb": proc.get("memory_mb", 0),
                "running_time": proc.get("running_time", 0)
            })
        
        return {
            "success": True,
            "count": len(processes),
            "processes": processes
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取进程列表失败: {str(e)}")


@router.get("/launcher/processes/{pid}", summary="获取进程详情")
async def get_process_detail(pid: int):
    """获取指定进程的详细信息"""
    try:
        # 获取托管进程的详细信息
        managed_info = None
        for info in launcher._process_manager.running_processes:
            if info.get("pid") == pid:
                managed_info = info
                break
        
        # 使用启动器的方法获取详情
        details = launcher.get_process_details(pid)
        
        if details:
            return {
                "success": True,
                "process": details
            }
        else:
            raise HTTPException(status_code=404, detail=f"未找到PID为 {pid} 的进程")
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取进程详情失败: {str(e)}")


@router.post("/launcher/processes/{pid}/stop", summary="停止指定进程")
async def stop_process(pid: int):
    """
    停止指定PID的进程
    
    - **pid**: 进程PID
    """
    try:
        success = launcher._process_manager.stop_process(pid)
        
        if success:
            return {
                "success": True,
                "message": f"进程 {pid} 已停止"
            }
        else:
            return {
                "success": False,
                "message": f"停止进程 {pid} 失败"
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"停止进程失败: {str(e)}")


@router.post("/launcher/processes/{pid}/restart", summary="重启指定进程")
async def restart_process(pid: int):
    """
    重启指定PID的进程
    
    - **pid**: 进程PID
    """
    try:
        success = launcher._process_manager.restart_process(pid)
        
        if success:
            return {
                "success": True,
                "message": f"进程 {pid} 已重启"
            }
        else:
            return {
                "success": False,
                "message": f"重启进程 {pid} 失败"
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"重启进程失败: {str(e)}")


@router.get("/launcher/components/{serial_number}", summary="获取实例可用组件")
async def get_instance_components(serial_number: str):
    """
    获取指定实例可用的组件列表
    
    - **serial_number**: 实例序列号
    """
    try:
        config = get_instance_config(serial_number)
        if not config:
            raise HTTPException(status_code=404, detail=f"未找到序列号为 {serial_number} 的实例")
        
        # 创建启动器实例
        instance_launcher = get_instance_launcher(serial_number)
        if not instance_launcher:
            raise HTTPException(status_code=500, detail="创建启动器失败")
        
        # 注册组件
        instance_launcher._register_components(config)
        
        # 返回组件信息
        components = []
        for comp_name, comp in instance_launcher._components.items():
            components.append({
                "id": comp_name,
                "name": comp.name,
                "enabled": comp.is_enabled,
                "description": _get_component_description(comp_name)
            })
        
        return {
            "success": True,
            "components": components
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取组件列表失败: {str(e)}")


def _get_component_description(component_id: str) -> str:
    """获取组件描述"""
    descriptions = {
        "mai": "Bot主程序",
        "adapter": "NapCat适配器",
        "napcat": "NapCatQQ (QQ协议端)",
        "mongodb": "MongoDB数据库",
        "webui": "WebUI控制面板"
    }
    return descriptions.get(component_id, "未知组件")


@router.get("/launcher/validate/{serial_number}", summary="验证实例配置")
async def validate_instance_config(serial_number: str):
    """
    验证实例配置是否有效
    
    - **serial_number**: 实例序列号
    """
    try:
        config = get_instance_config(serial_number)
        if not config:
            raise HTTPException(status_code=404, detail=f"未找到序列号为 {serial_number} 的实例")
        
        # 创建启动器实例
        instance_launcher = get_instance_launcher(serial_number)
        if not instance_launcher:
            raise HTTPException(status_code=500, detail="创建启动器失败")
        
        # 验证配置
        errors = instance_launcher.validate_configuration(config)
        
        return {
            "success": len(errors) == 0,
            "valid": len(errors) == 0,
            "errors": errors
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"验证配置失败: {str(e)}")
