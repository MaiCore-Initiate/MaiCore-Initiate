"""
日程管理服务
提供日程的业务逻辑处理
"""
import structlog
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from src.core.pet_database import PetDatabase

logger = structlog.get_logger(__name__)


class ScheduleService:
    """日程管理服务类"""

    def __init__(self, db: PetDatabase):
        """
        初始化日程服务

        Args:
            db: 数据库实例
        """
        self.db = db
        logger.info("日程服务初始化完成")

    async def create_schedule(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        创建日程

        Args:
            data: 日程数据

        Returns:
            创建结果
        """
        try:
            schedule_id = await self.db.create_schedule(data)
            return {
                "success": True,
                "schedule_id": schedule_id,
                "message": f"日程「{data['title']}」创建成功"
            }
        except Exception as e:
            logger.error("创建日程失败", error=str(e))
            return {
                "success": False,
                "message": f"创建日程失败: {str(e)}"
            }

    async def get_today_schedules(self) -> List[Dict[str, Any]]:
        """
        获取今日日程

        Returns:
            今日日程列表
        """
        today = datetime.now().strftime("%Y-%m-%d")
        return await self.db.get_schedules(date=today)

    async def get_upcoming_schedules(self, days: int = 7) -> List[Dict[str, Any]]:
        """
        获取未来N天的日程

        Args:
            days: 天数

        Returns:
            日程列表
        """
        start_date = datetime.now().strftime("%Y-%m-%d")
        end_date = (datetime.now() + timedelta(days=days)).strftime("%Y-%m-%d")
        return await self.db.get_schedules(start_date=start_date, end_date=end_date)

    async def search_schedules(self, keyword: str) -> List[Dict[str, Any]]:
        """
        搜索日程

        Args:
            keyword: 搜索关键词

        Returns:
            匹配的日程列表
        """
        all_schedules = await self.db.get_schedules()
        keyword_lower = keyword.lower()

        results = []
        for schedule in all_schedules:
            if (keyword_lower in schedule["title"].lower() or
                (schedule.get("description") and keyword_lower in schedule["description"].lower()) or
                (schedule.get("location") and keyword_lower in schedule["location"].lower())):
                results.append(schedule)

        return results

    async def delete_schedule(self, schedule_id: int) -> Dict[str, Any]:
        """
        删除日程

        Args:
            schedule_id: 日程ID

        Returns:
            删除结果
        """
        try:
            success = await self.db.delete_schedule(schedule_id)
            if success:
                return {
                    "success": True,
                    "message": "日程删除成功"
                }
            else:
                return {
                    "success": False,
                    "message": "日程不存在或已删除"
                }
        except Exception as e:
            logger.error("删除日程失败", error=str(e))
            return {
                "success": False,
                "message": f"删除日程失败: {str(e)}"
            }

    async def get_schedule_summary(self) -> str:
        """
        获取日程摘要（用于AI上下文）

        Returns:
            日程摘要文本
        """
        today_schedules = await self.get_today_schedules()
        upcoming_schedules = await self.get_upcoming_schedules(days=3)

        summary_parts = []

        if today_schedules:
            summary_parts.append(f"今天有{len(today_schedules)}个日程:")
            for s in today_schedules[:3]:  # 最多显示3个
                time_str = s["start_time"].split("T")[1][:5] if "T" in s["start_time"] else "全天"
                summary_parts.append(f"  - {time_str} {s['title']}")
        else:
            summary_parts.append("今天没有日程安排")

        future_count = len([s for s in upcoming_schedules if s not in today_schedules])
        if future_count > 0:
            summary_parts.append(f"未来3天还有{future_count}个日程")

        return "\n".join(summary_parts)
