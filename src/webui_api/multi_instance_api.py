# -*- coding: utf-8 -*-
"""
多开管理API模块
为WebUI提供实例多开管理的API接口
"""
import os
import shutil
import subprocess
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..modules.config_manager import config_manager

router = APIRouter()


# --- 请求/响应模型 ---

class CloneInstanceRequest(BaseModel):
    """克隆实例请求"""
    source_serial: str  # 源实例序列号
    new_nickname: str   # 新实例昵称
    new_serial: str     # 新实例序列号
    new_qq_account: str = ""  # 新实例QQ账号（可选）


class MultiLaunchConfig(BaseModel):
    """多开启动配置"""
    serial_number: str
    port_offset: int = 0  # 端口偏移量


# --- 辅助函数 ---

def get_instance_config(serial_number: str) -> Optional[Dict[str, Any]]:
    """根据序列号获取实例配置"""
    configs = config_manager.get_all_configurations()
    for name, config in configs.items():
        if config.get("serial_number") == serial_number:
            return config
    return None


def get_all_instances() -> List[Dict[str, Any]]:
    """获取所有实例"""
    configs = config_manager.get_all_configurations()
    instances = []
    for name, config in configs.items():
        instances.append({
            "id": name,
            "serial_number": config.get("serial_number", ""),
            "nickname": config.get("nickname_path", ""),
            "bot_type": config.get("bot_type", "MaiBot"),
            "version": config.get("version_path", "")
        })
    return instances


# --- API端点 ---

@router.get("/multi-instance/list", summary="获取所有实例")
async def list_instances():
    """获取所有已部署的实例列表"""
    try:
        instances = get_all_instances()
        return {
            "success": True,
            "count": len(instances),
            "instances": instances
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取实例列表失败: {str(e)}")


@router.get("/multi-instance/{serial_number}", summary="获取实例详情")
async def get_instance(serial_number: str):
    """获取指定实例的详细信息"""
    try:
        config = get_instance_config(serial_number)
        if not config:
            raise HTTPException(status_code=404, detail=f"未找到序列号为 {serial_number} 的实例")
        
        return {
            "success": True,
            "instance": config
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取实例详情失败: {str(e)}")


@router.post("/multi-instance/clone", summary="克隆实例")
async def clone_instance(request: CloneInstanceRequest):
    """
    克隆一个已存在的实例
    
    - **source_serial**: 源实例序列号
    - **new_nickname**: 新实例昵称
    - **new_serial**: 新实例序列号
    - **new_qq_account**: 新实例QQ账号（可选）
    """
    try:
        # 获取源实例配置
        source_config = get_instance_config(request.source_serial)
        if not source_config:
            raise HTTPException(status_code=404, detail=f"未找到序列号为 {request.source_serial} 的源实例")
        
        # 检查新序列号是否已存在
        all_configs = config_manager.get_all_configurations()
        for config in all_configs.values():
            if config.get("serial_number") == request.new_serial:
                raise HTTPException(status_code=400, detail=f"序列号 {request.new_serial} 已存在")
        
        # 获取源实例路径
        source_bot_type = source_config.get("bot_type", "MaiBot")
        source_path = source_config.get("mai_path") if source_bot_type == "MaiBot" else source_config.get("mofox_path")
        
        if not source_path or not os.path.exists(source_path):
            raise HTTPException(status_code=400, detail="源实例路径不存在")
        
        # 确定新实例路径
        source_dir = os.path.dirname(source_path)  # 实例目录
        new_dir = os.path.join(os.path.dirname(source_dir), request.new_nickname)
        
        if os.path.exists(new_dir):
            raise HTTPException(status_code=400, detail=f"目标目录已存在: {new_dir}")
        
        # 复制实例目录
        try:
            shutil.copytree(source_dir, new_dir)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"复制实例目录失败: {str(e)}")
        
        # 生成新配置
        new_bot_path = os.path.join(new_dir, "MaiBot") if source_bot_type == "MaiBot" else os.path.join(new_dir, "MoFox_bot")
        
        new_config = source_config.copy()
        new_config["serial_number"] = request.new_serial
        new_config["nickname_path"] = request.new_nickname
        new_config["qq_account"] = request.new_qq_account
        new_config["absolute_serial_number"] = config_manager.generate_unique_serial()
        
        if source_bot_type == "MaiBot":
            new_config["mai_path"] = new_bot_path
        else:
            new_config["mofox_path"] = new_bot_path
        
        # 保存新配置
        config_name = f"instance_{request.new_serial}"
        config_manager.add_configuration(config_name, new_config)
        config_manager.save()
        
        return {
            "success": True,
            "message": f"实例克隆成功",
            "new_instance": {
                "serial_number": request.new_serial,
                "nickname": request.new_nickname,
                "path": new_dir
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"克隆实例失败: {str(e)}")


@router.get("/multi-instance/{serial_number}/ports", summary="获取实例端口配置")
async def get_instance_ports(serial_number: str):
    """
    获取实例的端口配置信息
    
    - **serial_number**: 实例序列号
    """
    try:
        config = get_instance_config(serial_number)
        if not config:
            raise HTTPException(status_code=404, detail=f"未找到序列号为 {serial_number} 的实例")
        
        ports = {
            "webui": {
                "default": 8001,
                "builtin": 8001,
                "external": 7999
            },
            "mofox_webui": 12138,
            "mongodb": 27017
        }
        
        return {
            "success": True,
            "serial_number": serial_number,
            "ports": ports,
            "message": "端口配置可能需要根据多开情况进行调整"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取端口配置失败: {str(e)}")


@router.post("/multi-instance/{serial_number}/adjust-ports", summary="调整实例端口")
async def adjust_instance_ports(serial_number: str, port_offset: int = 0):
    """
    根据偏移量调整实例端口配置
    
    - **serial_number**: 实例序列号
    - **port_offset**: 端口偏移量
    """
    try:
        config = get_instance_config(serial_number)
        if not config:
            raise HTTPException(status_code=404, detail=f"未找到序列号为 {serial_number} 的实例")
        
        # 读取并修改配置文件
        bot_type = config.get("bot_type", "MaiBot")
        bot_path = config.get("mai_path") if bot_type == "MaiBot" else config.get("mofox_path")
        
        if not bot_path or not os.path.exists(bot_path):
            raise HTTPException(status_code=400, detail="实例路径不存在")
        
        # 查找配置文件并调整端口
        config_dir = os.path.join(bot_path, "config")
        adjusted_files = []
        
        if os.path.exists(config_dir):
            for file in os.listdir(config_dir):
                if file.endswith((".toml", ".json", ".env")):
                    file_path = os.path.join(config_dir, file)
                    # 这里可以添加端口调整逻辑
                    adjusted_files.append(file)
        
        return {
            "success": True,
            "message": f"端口调整功能开发中",
            "adjusted_files": adjusted_files,
            "port_offset": port_offset
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"调整端口失败: {str(e)}")


@router.get("/multi-instance/compare/{serial1}/{serial2}", summary="对比两个实例")
async def compare_instances(serial1: str, serial2: str):
    """
    对比两个实例的配置差异
    
    - **serial1**: 第一个实例序列号
    - **serial2**: 第二个实例序列号
    """
    try:
        config1 = get_instance_config(serial1)
        config2 = get_instance_config(serial2)
        
        if not config1:
            raise HTTPException(status_code=404, detail=f"未找到序列号为 {serial1} 的实例")
        if not config2:
            raise HTTPException(status_code=404, detail=f"未找到序列号为 {serial2} 的实例")
        
        # 提取可比较的字段
        compare_fields = [
            "bot_type", "version_path", "qq_account",
            "install_options"
        ]
        
        differences = {}
        for field in compare_fields:
            val1 = config1.get(field)
            val2 = config2.get(field)
            if val1 != val2:
                differences[field] = {
                    serial1: val1,
                    serial2: val2
                }
        
        return {
            "success": True,
            "instance1": {
                "serial_number": serial1,
                "nickname": config1.get("nickname_path", "")
            },
            "instance2": {
                "serial_number": serial2,
                "nickname": config2.get("nickname_path", "")
            },
            "differences": differences
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"对比实例失败: {str(e)}")


@router.get("/multi-instance/running", summary="获取运行中的实例")
async def get_running_instances():
    """获取当前正在运行的实例列表"""
    try:
        # 这里的实现需要结合进程管理模块
        # 返回当前有进程在运行的实例
        
        return {
            "success": True,
            "running_instances": [],
            "message": "运行中实例检测功能开发中"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取运行实例失败: {str(e)}")
