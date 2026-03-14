"""
待办事项管理服务
提供待办的业务逻辑处理
"""
import structlog
from typing import Dict, Any, List, Optional
from datetime import datetime
from src.core.pet_database import PetDatabase

logger = structlog.get_logger(__name__)


class TodoService:
    """待办事项管理服务类"""

    def __init__(self, db: PetDatabase):
        """
        初始化待办服务

        Args:
            db: 数据库实例
        """
        self.db = db
        logger.info("待办服务初始化完成")

    async def create_todo(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        创建待办事项

        Args:
            data: 待办数据

        Returns:
            创建结果
        """
        try:
            todo_id = await self.db.create_todo(data)
            return {
                "success": True,
                "todo_id": todo_id,
                "message": f"待办「{data['title']}」创建成功"
            }
        except Exception as e:
            logger.error("创建待办失败", error=str(e))
            return {
                "success": False,
                "message": f"创建待办失败: {str(e)}"
            }

    async def get_todos(self, status: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        获取待办列表

        Args:
            status: 可选的状态筛选

        Returns:
            待办列表
        """
        return await self.db.get_todos(status=status)

    async def get_pending_todos(self) -> List[Dict[str, Any]]:
        """
        获取待处理的待办

        Returns:
            待处理待办列表
        """
        return await self.db.get_todos(status="pending")

    async def toggle_todo(self, todo_id: int) -> Dict[str, Any]:
        """
        切换待办完成状态

        Args:
            todo_id: 待办ID

        Returns:
            操作结果
        """
        try:
            result = await self.db.toggle_todo(todo_id)
            if result:
                status_text = "已完成" if result["status"] == "done" else "未完成"
                return {
                    "success": True,
                    "todo": result,
                    "message": f"待办已标记为{status_text}"
                }
            else:
                return {
                    "success": False,
                    "message": "待办不存在"
                }
        except Exception as e:
            logger.error("切换待办状态失败", error=str(e))
            return {
                "success": False,
                "message": f"操作失败: {str(e)}"
            }

    async def delete_todo(self, todo_id: int) -> Dict[str, Any]:
        """
        删除待办

        Args:
            todo_id: 待办ID

        Returns:
            删除结果
        """
        try:
            success = await self.db.delete_todo(todo_id)
            if success:
                return {
                    "success": True,
                    "message": "待办删除成功"
                }
            else:
                return {
                    "success": False,
                    "message": "待办不存在或已删除"
                }
        except Exception as e:
            logger.error("删除待办失败", error=str(e))
            return {
                "success": False,
                "message": f"删除待办失败: {str(e)}"
            }

    async def get_overdue_todos(self) -> List[Dict[str, Any]]:
        """
        获取逾期的待办

        Returns:
            逾期待办列表
        """
        all_todos = await self.db.get_todos(status="pending")
        now = datetime.now()

        overdue = []
        for todo in all_todos:
            if todo.get("due_date"):
                due_date = datetime.fromisoformat(todo["due_date"])
                if due_date < now:
                    overdue.append(todo)

        return overdue

    async def get_todo_summary(self) -> str:
        """
        获取待办摘要（用于AI上下文）

        Returns:
            待办摘要文本
        """
        pending_todos = await self.get_pending_todos()
        overdue_todos = await self.get_overdue_todos()

        summary_parts = []

        if pending_todos:
            summary_parts.append(f"当前有{len(pending_todos)}个待办事项:")
            for todo in pending_todos[:3]:  # 最多显示3个
                priority_mark = "❗" if todo["priority"] == "high" else ""
                summary_parts.append(f"  - {priority_mark}{todo['title']}")
        else:
            summary_parts.append("当前没有待办事项")

        if overdue_todos:
            summary_parts.append(f"⚠️ 有{len(overdue_todos)}个待办已逾期")

        return "\n".join(summary_parts)
