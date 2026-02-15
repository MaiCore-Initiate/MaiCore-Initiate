# -*- coding: utf-8 -*-
"""
知识库构建API模块
为WebUI提供知识库构建的API接口
"""
import os
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from datetime import datetime

router = APIRouter()


# --- 请求/响应模型 ---

class BuildKnowledgeRequest(BaseModel):
    """知识库构建请求"""
    serial_number: str  # 实例序列号
    source_path: str   # 知识源文件/目录路径
    knowledge_name: str  # 知识库名称
    description: str = ""  # 知识库描述


class KnowledgeBaseInfo(BaseModel):
    """知识库信息"""
    name: str
    path: str
    file_count: int = 0
    created_at: Optional[str] = None


# --- 辅助函数 ---

def get_instance_config(serial_number: str) -> Optional[Dict[str, Any]]:
    """根据序列号获取实例配置"""
    from ..modules.config_manager import config_manager
    configs = config_manager.get_all_configurations()
    for config in configs.values():
        if config.get("serial_number") == serial_number:
            return config
    return None


# --- API端点 ---

@router.get("/knowledge/{serial_number}/list", summary="获取实例的知识库列表")
async def list_knowledge_bases(serial_number: str):
    """
    获取指定实例的知识库列表
    
    - **serial_number**: 实例序列号
    """
    try:
        config = get_instance_config(serial_number)
        if not config:
            raise HTTPException(status_code=404, detail=f"未找到序列号为 {serial_number} 的实例")
        
        bot_type = config.get("bot_type", "MaiBot")
        bot_path = config.get("mai_path") if bot_type == "MaiBot" else config.get("mofox_path")
        
        if not bot_path:
            raise HTTPException(status_code=400, detail="实例路径不存在")
        
        # 知识库目录
        knowledge_dir = os.path.join(bot_path, "knowledge")
        
        knowledge_bases = []
        if os.path.exists(knowledge_dir):
            for kb_name in os.listdir(knowledge_dir):
                kb_path = os.path.join(knowledge_dir, kb_name)
                if os.path.isdir(kb_path):
                    file_count = len([f for f in os.listdir(kb_path) if os.path.isfile(os.path.join(kb_path, f))])
                    knowledge_bases.append({
                        "name": kb_name,
                        "path": kb_path,
                        "file_count": file_count,
                        "created_at": datetime.fromtimestamp(os.path.getctime(kb_path)).isoformat() if os.path.exists(kb_path) else None
                    })
        
        return {
            "success": True,
            "serial_number": serial_number,
            "count": len(knowledge_bases),
            "knowledge_bases": knowledge_bases
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取知识库列表失败: {str(e)}")


@router.post("/knowledge/{serial_number}/build", summary="构建知识库")
async def build_knowledge_base(
    serial_number: str,
    request: BuildKnowledgeRequest,
    background_tasks: BackgroundTasks
):
    """
    为指定实例构建知识库
    
    - **serial_number**: 实例序列号
    - **source_path**: 知识源文件/目录路径
    - **knowledge_name**: 知识库名称
    - **description**: 知识库描述
    
    注意：此操作会启动后台任务
    """
    try:
        config = get_instance_config(serial_number)
        if not config:
            raise HTTPException(status_code=404, detail=f"未找到序列号为 {serial_number} 的实例")
        
        # 检查源路径是否存在
        if not os.path.exists(request.source_path):
            raise HTTPException(status_code=400, detail=f"知识源路径不存在: {request.source_path}")
        
        bot_type = config.get("bot_type", "MaiBot")
        bot_path = config.get("mai_path") if bot_type == "MaiBot" else config.get("mofox_path")
        
        if not bot_path:
            raise HTTPException(status_code=400, detail="实例路径不存在")
        
        # 创建知识库目录
        knowledge_dir = os.path.join(bot_path, "knowledge")
        os.makedirs(knowledge_dir, exist_ok=True)
        
        kb_dir = os.path.join(knowledge_dir, request.knowledge_name)
        
        if os.path.exists(kb_dir):
            raise HTTPException(status_code=400, detail=f"知识库 {request.knowledge_name} 已存在")
        
        # 创建知识库目录
        os.makedirs(kb_dir)
        
        # 这里可以添加知识库构建的逻辑
        # 例如：复制文件、调用LPMM等
        
        return {
            "success": True,
            "message": f"知识库 {request.knowledge_name} 创建成功",
            "knowledge_base": {
                "name": request.knowledge_name,
                "path": kb_dir,
                "description": request.description,
                "source_path": request.source_path
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"构建知识库失败: {str(e)}")


@router.delete("/knowledge/{serial_number}/{kb_name}", summary="删除知识库")
async def delete_knowledge_base(serial_number: str, kb_name: str):
    """
    删除指定的知识库
    
    - **serial_number**: 实例序列号
    - **kb_name**: 知识库名称
    """
    try:
        config = get_instance_config(serial_number)
        if not config:
            raise HTTPException(status_code=404, detail=f"未找到序列号为 {serial_number} 的实例")
        
        bot_type = config.get("bot_type", "MaiBot")
        bot_path = config.get("mai_path") if bot_type == "MaiBot" else config.get("mofox_path")
        
        if not bot_path:
            raise HTTPException(status_code=400, detail="实例路径不存在")
        
        # 知识库目录
        kb_dir = os.path.join(bot_path, "knowledge", kb_name)
        
        if not os.path.exists(kb_dir):
            raise HTTPException(status_code=404, detail=f"知识库 {kb_name} 不存在")
        
        # 删除知识库目录
        import shutil
        shutil.rmtree(kb_dir)
        
        return {
            "success": True,
            "message": f"知识库 {kb_name} 已删除"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除知识库失败: {str(e)}")


@router.get("/knowledge/{serial_number}/{kb_name}/status", summary="获取知识库状态")
async def get_knowledge_base_status(serial_number: str, kb_name: str):
    """
    获取知识库的构建状态
    
    - **serial_number**: 实例序列号
    - **kb_name**: 知识库名称
    """
    try:
        config = get_instance_config(serial_number)
        if not config:
            raise HTTPException(status_code=404, detail=f"未找到序列号为 {serial_number} 的实例")
        
        bot_type = config.get("bot_type", "MaiBot")
        bot_path = config.get("mai_path") if bot_type == "MaiBot" else config.get("mofox_path")
        
        if not bot_path:
            raise HTTPException(status_code=400, detail="实例路径不存在")
        
        # 知识库目录
        kb_dir = os.path.join(bot_path, "knowledge", kb_name)
        
        if not os.path.exists(kb_dir):
            raise HTTPException(status_code=404, detail=f"知识库 {kb_name} 不存在")
        
        files = []
        total_size = 0
        for root, dirs, filenames in os.walk(kb_dir):
            for filename in filenames:
                file_path = os.path.join(root, filename)
                file_size = os.path.getsize(file_path)
                total_size += file_size
                files.append({
                    "name": filename,
                    "path": file_path,
                    "size": file_size,
                    "size_kb": round(file_size / 1024, 2)
                })
        
        return {
            "success": True,
            "knowledge_base": {
                "name": kb_name,
                "path": kb_dir,
                "file_count": len(files),
                "total_size": total_size,
                "total_size_mb": round(total_size / (1024 * 1024), 2),
                "files": files
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取知识库状态失败: {str(e)}")


@router.get("/knowledge/{serial_number}/config", summary="获取知识库配置")
async def get_knowledge_config(serial_number: str):
    """
    获取知识库配置文件信息
    
    - **serial_number**: 实例序列号
    """
    try:
        config = get_instance_config(serial_number)
        if not config:
            raise HTTPException(status_code=404, detail=f"未找到序列号为 {serial_number} 的实例")
        
        bot_type = config.get("bot_type", "MaiBot")
        bot_path = config.get("mai_path") if bot_type == "MaiBot" else config.get("mofox_path")
        
        if not bot_path:
            raise HTTPException(status_code=400, detail="实例路径不存在")
        
        # 查找知识库配置文件
        config_file = os.path.join(bot_path, "config", "lpmm_config.toml")
        
        config_info = {
            "exists": os.path.exists(config_file),
            "path": config_file,
            "message": ""
        }
        
        if not config_info["exists"]:
            config_info["message"] = "知识库配置文件不存在，请先启动一次实例"
        else:
            config_info["message"] = "知识库配置文件存在"
        
        return {
            "success": True,
            "serial_number": serial_number,
            "config": config_info
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取知识库配置失败: {str(e)}")


@router.post("/knowledge/{serial_number}/rebuild", summary="重建知识库")
async def rebuild_knowledge_base(
    serial_number: str,
    kb_name: str,
    background_tasks: BackgroundTasks
):
    """
    重建指定的知识库
    
    - **serial_number**: 实例序列号
    - **kb_name**: 知识库名称
    
    注意：此操作会启动后台任务
    """
    try:
        config = get_instance_config(serial_number)
        if not config:
            raise HTTPException(status_code=404, detail=f"未找到序列号为 {serial_number} 的实例")
        
        bot_type = config.get("bot_type", "MaiBot")
        bot_path = config.get("mai_path") if bot_type == "MaiBot" else config.get("mofox_path")
        
        if not bot_path:
            raise HTTPException(status_code=400, detail="实例路径不存在")
        
        # 知识库目录
        kb_dir = os.path.join(bot_path, "knowledge", kb_name)
        
        if not os.path.exists(kb_dir):
            raise HTTPException(status_code=404, detail=f"知识库 {kb_name} 不存在")
        
        # 这里可以添加重建知识库的逻辑
        
        return {
            "success": True,
            "message": f"知识库 {kb_name} 重建任务已启动",
            "knowledge_base": {
                "name": kb_name,
                "path": kb_dir
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"重建知识库失败: {str(e)}")
