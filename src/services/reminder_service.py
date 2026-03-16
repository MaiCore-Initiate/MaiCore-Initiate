"""
提醒服务
定期检查日程和待办，在到期前发送通知
"""
import asyncio
import structlog
from datetime import datetime, timedelta
from typing import Optional, Set
from src.core.pet_database import PetDatabase
from src.services.schedule_service_v2 import ScheduleService
from src.services.todo_service_v2 import TodoService
from src.utils.notifier import windows_notifier

logger = structlog.get_logger(__name__)


class ReminderService:
    """提醒服务 - 监控日程和待办，发送到期提醒"""

    def __init__(self, db: PetDatabase):
        self.db = db
        self.schedule_service = ScheduleService(db)
        self.todo_service = TodoService(db)
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._notified_events: Set[str] = set()  # 已通知的事件ID集合
        self._notified_todos: Set[str] = set()  # 已通知的待办ID集合
        logger.info("提醒服务初始化完成")

    async def start(self):
        """启动提醒服务"""
        if self._running:
            logger.warning("提醒服务已在运行")
            return

        self._running = True
        self._task = asyncio.create_task(self._reminder_loop())
        logger.info("提醒服务已启动")

    async def stop(self):
        """停止提醒服务"""
        if not self._running:
            return

        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("提醒服务已停止")

    async def _reminder_loop(self):
        """提醒循环 - 每分钟检查一次"""
        while self._running:
            try:
                await self._check_reminders()
            except Exception as e:
                logger.error("提醒检查失败", error=str(e))

            # 每60秒检查一次
            await asyncio.sleep(60)

    async def _check_reminders(self):
        """检查需要提醒的日程和待办"""
        now = datetime.now()

        # 检查日程提醒
        await self._check_schedule_reminders(now)

        # 检查待办提醒
        await self._check_todo_reminders(now)

        # 清理过期的已通知记录（24小时前的）
        self._cleanup_old_notifications(now)

    async def _check_schedule_reminders(self, now: datetime):
        """检查日程提醒"""
        try:
            # 获取今天和明天的日程
            today = now.strftime("%Y-%m-%d")
            tomorrow = (now + timedelta(days=1)).strftime("%Y-%m-%d")

            today_events = await self.schedule_service.list_events(date=today)
            tomorrow_events = await self.schedule_service.list_events(date=tomorrow)
            all_events = today_events + tomorrow_events

            for event in all_events:
                event_key = f"schedule_{event.id}"

                # 如果已经通知过，跳过
                if event_key in self._notified_events:
                    continue

                # 解析日程开始时间
                try:
                    start_time = datetime.fromisoformat(event.start_time.replace('Z', '+00:00'))
                except Exception:
                    continue

                # 计算提醒时间（提前N分钟）
                reminder_time = start_time - timedelta(minutes=event.reminder_minutes)

                # 如果当前时间已经到达或超过提醒时间
                if now >= reminder_time:
                    # 但还没到开始时间（避免过期日程也提醒）
                    if now < start_time:
                        self._send_schedule_notification(event, start_time, now)
                        self._notified_events.add(event_key)
                    # 如果已经开始但在1小时内，也提醒一次
                    elif (now - start_time).total_seconds() < 3600:
                        self._send_schedule_notification(event, start_time, now, is_started=True)
                        self._notified_events.add(event_key)

        except Exception as e:
            logger.error("检查日程提醒失败", error=str(e))

    async def _check_todo_reminders(self, now: datetime):
        """检查待办提醒"""
        try:
            # 获取所有待处理和进行中的待办
            pending_todos = await self.todo_service.list_pending()
            in_progress_todos = await self.todo_service.list_in_progress()
            all_todos = pending_todos + in_progress_todos

            for todo in all_todos:
                todo_key = f"todo_{todo.id}"

                # 如果已经通知过，跳过
                if todo_key in self._notified_todos:
                    continue

                # 如果没有截止日期，跳过
                if not todo.due_date:
                    continue

                # 解析截止日期
                try:
                    due_date = datetime.fromisoformat(todo.due_date.replace('Z', '+00:00'))
                except Exception:
                    continue

                # 计算时间差
                time_diff = due_date - now

                # 如果已经逾期
                if time_diff.total_seconds() < 0:
                    # 逾期1小时内提醒一次
                    if abs(time_diff.total_seconds()) < 3600:
                        self._send_todo_notification(todo, due_date, now, is_overdue=True)
                        self._notified_todos.add(todo_key)
                # 如果在1小时内到期
                elif time_diff.total_seconds() < 3600:
                    self._send_todo_notification(todo, due_date, now)
                    self._notified_todos.add(todo_key)
                # 如果在24小时内到期（提前一天提醒）
                elif time_diff.total_seconds() < 86400:
                    # 只在早上9点提醒一次
                    if now.hour == 9 and now.minute < 2:
                        self._send_todo_notification(todo, due_date, now, is_tomorrow=True)
                        self._notified_todos.add(todo_key)

        except Exception as e:
            logger.error("检查待办提醒失败", error=str(e))

    def _send_schedule_notification(self, event, start_time: datetime, now: datetime, is_started: bool = False):
        """发送日程通知"""
        try:
            if is_started:
                title = "📅 日程已开始"
                time_str = start_time.strftime("%H:%M")
                message = f"{event.title}\n开始时间: {time_str}"
            else:
                time_diff = start_time - now
                minutes = int(time_diff.total_seconds() / 60)

                if minutes <= 0:
                    title = "📅 日程即将开始"
                    message = f"{event.title}\n马上就要开始了！"
                elif minutes < 60:
                    title = "📅 日程提醒"
                    message = f"{event.title}\n{minutes}分钟后开始"
                else:
                    hours = minutes // 60
                    title = "📅 日程提醒"
                    message = f"{event.title}\n{hours}小时后开始"

            if event.location:
                message += f"\n地点: {event.location}"

            # 根据优先级添加标记
            priority_marks = {
                "urgent": "🔴 ",
                "high": "🟠 ",
                "normal": "",
                "low": ""
            }
            message = priority_marks.get(event.priority, "") + message

            windows_notifier.send(title, message, duration=10)
            logger.info("日程提醒已发送", event_id=event.id, title=event.title)

        except Exception as e:
            logger.error("发送日程通知失败", error=str(e), event_id=event.id)

    def _send_todo_notification(self, todo, due_date: datetime, now: datetime, is_overdue: bool = False, is_tomorrow: bool = False):
        """发送待办通知"""
        try:
            if is_overdue:
                title = "⚠️ 待办已逾期"
                message = f"{todo.title}\n已经逾期了！请尽快完成"
            elif is_tomorrow:
                title = "📋 待办提醒"
                due_str = due_date.strftime("%m月%d日 %H:%M")
                message = f"{todo.title}\n截止时间: {due_str}\n明天就要到期了"
            else:
                title = "📋 待办即将到期"
                time_diff = due_date - now
                minutes = int(time_diff.total_seconds() / 60)

                if minutes < 60:
                    message = f"{todo.title}\n{minutes}分钟后到期"
                else:
                    hours = minutes // 60
                    message = f"{todo.title}\n{hours}小时后到期"

            # 根据优先级添加标记
            priority_marks = {
                "urgent": "🔴 ",
                "high": "🟠 ",
                "normal": "",
                "low": ""
            }
            message = priority_marks.get(todo.priority, "") + message

            windows_notifier.send(title, message, duration=10)
            logger.info("待办提醒已发送", todo_id=todo.id, title=todo.title)

        except Exception as e:
            logger.error("发送待办通知失败", error=str(e), todo_id=todo.id)

    def _cleanup_old_notifications(self, now: datetime):
        """清理24小时前的已通知记录"""
        # 简单实现：每天凌晨清空
        if now.hour == 0 and now.minute < 2:
            old_count = len(self._notified_events) + len(self._notified_todos)
            self._notified_events.clear()
            self._notified_todos.clear()
            if old_count > 0:
                logger.info("已清理过期通知记录", count=old_count)
