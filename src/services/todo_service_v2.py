"""
待办事项管理服务
从Neo-MoFox插件迁移并适配到MaiCore
"""
import structlog
from datetime import datetime
from typing import Optional, List
from src.core.pet_database import PetDatabase
from src.core.pet_models import TodoItem, TodoStatus, EventPriority

logger = structlog.get_logger(__name__)


class TodoService:
    """待办事项管理服务"""

    def __init__(self, db: PetDatabase):
        self.db = db
        logger.info("待办服务初始化完成")

    # ── 创建 ──────────────────────────────────────────────────

    async def create_todo(
        self,
        title: str,
        *,
        description: str = "",
        priority: str = EventPriority.NORMAL.value,
        due_date: str = "",
        tags: str = "",
        stream_id: str = "",
        user_id: str = "",
    ) -> TodoItem:
        """创建待办事项"""
        now = datetime.now().isoformat()
        data = {
            "title": title,
            "description": description,
            "status": TodoStatus.PENDING.value,
            "priority": priority,
            "due_date": due_date,
            "tags": tags,
            "stream_id": stream_id,
            "user_id": user_id,
            "created_at": now,
            "updated_at": now,
            "completed_at": "",
            "is_deleted": False,
        }
        todo_id = await self.db.create_todo(data)
        data["id"] = todo_id
        logger.info(f"待办已创建: {title}")
        return TodoItem(data)

    # ── 查询 ──────────────────────────────────────────────────

    async def get_todo(self, todo_id: int) -> Optional[TodoItem]:
        """通过 ID 获取待办事项"""
        data = await self.db.get_todo(todo_id)
        return TodoItem(data) if data else None

    async def list_todos(
        self,
        stream_id: str = "",
        user_id: str = "",
        status: str = "",
        priority: str = "",
        skip: int = 0,
        limit: int = 100,
    ) -> List[TodoItem]:
        """列出待办事项，支持状态和优先级过滤"""
        todos = await self.db.get_todos(status=status if status else None)

        # 过滤
        filtered = []
        for t in todos:
            if t.get("is_deleted"):
                continue
            if stream_id and t.get("stream_id") != stream_id:
                continue
            if user_id and t.get("user_id") != user_id:
                continue
            if priority and t.get("priority") != priority:
                continue
            filtered.append(TodoItem(t))

        # 分页
        return filtered[skip:skip + limit]

    async def list_pending(self, stream_id: str = "", user_id: str = "") -> List[TodoItem]:
        """列出待处理的待办"""
        return await self.list_todos(
            stream_id=stream_id,
            user_id=user_id,
            status=TodoStatus.PENDING.value
        )

    async def list_in_progress(self, stream_id: str = "", user_id: str = "") -> List[TodoItem]:
        """列出进行中的待办"""
        return await self.list_todos(
            stream_id=stream_id,
            user_id=user_id,
            status=TodoStatus.IN_PROGRESS.value
        )

    async def list_completed(self, stream_id: str = "", user_id: str = "") -> List[TodoItem]:
        """列出已完成的待办"""
        return await self.list_todos(
            stream_id=stream_id,
            user_id=user_id,
            status=TodoStatus.DONE.value
        )

    async def list_overdue(self, stream_id: str = "", user_id: str = "") -> List[TodoItem]:
        """列出逾期的待办"""
        pending = await self.list_pending(stream_id=stream_id, user_id=user_id)
        return [t for t in pending if t.is_overdue()]

    async def search_todos(self, keyword: str, stream_id: str = "") -> List[TodoItem]:
        """按关键词搜索待办"""
        all_todos = await self.list_todos(stream_id=stream_id, limit=500)
        keyword_lower = keyword.lower()
        return [
            t for t in all_todos
            if keyword_lower in t.title.lower()
            or keyword_lower in t.description.lower()
        ]

    # ── 更新 ──────────────────────────────────────────────────

    async def update_todo(self, todo_id: int, **fields) -> Optional[TodoItem]:
        """更新待办字段"""
        fields["updated_at"] = datetime.now().isoformat()
        success = await self.db.update_todo(todo_id, fields)
        if success:
            logger.info(f"待办已更新: id={todo_id}")
            return await self.get_todo(todo_id)
        return None

    async def update_status(self, todo_id: int, status: str) -> Optional[TodoItem]:
        """更新待办状态"""
        fields = {"status": status}
        if status == TodoStatus.DONE.value:
            fields["completed_at"] = datetime.now().isoformat()
        return await self.update_todo(todo_id, **fields)

    async def mark_done(self, todo_id: int) -> Optional[TodoItem]:
        """标记为已完成"""
        return await self.update_status(todo_id, TodoStatus.DONE.value)

    async def mark_in_progress(self, todo_id: int) -> Optional[TodoItem]:
        """标记为进行中"""
        return await self.update_status(todo_id, TodoStatus.IN_PROGRESS.value)

    async def mark_cancelled(self, todo_id: int) -> Optional[TodoItem]:
        """标记为已取消"""
        return await self.update_status(todo_id, TodoStatus.CANCELLED.value)

    async def toggle_status(self, todo_id: int) -> Optional[TodoItem]:
        """切换待办状态（pending <-> done）"""
        todo = await self.get_todo(todo_id)
        if not todo:
            return None

        if todo.status == TodoStatus.DONE.value:
            new_status = TodoStatus.PENDING.value
        else:
            new_status = TodoStatus.DONE.value

        return await self.update_status(todo_id, new_status)

    # ── 删除 ──────────────────────────────────────────────────

    async def delete_todo(self, todo_id: int) -> bool:
        """软删除待办"""
        success = await self.db.delete_todo(todo_id)
        if success:
            logger.info(f"待办已删除: id={todo_id}")
        return success

    # ── 统计 ──────────────────────────────────────────────────

    async def get_stats(self, stream_id: str = "", user_id: str = "") -> dict:
        """获取待办统计数据"""
        all_todos = await self.list_todos(stream_id=stream_id, user_id=user_id, limit=10000)
        pending = sum(1 for t in all_todos if t.status == TodoStatus.PENDING.value)
        in_progress = sum(1 for t in all_todos if t.status == TodoStatus.IN_PROGRESS.value)
        done = sum(1 for t in all_todos if t.status == TodoStatus.DONE.value)
        cancelled = sum(1 for t in all_todos if t.status == TodoStatus.CANCELLED.value)
        overdue = len([t for t in all_todos if t.is_overdue()])

        return {
            "total": len(all_todos),
            "pending": pending,
            "in_progress": in_progress,
            "done": done,
            "cancelled": cancelled,
            "overdue": overdue,
            "completion_rate": f"{done / len(all_todos) * 100:.1f}%" if all_todos else "0%",
        }

    # ── 格式化 ────────────────────────────────────────────────

    @staticmethod
    def format_todo_list(todos: List[TodoItem], title: str = "待办列表") -> str:
        """格式化待办列表为可读文本"""
        if not todos:
            return f"-- {title} --\n暂无待办事项"
        lines = [f"-- {title} ({len(todos)} 项) --"]
        for i, t in enumerate(todos, 1):
            lines.append(f"  {i}. (id:{t.id}) {t.format_display()}")
        return "\n".join(lines)

    async def get_todo_summary(self) -> str:
        """获取待办摘要（用于AI上下文）"""
        pending = await self.list_pending()
        in_progress = await self.list_in_progress()
        overdue = await self.list_overdue()

        summary_parts = []

        if overdue:
            summary_parts.append(f"⚠️ 逾期待办: {len(overdue)}项")
            for todo in overdue[:3]:
                summary_parts.append(f"  - {todo.format_display()}")

        if in_progress:
            summary_parts.append(f"🔄 进行中: {len(in_progress)}项")
            for todo in in_progress[:3]:
                summary_parts.append(f"  - {todo.format_display()}")

        if pending:
            summary_parts.append(f"⏳ 待处理: {len(pending)}项")
            for todo in pending[:3]:
                summary_parts.append(f"  - {todo.format_display()}")

        if not summary_parts:
            return "暂无待办事项"

        return "\n".join(summary_parts)
