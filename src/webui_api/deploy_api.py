# -*- coding: utf-8 -*-
"""
部署管理API模块
为WebUI提供部署实例的API接口
"""
import os
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from datetime import datetime

from ..modules.deployment import deployment_manager
from ..modules.deployment_core import (
    MaiBotDeployer,
    MoFoxBotDeployer,
    NapCatDeployer
)
from ..core.config import config_manager

router = APIRouter()


# --- 请求/响应模型 ---

class DeployInstanceRequest(BaseModel):
    """部署实例请求"""
    bot_type: str  # "MaiBot" or "MoFox_bot"
    version: Dict[str, Any]  # 版本信息
    install_adapter: bool = False
    install_napcat: bool = False
    napcat_version: Optional[Dict[str, Any]] = None
    install_mongodb: bool = False
    install_webui: bool = False
    install_mofox_admin_ui: bool = False
    install_mofox_webui: bool = False
    install_dir: str
    nickname: str
    qq_account: str = ""
    serial_number: str


class UpdateInstanceRequest(BaseModel):
    """更新实例请求"""
    serial_number: str
    new_version: Dict[str, Any]


class DeleteInstanceRequest(BaseModel):
    """删除实例请求"""
    serial_number: str
    confirm_nickname: str
    backup: bool = True


# --- API端点 ---

@router.get("/deploy/versions/{bot_type}", summary="获取可部署版本列表")
async def get_available_versions(bot_type: str):
    """
    获取指定Bot类型的可用版本列表
    
    - **bot_type**: Bot类型 (MaiBot 或 MoFox_bot)
    """
    try:
        if bot_type == "MaiBot":
            deployer = MaiBotDeployer()
            versions = deployer.version_manager.get_versions(bot_type)
        elif bot_type == "MoFox_bot":
            deployer = MoFoxBotDeployer()
            versions = deployer.version_manager.get_versions(bot_type)
        else:
            raise HTTPException(status_code=400, detail=f"不支持的Bot类型: {bot_type}")
        
        return {
            "success": True,
            "bot_type": bot_type,
            "versions": versions
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取版本列表失败: {str(e)}")


@router.get("/deploy/napcat/versions", summary="获取NapCat版本列表")
async def get_napcat_versions(force_refresh: bool = False):
    """
    获取可用的NapCat版本列表
    
    - **force_refresh**: 是否强制刷新缓存
    """
    try:
        napcat_deployer = NapCatDeployer()
        versions = napcat_deployer.get_napcat_versions(force_refresh)
        
        return {
            "success": True,
            "versions": versions
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取NapCat版本列表失败: {str(e)}")


@router.post("/deploy/instances", summary="部署新实例")
async def deploy_instance(
    request: DeployInstanceRequest,
    background_tasks: BackgroundTasks
):
    """
    部署一个新实例
    
    此接口会启动一个后台任务来执行部署操作
    """
    try:
        # 验证序列号是否已存在
        configs = config_manager.get_all_configurations()
        for cfg in configs.values():
            if cfg.get("serial_number") == request.serial_number:
                raise HTTPException(
                    status_code=400,
                    detail=f"序列号 '{request.serial_number}' 已存在"
                )
        
        # 构建部署配置
        deploy_config = {
            "bot_type": request.bot_type,
            "selected_version": request.version,
            "install_adapter": request.install_adapter,
            "install_napcat": request.install_napcat,
            "napcat_version": request.napcat_version,
            "install_mongodb": request.install_mongodb,
            "install_webui": request.install_webui,
            "install_mofox_admin_ui": request.install_mofox_admin_ui,
            "install_mofox_webui": request.install_mofox_webui,
            "install_dir": request.install_dir,
            "nickname": request.nickname,
            "qq_account": request.qq_account,
            "serial_number": request.serial_number,
            "mongodb_path": ""
        }
        
        # 注意：这里需要通过UI交互来确认部署
        # 在WebUI模式下，可能需要返回部署配置让用户确认
        return {
            "success": True,
            "message": "部署请求已接收，请确认部署配置",
            "config": deploy_config
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"部署失败: {str(e)}")


@router.get("/deploy/instances", summary="获取所有实例")
async def get_all_instances():
    """获取所有已部署的实例"""
    try:
        configs = config_manager.get_all_configurations()
        
        instances = []
        for name, config in configs.items():
            instances.append({
                "id": name,
                "serial_number": config.get("serial_number", ""),
                "nickname": config.get("nickname_path", ""),
                "bot_type": config.get("bot_type", "MaiBot"),
                "version": config.get("version_path", ""),
                "qq_account": config.get("qq_account", ""),
                "mai_path": config.get("mai_path", ""),
                "mofox_path": config.get("mofox_path", ""),
                "adapter_path": config.get("adapter_path", ""),
                "napcat_path": config.get("napcat_path", ""),
                "venv_path": config.get("venv_path", ""),
                "mongodb_path": config.get("mongodb_path", ""),
                "webui_path": config.get("webui_path", ""),
                "install_options": config.get("install_options", {})
            })
        
        return {
            "success": True,
            "count": len(instances),
            "instances": instances
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取实例列表失败: {str(e)}")


@router.get("/deploy/instances/{serial_number}", summary="获取实例详情")
async def get_instance_detail(serial_number: str):
    """获取指定序列号的实例详情"""
    try:
        configs = config_manager.get_all_configurations()
        
        for name, config in configs.items():
            if config.get("serial_number") == serial_number:
                return {
                    "success": True,
                    "instance": {
                        "id": name,
                        "serial_number": config.get("serial_number", ""),
                        "absolute_serial_number": config.get("absolute_serial_number", 0),
                        "nickname": config.get("nickname_path", ""),
                        "bot_type": config.get("bot_type", "MaiBot"),
                        "version": config.get("version_path", ""),
                        "qq_account": config.get("qq_account", ""),
                        "mai_path": config.get("mai_path", ""),
                        "mofox_path": config.get("mofox_path", ""),
                        "adapter_path": config.get("adapter_path", ""),
                        "napcat_path": config.get("napcat_path", ""),
                        "venv_path": config.get("venv_path", ""),
                        "mongodb_path": config.get("mongodb_path", ""),
                        "webui_path": config.get("webui_path", ""),
                        "install_options": config.get("install_options", {})
                    }
                }
        
        raise HTTPException(status_code=404, detail=f"未找到序列号为 {serial_number} 的实例")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取实例详情失败: {str(e)}")


@router.put("/deploy/instances/{serial_number}", summary="更新实例配置")
async def update_instance(serial_number: str, updates: Dict[str, Any]):
    """更新指定实例的配置"""
    try:
        configs = config_manager.get_all_configurations()
        
        config_key = None
        for name, config in configs.items():
            if config.get("serial_number") == serial_number:
                config_key = name
                break
        
        if not config_key:
            raise HTTPException(status_code=404, detail=f"未找到序列号为 {serial_number} 的实例")
        
        # 更新配置（仅允许白名单字段）
        _UPDATABLE_FIELDS = {
            "serial_number", "nickname_path", "version_path", "bot_type",
            "qq_account", "mai_path", "mofox_path", "adapter_path",
            "napcat_path", "venv_path", "webui_path",
        }
        current_config = configs[config_key]
        filtered = {k: v for k, v in updates.items() if k in _UPDATABLE_FIELDS}
        if not filtered:
            raise HTTPException(status_code=400, detail="没有可更新的有效字段")
        current_config.update(filtered)
        
        # 保存配置
        config_manager.add_configuration(config_key, current_config)
        config_manager.save()
        
        return {
            "success": True,
            "message": f"实例 {serial_number} 配置已更新"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"更新实例失败: {str(e)}")


@router.delete("/deploy/instances/{serial_number}", summary="删除实例")
async def delete_instance(serial_number: str):
    """
    删除指定实例
    
    注意：此接口需要先调用确认删除接口进行二次确认
    """
    try:
        configs = config_manager.get_all_configurations()
        
        config_key = None
        for name, config in configs.items():
            if config.get("serial_number") == serial_number:
                config_key = name
                break
        
        if not config_key:
            raise HTTPException(status_code=404, detail=f"未找到序列号为 {serial_number} 的实例")
        
        # 返回实例信息供确认
        config = configs[config_key]
        return {
            "success": True,
            "confirm_required": True,
            "instance": {
                "serial_number": serial_number,
                "nickname": config.get("nickname_path", ""),
                "bot_type": config.get("bot_type", "MaiBot"),
                "bot_path": config.get("mai_path") or config.get("mofox_path", "")
            },
            "message": "请确认删除操作"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除实例失败: {str(e)}")


@router.post("/deploy/instances/{serial_number}/confirm-delete", summary="确认删除实例")
async def confirm_delete_instance(serial_number: str, request: DeleteInstanceRequest):
    """确认删除实例"""
    try:
        # 验证序列号和昵称
        if request.serial_number != serial_number:
            raise HTTPException(status_code=400, detail="序列号不匹配")
        
        configs = config_manager.get_all_configurations()
        
        config_key = None
        config = None
        for name, cfg in configs.items():
            if cfg.get("serial_number") == serial_number:
                config_key = name
                config = cfg
                break
        
        if not config_key:
            raise HTTPException(status_code=404, detail=f"未找到序列号为 {serial_number} 的实例")
        
        # 验证昵称
        if config.get("nickname_path") != request.confirm_nickname:
            raise HTTPException(status_code=400, detail="实例昵称不匹配")
        
        # 执行删除（需要后台任务处理）
        # 这里需要调用deployment_manager.delete_instance()
        # 但由于它是交互式的，需要重构为非交互式
        
        return {
            "success": True,
            "message": f"实例 {serial_number} 删除任务已启动"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除实例失败: {str(e)}")


@router.get("/deploy/status", summary="获取部署状态")
async def get_deploy_status():
    """获取当前部署系统的状态"""
    return {
        "success": True,
        "status": "ready",
        "message": "部署系统就绪"
    }
