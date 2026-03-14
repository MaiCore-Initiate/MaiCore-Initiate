"""
桌宠聊天服务
处理会话、多轮工具调用、长期记忆检索与用户映像拼接
"""
import asyncio
import json
from datetime import datetime
from typing import Any, Dict, List, Optional

import structlog

from src.core.llm_client import LLMClient
from src.core.pet_database import PetDatabase
from src.services.pet_memory_service import PetMemoryService
from src.services.schedule_service_v2 import ScheduleService
from src.services.todo_service_v2 import TodoService

logger = structlog.get_logger(__name__)


class PetChatService:
    """桌宠聊天服务类"""

    def __init__(self, llm_client: LLMClient, db: PetDatabase):
        self.llm_client = llm_client
        self.db = db
        self.schedule_service = ScheduleService(db)
        self.todo_service = TodoService(db)
        self.memory_service = PetMemoryService(db)
        logger.info("桌宠聊天服务初始化完成")

    async def chat(
        self,
        user_message: str,
        settings: Dict[str, Any],
        session_id: Optional[str] = None,
        model_key: str = "default-model",
        share_memory_across_sessions: bool = True,
    ) -> Dict[str, Any]:
        try:
            if not self.llm_client.is_configured():
                return {
                    "reply": "主人，我还没有配置好AI能力呢~请先在设置页面配置LLM API Key哦~",
                    "actions": [],
                    "session_id": session_id,
                }

            persona = settings.get("persona", {}) if isinstance(settings.get("persona"), dict) else {}
            memory_settings = settings.get("memory", {}) if isinstance(settings.get("memory"), dict) else {}
            logger.info(
                "开始构建桌宠聊天提示词",
                model_key=model_key,
                requested_session_id=session_id,
                share_memory_across_sessions=share_memory_across_sessions,
                user_message_preview=self._preview_text(user_message, 160),
            )
            logger.info(
                "已解析人格设定",
                model_key=model_key,
                persona_name=str(persona.get("name", "")).strip() or "桌宠",
                persona_tone=self._preview_text(str(persona.get("tone", "")).strip(), 120),
                has_system_prompt=bool(str(persona.get("system_prompt", "")).strip()),
            )
            resolved_session = session_id or (await self.db.get_active_session(model_key=model_key))["id"]
            logger.info("已解析当前会话", model_key=model_key, session_id=resolved_session)
            context_summary, recent_messages, impression_text = await asyncio.gather(
                self._build_context_summary(),
                self.db.get_recent_chat_history(limit=8, session_id=resolved_session),
                self.memory_service.get_impression_text(
                    model_key=model_key,
                    session_id=resolved_session,
                    share_across_sessions=share_memory_across_sessions,
                ),
            )
            logger.info(
                "已构建短期上下文",
                session_id=resolved_session,
                context_preview=self._preview_text(context_summary, 220),
                recent_message_count=len(recent_messages),
                recent_messages_preview=[self._preview_text(str(item.get("content", "")), 80) for item in recent_messages[-4:]],
            )
            logger.info(
                "已加载长期印象",
                session_id=resolved_session,
                impression_length=len(impression_text),
                impression_preview=self._preview_text(impression_text, 220),
            )
            memory_query = self._build_memory_query(user_message, recent_messages)
            logger.info(
                "已构建长期记忆查询文本",
                session_id=resolved_session,
                memory_query_preview=self._preview_text(memory_query, 220),
            )
            relevant_memories = await self.memory_service.retrieve_relevant_memories(
                model_key=model_key,
                session_id=resolved_session,
                share_across_sessions=share_memory_across_sessions,
                query_text=memory_query,
                memory_settings=memory_settings,
                limit=6,
            )
            logger.info(
                "已完成长期记忆检索",
                session_id=resolved_session,
                memory_hit_count=len(relevant_memories),
                memory_hit_summaries=[self._preview_text(str(item.get("summary", "")), 120) for item in relevant_memories],
            )

            system_prompt = self._build_system_prompt(
                persona=persona,
                model_key=model_key,
                context=context_summary,
                long_term_memories=relevant_memories,
                impression_text=impression_text,
                share_memory_across_sessions=share_memory_across_sessions,
            )
            logger.info(
                "已完成系统提示词构建",
                session_id=resolved_session,
                system_prompt_length=len(system_prompt),
                system_prompt_preview=self._preview_text(system_prompt, 320),
            )
            messages = self._prepare_messages(system_prompt, recent_messages, user_message)
            logger.info(
                "已完成消息列表拼装",
                session_id=resolved_session,
                message_count=len(messages),
                message_roles=[str(item.get("role", "")) for item in messages],
            )
            tools = self._define_tools()
            logger.info(
                "已定义可用工具",
                session_id=resolved_session,
                tool_names=[tool.get("function", {}).get("name") for tool in tools],
            )
            response = await self._call_llm_with_tools(messages, tools)
            logger.info(
                "LLM 主回复已返回",
                session_id=resolved_session,
                reply_preview=self._preview_text(str(response.get("reply", "")), 180),
                action_count=len(response.get("actions", []) or []),
            )

            await self.db.save_chat_message("user", user_message, session_id=resolved_session)
            await self.db.maybe_autoname_session(resolved_session, user_message)
            await self.db.save_chat_message(
                "assistant",
                response["reply"],
                session_id=resolved_session,
                metadata={"actions": response.get("actions", [])},
            )
            logger.info("聊天消息已写入数据库", session_id=resolved_session)

            turn_count = await self.db.count_session_messages(resolved_session, role="user")
            memory_due = self.memory_service.should_digest_memory(turn_count, memory_settings)
            impression_due = self.memory_service.should_build_impression(turn_count, memory_settings)
            logger.info(
                "已计算阶段记忆触发条件",
                session_id=resolved_session,
                turn_count=turn_count,
                memory_due=memory_due,
                impression_due=impression_due,
            )
            if memory_due or impression_due:
                asyncio.create_task(
                    self._ingest_memory_async(
                        model_key=model_key,
                        session_id=resolved_session,
                        persona=persona,
                        user_message=user_message,
                        assistant_reply=response["reply"],
                        actions=response.get("actions", []),
                        memory_settings=memory_settings,
                        turn_count=turn_count,
                    )
                )
                logger.info(
                    "阶段性记忆任务已调度",
                    session_id=resolved_session,
                    turn_count=turn_count,
                    memory_due=memory_due,
                    impression_due=impression_due,
                )
            else:
                logger.info(
                    "本轮未达到阶段整理阈值，跳过长期记忆任务",
                    session_id=resolved_session,
                    turn_count=turn_count,
                )

            return {
                **response,
                "session_id": resolved_session,
                "memory_hits": [item["summary"] for item in relevant_memories],
            }
        except Exception as e:
            logger.error("聊天处理失败", error=str(e))
            return {
                "reply": f"呜...出错了呢: {str(e)}",
                "actions": [],
                "session_id": session_id,
            }

    def _preview_text(self, text: str, limit: int = 160) -> str:
        compact = " ".join(str(text or "").split())
        if len(compact) <= limit:
            return compact
        return compact[:limit].rstrip() + "..."

    async def _ingest_memory_async(
        self,
        model_key: str,
        session_id: str,
        persona: Dict[str, Any],
        user_message: str,
        assistant_reply: str,
        actions: Optional[List[Dict[str, Any]]],
        memory_settings: Optional[Dict[str, Any]],
        turn_count: Optional[int],
    ) -> None:
        try:
            result = await self.memory_service.ingest_exchange(
                model_key=model_key,
                session_id=session_id,
                persona=persona,
                user_message=user_message,
                assistant_reply=assistant_reply,
                actions=actions,
                memory_settings=memory_settings,
                turn_count=turn_count,
            )
            logger.info(
                "阶段性记忆任务完成",
                session_id=session_id,
                model_key=model_key,
                turn_count=turn_count,
                memory_updated=bool(result.get("memory_updated")),
                impression_updated=bool(result.get("impression_updated")),
            )
        except Exception as exc:
            logger.warning("长期记忆异步写入失败", error=str(exc), session_id=session_id, model_key=model_key)

    async def _build_context_summary(self) -> str:
        schedule_summary = await self.schedule_service.get_schedule_summary()
        todo_summary = await self.todo_service.get_todo_summary()
        return "\n".join(
            [
                "=== 当前上下文 ===",
                f"时间: {datetime.now().strftime('%Y年%m月%d日 %H:%M')}",
                "",
                schedule_summary,
                "",
                todo_summary,
            ]
        )

    def _build_memory_query(self, user_message: str, recent_messages: List[Dict[str, Any]]) -> str:
        snippets = [str(item.get("content") or "").strip() for item in recent_messages[-4:] if item.get("content")]
        snippets.append(user_message.strip())
        return "\n".join(snippets)

    def _build_system_prompt(
        self,
        persona: Dict[str, Any],
        model_key: str,
        context: str,
        long_term_memories: List[Dict[str, Any]],
        impression_text: str,
        share_memory_across_sessions: bool,
    ) -> str:
        persona_name = str(persona.get("name", "") or "桌宠").strip()
        tone = str(persona.get("tone", "") or "").strip()
        persona_prompt = str(persona.get("system_prompt", "") or "").strip()
        default_persona = "你的性格温柔可爱，喜欢用「呢」「哦」「呀」等语气词，会关心主人的日常。"
        memory_mode = "同模型跨会话共享" if share_memory_across_sessions else "仅当前会话独立记忆"

        memory_lines = ["=== 长期相关记忆 ==="]
        if long_term_memories:
            for item in long_term_memories:
                memory_lines.append(f"- {item['summary']}")
        else:
            memory_lines.append("- 暂时还没有检索到和当前话题强相关的长期事件")

        impression_block = impression_text or "以当前模型视角形成的用户印象还很少，请在互动中逐步积累，但不要凭空编造。"

        return f"""你是桌面宠物 {persona_name}，当前模型标识为 {model_key}。

当前性格设定：
{persona_prompt or tone or default_persona}

记忆策略：{memory_mode}

{context}

{chr(10).join(memory_lines)}

=== 你对主人的长期印象 ===
{impression_block}

回复要求：
1. 回复保持简短、自然、有陪伴感，优先在 1 到 4 句内完成
2. 优先结合“长期相关记忆”和“长期印象”理解当前消息，但不要把旧印象当成绝对事实
3. 如果用户提到时间、计划、待办，优先判断是否需要调用工具
4. 如果你不确定，就先澄清，不要编造并不存在的长期记忆
5. 时间格式使用 ISO 8601，如 2026-03-13T18:00:00
6. 你可以温柔，但不要过分冗长，不要做空泛大段输出
"""

    def _prepare_messages(
        self,
        system_prompt: str,
        recent_messages: List[Dict[str, Any]],
        user_message: str,
    ) -> List[Dict[str, Any]]:
        messages: List[Dict[str, Any]] = [{"role": "system", "content": system_prompt}]
        for msg in recent_messages:
            role = str(msg.get("role") or "").strip()
            if role not in {"user", "assistant", "tool"}:
                continue
            entry: Dict[str, Any] = {
                "role": role,
                "content": msg.get("content", ""),
            }
            metadata = msg.get("metadata") or {}
            if role == "tool" and metadata.get("tool_call_id"):
                entry["tool_call_id"] = metadata["tool_call_id"]
            messages.append(entry)
        messages.append({"role": "user", "content": user_message})
        return messages

    def _define_tools(self) -> List[Dict[str, Any]]:
        return [
            {
                "type": "function",
                "function": {
                    "name": "create_schedule",
                    "description": "创建一个新的日程安排。支持设置重复类型（每日/每周/每月/每年）和提前提醒时间。",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string", "description": "日程标题"},
                            "start_time": {"type": "string", "description": "开始时间，ISO 8601格式，例如：2026-03-15T14:00:00"},
                            "end_time": {"type": "string", "description": "结束时间（可选），ISO 8601格式"},
                            "description": {"type": "string", "description": "日程描述（可选）"},
                            "location": {"type": "string", "description": "地点（可选）"},
                            "priority": {
                                "type": "string",
                                "enum": ["low", "normal", "high", "urgent"],
                                "description": "优先级：low(低)、normal(普通)、high(高)、urgent(紧急)，默认normal",
                            },
                            "repeat_type": {
                                "type": "string",
                                "enum": ["none", "daily", "weekly", "monthly", "yearly"],
                                "description": "重复类型：none(不重复)、daily(每日)、weekly(每周)、monthly(每月)、yearly(每年)，默认none",
                            },
                            "reminder_minutes": {
                                "type": "integer",
                                "description": "提前多少分钟提醒，默认15分钟。例如：15、30、60、1440(一天前)",
                            },
                            "all_day": {
                                "type": "boolean",
                                "description": "是否全天事件，默认false",
                            },
                        },
                        "required": ["title", "start_time"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "create_todo",
                    "description": "创建一个新的待办事项。可以设置截止日期，系统会在到期前自动提醒。",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string", "description": "待办标题"},
                            "description": {"type": "string", "description": "待办描述（可选）"},
                            "due_date": {
                                "type": "string",
                                "description": "截止日期（可选），ISO 8601格式，例如：2026-03-15T18:00:00。系统会在到期前1小时和1天前自动提醒。",
                            },
                            "priority": {
                                "type": "string",
                                "enum": ["low", "normal", "high", "urgent"],
                                "description": "优先级：low(低)、normal(普通)、high(高)、urgent(紧急)，默认normal",
                            },
                        },
                        "required": ["title"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "query_schedule",
                    "description": "查询日程安排",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "date": {"type": "string", "description": "查询日期，格式YYYY-MM-DD，不传则查询今天"}
                        },
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "query_todo",
                    "description": "查询待办事项",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "status": {
                                "type": "string",
                                "enum": ["pending", "done", "all"],
                                "description": "状态筛选：pending(待处理)、done(已完成)、all(全部)，默认pending",
                            }
                        },
                    },
                },
            },
        ]

    async def _call_llm_with_tools(
        self,
        messages: List[Dict[str, Any]],
        tools: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        actions: List[Dict[str, Any]] = []
        for _ in range(5):
            response = await self.llm_client.chat(messages, tools=tools)
            if not response.get("tool_calls"):
                return {
                    "reply": response["content"],
                    "actions": actions,
                }

            for tool_call in response["tool_calls"]:
                function_name = tool_call["function"]["name"]
                arguments = json.loads(tool_call["function"]["arguments"])
                logger.info("执行工具调用", function=function_name, args=arguments)
                tool_result = await self._execute_tool_call(function_name, arguments)
                actions.append(
                    {
                        "function": function_name,
                        "arguments": arguments,
                        "result": tool_result,
                        "message": tool_result.get("message", ""),
                    }
                )
                messages.append({"role": "assistant", "content": None, "tool_calls": [tool_call]})
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call["id"],
                        "content": json.dumps(tool_result, ensure_ascii=False),
                    }
                )

        final_response = await self.llm_client.chat(messages, tools=None)
        return {
            "reply": final_response["content"],
            "actions": actions,
        }

    async def _execute_tool_call(self, function_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        try:
            if function_name == "create_schedule":
                # v2服务返回ScheduleEvent对象
                event = await self.schedule_service.create_event(
                    title=arguments["title"],
                    start_time=arguments["start_time"],
                    end_time=arguments.get("end_time", ""),
                    description=arguments.get("description", ""),
                    location=arguments.get("location", ""),
                    priority=arguments.get("priority", "normal"),
                    repeat_type=arguments.get("repeat_type", "none"),
                    reminder_minutes=arguments.get("reminder_minutes", 15),
                    all_day=arguments.get("all_day", False),
                )

                # 构建友好的回复消息
                repeat_text = {
                    "none": "",
                    "daily": "，每日重复",
                    "weekly": "，每周重复",
                    "monthly": "，每月重复",
                    "yearly": "，每年重复",
                }.get(event.repeat_type, "")

                reminder_text = f"，将提前{event.reminder_minutes}分钟提醒" if event.reminder_minutes > 0 else ""

                return {
                    "success": True,
                    "schedule_id": event.id,
                    "message": f"日程「{event.title}」创建成功{repeat_text}{reminder_text}"
                }

            if function_name == "create_todo":
                # v2服务返回TodoItem对象
                todo = await self.todo_service.create_todo(
                    title=arguments["title"],
                    description=arguments.get("description", ""),
                    priority=arguments.get("priority", "normal"),
                    due_date=arguments.get("due_date", ""),
                )

                # 构建友好的回复消息
                due_text = ""
                if todo.due_date:
                    try:
                        from datetime import datetime
                        due_dt = datetime.fromisoformat(todo.due_date.replace('Z', '+00:00'))
                        due_text = f"，截止时间：{due_dt.strftime('%m月%d日 %H:%M')}，系统会在到期前自动提醒"
                    except:
                        due_text = f"，截止时间：{todo.due_date}"

                return {
                    "success": True,
                    "todo_id": todo.id,
                    "message": f"待办「{todo.title}」创建成功{due_text}"
                }

            if function_name == "query_schedule":
                date = arguments.get("date")
                if date:
                    events = await self.schedule_service.list_events(date=date)
                else:
                    events = await self.schedule_service.get_today_events()
                schedules = [e.to_dict() for e in events]
                return {"success": True, "schedules": schedules, "count": len(schedules), "message": f"已查询到 {len(schedules)} 条日程"}
            if function_name == "query_todo":
                status = arguments.get("status", "pending")
                if status == "all":
                    status = ""
                todos_list = await self.todo_service.list_todos(status=status)
                todos = [t.to_dict() for t in todos_list]
                return {"success": True, "todos": todos, "count": len(todos), "message": f"已查询到 {len(todos)} 条待办"}
            return {"success": False, "message": f"未知的工具: {function_name}"}
        except Exception as e:
            logger.error("工具执行失败", function=function_name, error=str(e))
            return {"success": False, "message": f"执行失败: {str(e)}"}
