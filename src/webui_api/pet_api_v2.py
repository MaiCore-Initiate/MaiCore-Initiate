"""
桌宠 API v2
提供日程、待办、会话聊天、长期记忆驱动的桌宠交互接口
"""
import threading
from typing import Any, Dict, List, Optional

import structlog
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.core.pet_database import PetDatabase
from src.services.schedule_service_v2 import ScheduleService
from src.services.todo_service_v2 import TodoService
from src.webui_api.settings_api import _read_desktop_pet_settings

logger = structlog.get_logger(__name__)

router = APIRouter()

pet_db = PetDatabase()
schedule_service = ScheduleService(pet_db)
todo_service = TodoService(pet_db)
_runtime_lock = threading.Lock()
_llm_config_snapshot: Optional[Dict[str, Any]] = None
_llm_runtime_cache: Optional[Dict[str, Any]] = None


class CreateEventRequest(BaseModel):
    title: str
    start_time: str
    end_time: Optional[str] = ""
    description: Optional[str] = ""
    all_day: bool = False
    repeat_type: str = "none"
    priority: str = "normal"
    tags: Optional[List[str]] = None
    remind_before_minutes: int = 15
    location: Optional[str] = ""


class UpdateEventRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    priority: Optional[str] = None
    location: Optional[str] = None


class CreateTodoRequest(BaseModel):
    title: str
    description: Optional[str] = ""
    priority: str = "normal"
    due_date: Optional[str] = ""
    tags: Optional[List[str]] = None


class UpdateTodoRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[str] = None
    status: Optional[str] = None


class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None


class CreateChatSessionRequest(BaseModel):
    title: str = ""


def _tags_to_str(tags: Optional[List[str]]) -> str:
    if not tags:
        return ""
    return ",".join(item.strip() for item in tags if item.strip())


def _ok(data: Any = None, **extra: Any) -> Dict[str, Any]:
    response = {"success": True}
    if data is not None:
        response["data"] = data
    response.update(extra)
    return response


def _get_llm_runtime() -> Dict[str, Any]:
    from src.core.llm_client import LLMClient
    from src.core.p_config import p_config_manager
    from src.services.pet_chat_service import PetChatService

    global _llm_config_snapshot, _llm_runtime_cache

    llm_config = p_config_manager.get_llm_config()
    with _runtime_lock:
        if _llm_runtime_cache is None or _llm_config_snapshot != llm_config:
            llm_client = LLMClient(llm_config)
            _llm_runtime_cache = {
                "llm_client": llm_client,
                "chat_service": PetChatService(llm_client, pet_db),
            }
            _llm_config_snapshot = dict(llm_config)

        return {
            "llm_config": dict(llm_config),
            **_llm_runtime_cache,
        }


def _build_model_key(llm_config: Dict[str, Any]) -> str:
    provider = str(llm_config.get("provider", "openai") or "openai").strip().lower()
    model = str(llm_config.get("model", "unknown-model") or "unknown-model").strip()
    base_url = str(llm_config.get("base_url", "") or "").strip().rstrip("/")
    return f"{provider}::{model}::{base_url or 'default-endpoint'}"


def _read_memory_settings(settings: Dict[str, Any]) -> Dict[str, Any]:
    memory = settings.get("memory", {}) if isinstance(settings.get("memory"), dict) else {}
    return memory


async def _get_chat_runtime() -> Dict[str, Any]:
    settings = _read_desktop_pet_settings()
    runtime = _get_llm_runtime()
    llm_config = runtime["llm_config"]
    model_key = _build_model_key(llm_config)
    memory_settings = _read_memory_settings(settings)
    share_memory = bool(memory_settings.get("share_between_sessions_same_model", True))
    return {
        **runtime,
        "settings": settings,
        "model_key": model_key,
        "share_memory": share_memory,
        "memory_settings": memory_settings,
    }


async def _ensure_session_belongs_to_model(session_id: str, model_key: str) -> Dict[str, Any]:
    session = await pet_db.get_chat_session(session_id)
    if not session:
        raise HTTPException(404, "会话不存在")
    if session["model_key"] != model_key:
        raise HTTPException(400, "当前模型与该会话不匹配，请切换回原模型后再打开")
    return session


@router.get("/health")
async def health_check():
    return {"status": "ok"}


@router.get("/schedules")
async def list_schedules(date: str = "", keyword: str = "", priority: str = ""):
    try:
        if keyword:
            events = await schedule_service.search_events(keyword)
        elif date:
            events = await schedule_service.list_events(date=date, priority=priority)
        else:
            events = await schedule_service.get_today_events()
        return _ok([item.to_dict() for item in events])
    except Exception as exc:
        logger.error("获取日程列表失败", error=str(exc))
        raise HTTPException(500, f"获取日程列表失败: {exc}") from exc


@router.post("/schedules")
async def create_schedule(req: CreateEventRequest):
    try:
        event = await schedule_service.create_event(
            title=req.title,
            start_time=req.start_time,
            end_time=req.end_time or "",
            description=req.description or "",
            all_day=req.all_day,
            repeat_type=req.repeat_type,
            priority=req.priority,
            tags=_tags_to_str(req.tags),
            reminder_minutes=req.remind_before_minutes,
            location=req.location or "",
        )
        return _ok(event.to_dict())
    except Exception as exc:
        logger.error("创建日程失败", error=str(exc))
        raise HTTPException(500, f"创建日程失败: {exc}") from exc


@router.get("/schedules/{event_id}")
async def get_schedule(event_id: int):
    event = await schedule_service.get_event(event_id)
    if not event:
        raise HTTPException(404, "日程不存在")
    return _ok(event.to_dict())


@router.put("/schedules/{event_id}")
async def update_schedule(event_id: int, req: UpdateEventRequest):
    try:
        event = await schedule_service.update_event(event_id, **req.dict(exclude_unset=True))
        if not event:
            raise HTTPException(404, "日程不存在")
        return _ok(event.to_dict())
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("更新日程失败", error=str(exc))
        raise HTTPException(500, f"更新日程失败: {exc}") from exc


@router.delete("/schedules/{event_id}")
async def delete_schedule(event_id: int):
    ok = await schedule_service.delete_event(event_id)
    if not ok:
        raise HTTPException(404, "日程不存在或已删除")
    return _ok(message="日程已删除")


@router.get("/schedules/upcoming")
async def get_upcoming_schedules(minutes: int = 30):
    events = await schedule_service.get_upcoming_events(minutes=minutes)
    return _ok([item.to_dict() for item in events])


@router.get("/todos")
async def list_todos(status: str = "", priority: str = "", keyword: str = ""):
    try:
        if keyword:
            todos = await todo_service.search_todos(keyword)
        else:
            todos = await todo_service.list_todos(status=status, priority=priority)
        return _ok([item.to_dict() for item in todos])
    except Exception as exc:
        logger.error("获取待办列表失败", error=str(exc))
        raise HTTPException(500, f"获取待办列表失败: {exc}") from exc


@router.post("/todos")
async def create_todo(req: CreateTodoRequest):
    try:
        todo = await todo_service.create_todo(
            title=req.title,
            description=req.description or "",
            priority=req.priority,
            due_date=req.due_date or "",
            tags=_tags_to_str(req.tags),
        )
        return _ok(todo.to_dict())
    except Exception as exc:
        logger.error("创建待办失败", error=str(exc))
        raise HTTPException(500, f"创建待办失败: {exc}") from exc


@router.get("/todos/{todo_id}")
async def get_todo(todo_id: int):
    todo = await todo_service.get_todo(todo_id)
    if not todo:
        raise HTTPException(404, "待办不存在")
    return _ok(todo.to_dict())


@router.put("/todos/{todo_id}")
async def update_todo(todo_id: int, req: UpdateTodoRequest):
    try:
        todo = await todo_service.update_todo(todo_id, **req.dict(exclude_unset=True))
        if not todo:
            raise HTTPException(404, "待办不存在")
        return _ok(todo.to_dict())
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("更新待办失败", error=str(exc))
        raise HTTPException(500, f"更新待办失败: {exc}") from exc


@router.patch("/todos/{todo_id}/toggle")
async def toggle_todo(todo_id: int):
    todo = await todo_service.toggle_status(todo_id)
    if not todo:
        raise HTTPException(404, "待办不存在")
    return _ok(todo.to_dict())


@router.delete("/todos/{todo_id}")
async def delete_todo(todo_id: int):
    ok = await todo_service.delete_todo(todo_id)
    if not ok:
        raise HTTPException(404, "待办不存在或已删除")
    return _ok(message="待办已删除")


@router.get("/todos/stats")
async def get_todo_stats():
    return _ok(await todo_service.get_stats())


@router.get("/todos/overdue")
async def get_overdue_todos():
    todos = await todo_service.list_overdue()
    return _ok([item.to_dict() for item in todos])


@router.get("/chat/sessions")
async def list_chat_sessions():
    try:
        runtime = await _get_chat_runtime()
        active = await pet_db.get_active_session(model_key=runtime["model_key"], auto_create=True)
        sessions = await pet_db.list_chat_sessions(model_key=runtime["model_key"], limit=60)
        return _ok(
            sessions,
            active_session_id=active["id"] if active else None,
            model_key=runtime["model_key"],
            share_memory_between_sessions_same_model=runtime["share_memory"],
        )
    except Exception as exc:
        logger.error("获取聊天会话列表失败", error=str(exc))
        raise HTTPException(500, f"获取聊天会话列表失败: {exc}") from exc


@router.get("/chat/sessions/active")
async def get_active_chat_session():
    try:
        runtime = await _get_chat_runtime()
        active = await pet_db.get_active_session(model_key=runtime["model_key"], auto_create=True)
        return _ok(active, model_key=runtime["model_key"])
    except Exception as exc:
        logger.error("获取当前聊天会话失败", error=str(exc))
        raise HTTPException(500, f"获取当前聊天会话失败: {exc}") from exc


@router.post("/chat/sessions")
async def create_chat_session(req: CreateChatSessionRequest):
    try:
        runtime = await _get_chat_runtime()
        persona = runtime["settings"].get("persona", {}) if isinstance(runtime["settings"].get("persona"), dict) else {}
        session = await pet_db.create_chat_session(
            model_key=runtime["model_key"],
            title=req.title,
            persona_name=str(persona.get("name", "")).strip(),
            make_active=True,
        )
        return _ok(session, model_key=runtime["model_key"])
    except Exception as exc:
        logger.error("创建聊天会话失败", error=str(exc))
        raise HTTPException(500, f"创建聊天会话失败: {exc}") from exc


@router.post("/chat/sessions/{session_id}/activate")
async def activate_chat_session(session_id: str):
    try:
        runtime = await _get_chat_runtime()
        session = await _ensure_session_belongs_to_model(session_id, runtime["model_key"])
        await pet_db.set_active_session(runtime["model_key"], session["id"])
        return _ok(session, model_key=runtime["model_key"])
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("激活聊天会话失败", error=str(exc), session_id=session_id)
        raise HTTPException(500, f"激活聊天会话失败: {exc}") from exc


@router.get("/chat/sessions/{session_id}/messages")
async def get_chat_messages(session_id: str):
    try:
        runtime = await _get_chat_runtime()
        await _ensure_session_belongs_to_model(session_id, runtime["model_key"])
        messages = await pet_db.get_session_messages(session_id)
        return _ok(messages, session_id=session_id, model_key=runtime["model_key"])
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("获取聊天记录失败", error=str(exc), session_id=session_id)
        raise HTTPException(500, f"获取聊天记录失败: {exc}") from exc


@router.post("/chat")
async def pet_chat(req: ChatRequest):
    try:
        runtime = await _get_chat_runtime()
        settings = runtime["settings"]
        if not settings.get("ai_enabled", True):
            raise HTTPException(400, "AI 交互当前已关闭")

        session_id = req.session_id
        if session_id:
            session = await _ensure_session_belongs_to_model(session_id, runtime["model_key"])
            await pet_db.set_active_session(runtime["model_key"], session["id"])
        else:
            session = await pet_db.get_active_session(model_key=runtime["model_key"], auto_create=True)
            session_id = session["id"] if session else None

        result = await runtime["chat_service"].chat(
            user_message=req.message,
            settings=settings,
            session_id=session_id,
            model_key=runtime["model_key"],
            share_memory_across_sessions=runtime["share_memory"],
        )
        return _ok(result, model_key=runtime["model_key"])
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("AI聊天失败", error=str(exc))
        raise HTTPException(500, f"AI聊天失败: {exc}") from exc


@router.get("/context/summary")
async def get_context_summary():
    try:
        schedule_summary = await schedule_service.get_schedule_summary()
        todo_summary = await todo_service.get_todo_summary()
        return _ok(
            {
                "schedule_summary": schedule_summary,
                "todo_summary": todo_summary,
            }
        )
    except Exception as exc:
        logger.error("获取上下文摘要失败", error=str(exc))
        raise HTTPException(500, f"获取上下文摘要失败: {exc}") from exc
