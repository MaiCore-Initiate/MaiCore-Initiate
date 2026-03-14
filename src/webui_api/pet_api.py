"""
桌宠AI相关API路由
提供日程、待办、聊天等功能的RESTful接口
"""
import structlog
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional
from datetime import datetime

from src.core.p_config import p_config_manager
from src.core.llm_client import LLMClient
from src.core.pet_database import PetDatabase
from src.services.pet_chat_service import PetChatService
from src.services.schedule_service import ScheduleService
from src.services.todo_service import TodoService

logger = structlog.get_logger(__name__)
router = APIRouter()

# 全局实例（延迟初始化）
_llm_client: Optional[LLMClient] = None
_llm_config_snapshot: Optional[Dict[str, Any]] = None
_pet_db: Optional[PetDatabase] = None
_chat_service: Optional[PetChatService] = None
_schedule_service: Optional[ScheduleService] = None
_todo_service: Optional[TodoService] = None


def _get_services():
    """获取服务实例（单例模式）"""
    global _llm_client, _llm_config_snapshot, _pet_db, _chat_service, _schedule_service, _todo_service

    if _pet_db is None:
        _pet_db = PetDatabase()

    llm_config = p_config_manager.get_llm_config()
    if _llm_client is None or _llm_config_snapshot != llm_config:
        _llm_client = LLMClient(llm_config)
        _llm_config_snapshot = dict(llm_config)
        _chat_service = None

    if _chat_service is None:
        _chat_service = PetChatService(_llm_client, _pet_db)

    if _schedule_service is None:
        _schedule_service = ScheduleService(_pet_db)

    if _todo_service is None:
        _todo_service = TodoService(_pet_db)

    return _chat_service, _schedule_service, _todo_service


# ==================== 请求/响应模型 ====================

class PetChatRequest(BaseModel):
    message: str = Field(..., description="用户消息")
    settings: Dict[str, Any] = Field(default_factory=dict, description="桌宠设置")


class CreateScheduleRequest(BaseModel):
    title: str = Field(..., description="日程标题")
    start_time: str = Field(..., description="开始时间（ISO 8601格式）")
    end_time: Optional[str] = Field(None, description="结束时间")
    description: Optional[str] = Field(None, description="描述")
    location: Optional[str] = Field(None, description="地点")
    priority: str = Field("normal", description="优先级")
    all_day: bool = Field(False, description="是否全天")
    remind_before_minutes: int = Field(15, description="提前提醒分钟数")
    tags: Optional[List[str]] = Field(None, description="标签")


class CreateTodoRequest(BaseModel):
    title: str = Field(..., description="待办标题")
    description: Optional[str] = Field(None, description="描述")
    priority: str = Field("normal", description="优先级")
    due_date: Optional[str] = Field(None, description="截止日期")
    tags: Optional[List[str]] = Field(None, description="标签")


# ==================== 聊天接口 ====================

@router.post("/chat")
async def pet_chat(body: PetChatRequest) -> Dict[str, Any]:
    """
    桌宠聊天接口

    支持AI对话和Function Calling
    """
    try:
        chat_service, _, _ = _get_services()
        result = await chat_service.chat(body.message, body.settings)
        return {
            "success": True,
            "reply": result["reply"],
            "actions": result.get("actions", [])
        }
    except Exception as e:
        logger.error("聊天接口错误", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


# ==================== 日程管理接口 ====================

@router.get("/schedules")
async def get_schedules(
    date: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
) -> Dict[str, Any]:
    """
    获取日程列表

    参数:
    - date: 指定日期（YYYY-MM-DD）
    - start_date: 开始日期
    - end_date: 结束日期
    """
    try:
        _, schedule_service, _ = _get_services()
        schedules = await schedule_service.db.get_schedules(
            date=date,
            start_date=start_date,
            end_date=end_date
        )
        return {
            "success": True,
            "data": schedules
        }
    except Exception as e:
        logger.error("获取日程失败", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/schedules")
async def create_schedule(body: CreateScheduleRequest) -> Dict[str, Any]:
    """创建日程"""
    try:
        _, schedule_service, _ = _get_services()
        result = await schedule_service.create_schedule(body.dict())
        return result
    except Exception as e:
        logger.error("创建日程失败", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/schedules/{schedule_id}")
async def delete_schedule(schedule_id: int) -> Dict[str, Any]:
    """删除日程"""
    try:
        _, schedule_service, _ = _get_services()
        result = await schedule_service.delete_schedule(schedule_id)
        return result
    except Exception as e:
        logger.error("删除日程失败", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/schedules/today")
async def get_today_schedules() -> Dict[str, Any]:
    """获取今日日程"""
    try:
        _, schedule_service, _ = _get_services()
        schedules = await schedule_service.get_today_schedules()
        return {
            "success": True,
            "data": schedules
        }
    except Exception as e:
        logger.error("获取今日日程失败", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


# ==================== 待办管理接口 ====================

@router.get("/todos")
async def get_todos(status: Optional[str] = None) -> Dict[str, Any]:
    """
    获取待办列表

    参数:
    - status: 状态筛选（pending/in_progress/done/cancelled）
    """
    try:
        _, _, todo_service = _get_services()
        todos = await todo_service.get_todos(status=status)
        return {
            "success": True,
            "data": todos
        }
    except Exception as e:
        logger.error("获取待办失败", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/todos")
async def create_todo(body: CreateTodoRequest) -> Dict[str, Any]:
    """创建待办"""
    try:
        _, _, todo_service = _get_services()
        result = await todo_service.create_todo(body.dict())
        return result
    except Exception as e:
        logger.error("创建待办失败", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/todos/{todo_id}/toggle")
async def toggle_todo(todo_id: int) -> Dict[str, Any]:
    """切换待办完成状态"""
    try:
        _, _, todo_service = _get_services()
        result = await todo_service.toggle_todo(todo_id)
        return result
    except Exception as e:
        logger.error("切换待办状态失败", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/todos/{todo_id}")
async def delete_todo(todo_id: int) -> Dict[str, Any]:
    """删除待办"""
    try:
        _, _, todo_service = _get_services()
        result = await todo_service.delete_todo(todo_id)
        return result
    except Exception as e:
        logger.error("删除待办失败", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


# ==================== 上下文摘要接口 ====================

@router.get("/context")
async def get_context_summary() -> Dict[str, Any]:
    """
    获取上下文摘要

    返回当前的日程和待办摘要，供前端显示
    """
    try:
        _, schedule_service, todo_service = _get_services()
        schedule_summary = await schedule_service.get_schedule_summary()
        todo_summary = await todo_service.get_todo_summary()

        return {
            "success": True,
            "data": {
                "schedule_summary": schedule_summary,
                "todo_summary": todo_summary,
                "timestamp": datetime.now().isoformat()
            }
        }
    except Exception as e:
        logger.error("获取上下文摘要失败", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))
