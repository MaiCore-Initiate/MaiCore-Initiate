"""
日程管理服务
从Neo-MoFox插件迁移并适配到MaiCore
"""
import structlog
from datetime import datetime, timedelta
from typing import Optional, List
from src.core.pet_database import PetDatabase
from src.core.pet_models import ScheduleEvent, RepeatType, EventPriority

logger = structlog.get_logger(__name__)


class ScheduleService:
    """日程管理服务 - 提供日程 CRUD 及查询能力"""

    def __init__(self, db: PetDatabase):
        self.db = db
        logger.info("日程服务初始化完成")

    # ── 创建 ──────────────────────────────────────────────────

    async def create_event(
        self,
        title: str,
        start_time: str,
        *,
        end_time: str = "",
        description: str = "",
        all_day: bool = False,
        repeat_type: str = RepeatType.NONE.value,
        priority: str = EventPriority.NORMAL.value,
        tags: str = "",
        reminder_minutes: int = 15,
        location: str = "",
        stream_id: str = "",
        user_id: str = "",
    ) -> ScheduleEvent:
        """创建一个新的日程事件"""
        now = datetime.now().isoformat()
        data = {
            "title": title,
            "description": description,
            "start_time": start_time,
            "end_time": end_time or start_time,
            "all_day": all_day,
            "repeat_type": repeat_type,
            "priority": priority,
            "tags": tags,
            "location": location,
            "reminder_minutes": reminder_minutes,
            "stream_id": stream_id,
            "user_id": user_id,
            "created_at": now,
            "updated_at": now,
            "is_deleted": False,
        }
        event_id = await self.db.create_schedule(data)
        data["id"] = event_id
        logger.info(f"日程已创建: {title} ({start_time})")
        return ScheduleEvent(data)

    # ── 查询 ──────────────────────────────────────────────────

    async def get_event(self, event_id: int) -> Optional[ScheduleEvent]:
        """通过 ID 获取单个日程"""
        data = await self.db.get_schedule(event_id)
        return ScheduleEvent(data) if data else None

    async def list_events(
        self,
        stream_id: str = "",
        user_id: str = "",
        date: str = "",
        priority: str = "",
        skip: int = 0,
        limit: int = 50,
    ) -> List[ScheduleEvent]:
        """列出日程事件，支持按日期、优先级过滤"""
        schedules = await self.db.get_schedules(
            date=date if date else None,
            start_date=None,
            end_date=None
        )

        # 过滤
        filtered = []
        for s in schedules:
            if s.get("is_deleted"):
                continue
            if stream_id and s.get("stream_id") != stream_id:
                continue
            if user_id and s.get("user_id") != user_id:
                continue
            if priority and s.get("priority") != priority:
                continue
            filtered.append(ScheduleEvent(s))

        # 分页
        return filtered[skip:skip + limit]

    async def get_today_events(self, stream_id: str = "", user_id: str = "") -> List[ScheduleEvent]:
        """获取今日日程"""
        today = datetime.now().strftime("%Y-%m-%d")
        return await self.list_events(stream_id=stream_id, user_id=user_id, date=today)

    async def get_upcoming_events(
        self, minutes: int = 30, stream_id: str = "", user_id: str = ""
    ) -> List[ScheduleEvent]:
        """获取即将到来的日程（未来 N 分钟内）"""
        now = datetime.now()
        cutoff = now + timedelta(minutes=minutes)
        all_today = await self.get_today_events(stream_id=stream_id, user_id=user_id)

        upcoming = []
        for event in all_today:
            try:
                event_time = datetime.fromisoformat(event.start_time)
                if now <= event_time <= cutoff:
                    upcoming.append(event)
            except (ValueError, TypeError):
                continue

        return upcoming

    async def search_events(self, keyword: str, stream_id: str = "") -> List[ScheduleEvent]:
        """按关键词搜索日程（标题 / 描述）"""
        all_events = await self.list_events(stream_id=stream_id, limit=500)
        keyword_lower = keyword.lower()
        return [
            e for e in all_events
            if keyword_lower in e.title.lower()
            or keyword_lower in e.description.lower()
        ]

    # ── 更新 ──────────────────────────────────────────────────

    async def update_event(self, event_id: int, **fields) -> Optional[ScheduleEvent]:
        """更新日程字段"""
        fields["updated_at"] = datetime.now().isoformat()
        success = await self.db.update_schedule(event_id, fields)
        if success:
            logger.info(f"日程已更新: id={event_id}")
            return await self.get_event(event_id)
        return None

    # ── 删除 ──────────────────────────────────────────────────

    async def delete_event(self, event_id: int) -> bool:
        """软删除日程"""
        success = await self.db.delete_schedule(event_id)
        if success:
            logger.info(f"日程已删除: id={event_id}")
        return success

    # ── 统计 ──────────────────────────────────────────────────

    async def count_events(self, stream_id: str = "", user_id: str = "") -> int:
        """统计日程总数"""
        events = await self.list_events(stream_id=stream_id, user_id=user_id, limit=10000)
        return len(events)

    # ── 格式化 ────────────────────────────────────────────────

    @staticmethod
    def format_event_list(events: List[ScheduleEvent], title: str = "日程列表") -> str:
        """将事件列表格式化为可读文本"""
        if not events:
            return f"-- {title} --\n暂无日程"
        lines = [f"-- {title} ({len(events)} 项) --"]
        for i, e in enumerate(events, 1):
            lines.append(f"  {i}. {e.format_display()}")
        return "\n".join(lines)

    async def get_schedule_summary(self) -> str:
        """获取日程摘要（用于AI上下文）"""
        today_events = await self.get_today_events()
        upcoming_events = await self.get_upcoming_events(minutes=60)

        summary_parts = []

        if today_events:
            summary_parts.append(f"今天有{len(today_events)}个日程:")
            for event in today_events[:3]:  # 最多显示3个
                summary_parts.append(f"  - {event.format_display()}")
        else:
            summary_parts.append("今天没有日程安排")

        if upcoming_events:
            summary_parts.append(f"⏰ 未来1小时内有{len(upcoming_events)}个日程即将开始")

        return "\n".join(summary_parts)
