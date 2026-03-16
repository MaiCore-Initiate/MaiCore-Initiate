"""
桌宠数据模型
从Neo-MoFox插件迁移并适配到MaiCore
"""
from enum import Enum
from typing import Optional
from datetime import datetime


# ─── 枚举定义 ─────────────────────────────────────────────────────


class RepeatType(str, Enum):
    """重复类型"""
    NONE = "none"
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    YEARLY = "yearly"


class EventPriority(str, Enum):
    """事件优先级"""
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


class TodoStatus(str, Enum):
    """待办状态"""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    DONE = "done"
    CANCELLED = "cancelled"


# ─── 数据类 ───────────────────────────────────────────────────────


class ScheduleEvent:
    """日程事件数据类"""

    def __init__(self, data: dict):
        self.id: int = data.get("id", 0)
        self.title: str = data.get("title", "")
        self.description: str = data.get("description", "")
        self.start_time: str = data.get("start_time", "")
        self.end_time: str = data.get("end_time", "")
        self.all_day: bool = data.get("all_day", False)
        self.repeat_type: str = data.get("repeat_type", RepeatType.NONE.value)
        self.priority: str = data.get("priority", EventPriority.NORMAL.value)
        self.tags: str = data.get("tags", "")
        self.location: str = data.get("location", "")
        self.reminder_minutes: int = data.get("reminder_minutes", 15)
        self.stream_id: str = data.get("stream_id", "")
        self.user_id: str = data.get("user_id", "")
        self.created_at: str = data.get("created_at", "")
        self.updated_at: str = data.get("updated_at", "")
        self.is_deleted: bool = data.get("is_deleted", False)

    def to_dict(self) -> dict:
        """转为字典格式"""
        tags_list = [t.strip() for t in self.tags.split(",") if t.strip()] if self.tags else []
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "all_day": self.all_day,
            "repeat_type": self.repeat_type,
            "priority": self.priority,
            "tags": tags_list,
            "location": self.location,
            "reminder_minutes": self.reminder_minutes,
            "stream_id": self.stream_id,
            "user_id": self.user_id,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "is_deleted": self.is_deleted,
        }

    def format_display(self) -> str:
        """格式化为可读文本"""
        time_str = self.start_time.split("T")[1][:5] if "T" in self.start_time else "全天"
        priority_mark = {
            EventPriority.URGENT.value: "🔴",
            EventPriority.HIGH.value: "🟠",
            EventPriority.NORMAL.value: "🟢",
            EventPriority.LOW.value: "⚪",
        }.get(self.priority, "")

        parts = [f"{priority_mark} {time_str} {self.title}"]
        if self.location:
            parts.append(f"📍 {self.location}")
        return " ".join(parts)


class TodoItem:
    """待办事项数据类"""

    def __init__(self, data: dict):
        self.id: int = data.get("id", 0)
        self.title: str = data.get("title", "")
        self.description: str = data.get("description", "")
        self.status: str = data.get("status", TodoStatus.PENDING.value)
        self.priority: str = data.get("priority", EventPriority.NORMAL.value)
        self.due_date: str = data.get("due_date", "")
        self.tags: str = data.get("tags", "")
        self.stream_id: str = data.get("stream_id", "")
        self.user_id: str = data.get("user_id", "")
        self.created_at: str = data.get("created_at", "")
        self.updated_at: str = data.get("updated_at", "")
        self.completed_at: str = data.get("completed_at", "")
        self.is_deleted: bool = data.get("is_deleted", False)

    def to_dict(self) -> dict:
        """转为字典格式"""
        tags_list = [t.strip() for t in self.tags.split(",") if t.strip()] if self.tags else []
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "status": self.status,
            "priority": self.priority,
            "due_date": self.due_date,
            "tags": tags_list,
            "stream_id": self.stream_id,
            "user_id": self.user_id,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "completed_at": self.completed_at,
            "is_deleted": self.is_deleted,
        }

    def format_display(self) -> str:
        """格式化为可读文本"""
        status_mark = {
            TodoStatus.PENDING.value: "⏳",
            TodoStatus.IN_PROGRESS.value: "🔄",
            TodoStatus.DONE.value: "✅",
            TodoStatus.CANCELLED.value: "❌",
        }.get(self.status, "")

        priority_mark = {
            EventPriority.URGENT.value: "🔴",
            EventPriority.HIGH.value: "🟠",
            EventPriority.NORMAL.value: "",
            EventPriority.LOW.value: "",
        }.get(self.priority, "")

        parts = [f"{status_mark} {priority_mark} {self.title}".strip()]

        if self.due_date:
            try:
                due = datetime.fromisoformat(self.due_date)
                now = datetime.now()
                if due < now and self.status == TodoStatus.PENDING.value:
                    parts.append("⚠️ 已逾期")
                else:
                    parts.append(f"📅 {due.strftime('%m-%d')}")
            except (ValueError, TypeError):
                pass

        return " ".join(parts)

    def is_overdue(self) -> bool:
        """检查是否逾期"""
        if not self.due_date or self.status != TodoStatus.PENDING.value:
            return False
        try:
            due = datetime.fromisoformat(self.due_date)
            return due < datetime.now()
        except (ValueError, TypeError):
            return False
