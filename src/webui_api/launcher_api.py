# -*- coding: utf-8 -*-
"""
启动器管理API模块
为WebUI提供启动/停止实例的API接口
"""
import os
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from datetime import datetime

from ..modules.launcher import launcher
from ..modules.config_manager import config_manager
from ..utils.version_detector import is_plugin_adapter_version
from .auth_core import require_action

router = APIRouter()


# --- 请求/响应模型 ---

class StartInstanceRequest(BaseModel):
    """启动实例请求"""
    serial_number: str
    components: List[str]  # 要启动的组件列表，如 ["mai", "adapter", "napcat", "webui"]
    use_napcat_shell: bool = False  # 是否使用 NapCat.Shell 快捷登录


class StopInstanceRequest(BaseModel):
    """停止实例请求"""
    serial_number: str


class RestartProcessRequest(BaseModel):
    """重启进程请求"""
    pid: int


# --- 辅助函数 ---

_instance_launchers: Dict[str, Any] = {}

def get_instance_config(serial_number: str) -> Optional[Dict[str, Any]]:
    """根据序列号获取实例配置"""
    configs = config_manager.get_all_configurations()
    for config in configs.values():
        if config.get("serial_number") == serial_number:
            return config
    return None


def get_instance_launcher(serial_number: str):
    """获取实例对应的启动器（缓存+共享全局process_manager）"""
    if serial_number in _instance_launchers:
        return _instance_launchers[serial_number]

    config = get_instance_config(serial_number)
    if not config:
        return None

    instance_launcher = launcher.__class__()
    instance_launcher._process_manager = launcher._process_manager
    instance_launcher._register_components(config)
    instance_launcher._config = config

    _instance_launchers[serial_number] = instance_launcher
    return instance_launcher


def _is_plugin_adapter_config(config: Dict[str, Any]) -> bool:
    install_options = config.get("install_options", {})
    if install_options.get("adapter_mode") == "plugin" or config.get("adapter_mode") == "plugin":
        return True
    return is_plugin_adapter_version(config.get("version_path", ""), config.get("bot_type", "MaiBot"))


# --- API端点 ---

@router.get("/instances/{serial_number}/status", summary="获取实例运行状态")
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

        for proc in running_processes:
            if proc.get("_instance_id") == serial_number:
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


@router.post("/instances/{serial_number}/start", summary="启动实例", dependencies=[Depends(require_action("instances.control"))])
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

        if "adapter" in request.components and _is_plugin_adapter_config(config):
            raise HTTPException(status_code=400, detail="当前适配器以插件形式加载，不能单独启动")
        
        # 创建启动器实例并启动
        instance_launcher = get_instance_launcher(serial_number)
        if not instance_launcher:
            raise HTTPException(status_code=500, detail="创建启动器失败")
        
        # 验证配置
        errors = instance_launcher.validate_configuration(config, request.components)
        if errors:
            return {
                "success": False,
                "message": "配置验证失败",
                "errors": errors
            }
        
        # 启动组件
        success = instance_launcher.launch(request.components, from_webui=True, use_napcat_shell=request.use_napcat_shell)
        
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


@router.post("/instances/{serial_number}/stop", summary="停止实例", dependencies=[Depends(require_action("instances.control"))])
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

        # 通过 _instance_id 匹配属于该实例的进程
        stopped_pids = []
        for proc in running_processes:
            if proc.get("_instance_id") == serial_number:
                pid = proc.get("pid")
                if pid:
                    success = launcher._process_manager.stop_process(pid)
                    if success:
                        stopped_pids.append(pid)
        
        # 额外处理：NapCat进程可能通过.bat脚本启动，cmd进程已退出但NapCat子进程仍在运行
        # 通过进程名查找并终止残留的NapCat进程（仅限该实例路径下的）
        try:
            import psutil
            napcat_names = {"napcat.exe", "napcatwinbootmain.exe"}
            instance_napcat_path = config.get("napcat_path", "")
            for proc in psutil.process_iter(["pid", "name", "exe"]):
                try:
                    if proc.info["name"] and proc.info["name"].lower() in napcat_names:
                        # 仅终止属于该实例 napcat_path 下的进程
                        proc_exe = proc.info.get("exe") or ""
                        if instance_napcat_path and proc_exe and os.path.realpath(proc_exe).startswith(os.path.realpath(instance_napcat_path)):
                            proc.terminate()
                            try:
                                proc.wait(timeout=3)
                            except psutil.TimeoutExpired:
                                proc.kill()
                            stopped_pids.append(proc.info["pid"])
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
        except Exception:
            pass
        
        return {
            "success": True,
            "message": f"已停止 {len(stopped_pids)} 个进程",
            "stopped_pids": stopped_pids
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"停止实例失败: {str(e)}")


@router.get("/processes", summary="获取所有运行中的进程")
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


@router.get("/processes/{pid}", summary="获取进程详情")
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


@router.post("/processes/{pid}/stop", summary="停止指定进程", dependencies=[Depends(require_action("instances.control"))])
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


@router.post("/processes/{pid}/restart", summary="重启指定进程", dependencies=[Depends(require_action("instances.control"))])
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


@router.get("/components/{serial_number}", summary="获取实例可用组件")
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


@router.get("/validate/{serial_number}", summary="验证实例配置")
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
