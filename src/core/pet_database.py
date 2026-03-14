"""
桌宠数据库管理模块
负责日程、待办、会话、聊天历史、长期记忆与用户映像的数据持久化
"""
import json
import os
import sqlite3
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import structlog

logger = structlog.get_logger(__name__)


def _now_iso() -> str:
    return datetime.now().isoformat()


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def _json_loads(value: Any, fallback: Any) -> Any:
    if not value:
        return fallback
    try:
        return json.loads(value)
    except Exception:
        return fallback


class PetDatabase:
    """桌宠数据库管理类"""

    def __init__(self, db_path: str = "data/pet_data.db"):
        self.db_path = db_path
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        self.init_tables()
        logger.info("桌宠数据库初始化完成", db_path=db_path)

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        return conn

    def init_tables(self):
        conn = self._get_connection()
        cursor = conn.cursor()

        try:
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS schedules (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    start_time TEXT NOT NULL,
                    end_time TEXT,
                    description TEXT,
                    all_day INTEGER DEFAULT 0,
                    repeat_type TEXT DEFAULT 'none',
                    priority TEXT DEFAULT 'normal',
                    tags TEXT,
                    remind_before_minutes INTEGER DEFAULT 15,
                    location TEXT,
                    is_deleted INTEGER DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )

            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS todos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title TEXT NOT NULL,
                    description TEXT,
                    status TEXT DEFAULT 'pending',
                    priority TEXT DEFAULT 'normal',
                    due_date TEXT,
                    tags TEXT,
                    is_deleted INTEGER DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    completed_at TEXT
                )
                """
            )

            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS pet_chat_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    timestamp TEXT NOT NULL
                )
                """
            )

            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS chat_sessions (
                    id TEXT PRIMARY KEY,
                    model_key TEXT NOT NULL,
                    title TEXT NOT NULL,
                    persona_name TEXT DEFAULT '',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    last_active_at TEXT NOT NULL,
                    is_archived INTEGER DEFAULT 0
                )
                """
            )

            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS chat_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    metadata TEXT,
                    FOREIGN KEY(session_id) REFERENCES chat_sessions(id)
                )
                """
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_chat_messages_session_time ON chat_messages(session_id, id DESC)"
            )

            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS long_term_memories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    model_key TEXT NOT NULL,
                    source TEXT NOT NULL,
                    content TEXT NOT NULL,
                    summary TEXT NOT NULL,
                    tags TEXT,
                    keywords TEXT,
                    embedding TEXT NOT NULL,
                    importance REAL DEFAULT 0.5,
                    event_key TEXT,
                    metadata TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    last_accessed_at TEXT
                )
                """
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_long_term_memories_model_time ON long_term_memories(model_key, updated_at DESC)"
            )
            cursor.execute(
                "CREATE INDEX IF NOT EXISTS idx_long_term_memories_session_time ON long_term_memories(session_id, updated_at DESC)"
            )
            cursor.execute(
                "CREATE UNIQUE INDEX IF NOT EXISTS idx_long_term_memories_event ON long_term_memories(session_id, event_key) WHERE event_key IS NOT NULL"
            )

            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS user_impressions (
                    scope_key TEXT PRIMARY KEY,
                    model_key TEXT NOT NULL,
                    session_id TEXT,
                    summary TEXT NOT NULL,
                    facets TEXT,
                    token_estimate INTEGER DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )

            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS app_state (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )

            conn.commit()
            logger.info("数据库表初始化完成")
        except Exception as e:
            logger.error("数据库表初始化失败", error=str(e))
            conn.rollback()
            raise
        finally:
            conn.close()

    # ==================== 日程管理 ====================

    async def create_schedule(self, data: Dict[str, Any]) -> int:
        conn = self._get_connection()
        cursor = conn.cursor()

        try:
            now = _now_iso()
            tags_json = _json_dumps(data.get("tags", [])) if data.get("tags") else None
            cursor.execute(
                """
                INSERT INTO schedules (
                    title, start_time, end_time, description, all_day,
                    repeat_type, priority, tags, remind_before_minutes,
                    location, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    data["title"],
                    data["start_time"],
                    data.get("end_time"),
                    data.get("description"),
                    1 if data.get("all_day") else 0,
                    data.get("repeat_type", "none"),
                    data.get("priority", "normal"),
                    tags_json,
                    data.get("remind_before_minutes", 15),
                    data.get("location"),
                    now,
                    now,
                ),
            )
            conn.commit()
            schedule_id = int(cursor.lastrowid)
            logger.info("日程创建成功", schedule_id=schedule_id, title=data["title"])
            return schedule_id
        except Exception as e:
            logger.error("日程创建失败", error=str(e))
            conn.rollback()
            raise
        finally:
            conn.close()

    async def get_schedules(
        self,
        date: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        conn = self._get_connection()
        cursor = conn.cursor()

        try:
            query = "SELECT * FROM schedules WHERE is_deleted = 0"
            params: List[Any] = []
            if date:
                query += " AND DATE(start_time) = ?"
                params.append(date)
            elif start_date and end_date:
                query += " AND DATE(start_time) BETWEEN ? AND ?"
                params.extend([start_date, end_date])

            query += " ORDER BY start_time ASC"
            cursor.execute(query, params)
            rows = cursor.fetchall()

            schedules: List[Dict[str, Any]] = []
            for row in rows:
                schedule = dict(row)
                schedule["tags"] = _json_loads(schedule.get("tags"), [])
                schedule["all_day"] = bool(schedule["all_day"])
                schedules.append(schedule)
            return schedules
        except Exception as e:
            logger.error("获取日程失败", error=str(e))
            raise
        finally:
            conn.close()

    async def delete_schedule(self, schedule_id: int) -> bool:
        conn = self._get_connection()
        cursor = conn.cursor()

        try:
            cursor.execute(
                """
                UPDATE schedules SET is_deleted = 1, updated_at = ?
                WHERE id = ?
                """,
                (_now_iso(), schedule_id),
            )
            conn.commit()
            return cursor.rowcount > 0
        except Exception as e:
            logger.error("日程删除失败", error=str(e))
            conn.rollback()
            raise
        finally:
            conn.close()

    # ==================== 待办管理 ====================

    async def create_todo(self, data: Dict[str, Any]) -> int:
        conn = self._get_connection()
        cursor = conn.cursor()

        try:
            now = _now_iso()
            tags_json = _json_dumps(data.get("tags", [])) if data.get("tags") else None
            cursor.execute(
                """
                INSERT INTO todos (
                    title, description, status, priority, due_date,
                    tags, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    data["title"],
                    data.get("description"),
                    data.get("status", "pending"),
                    data.get("priority", "normal"),
                    data.get("due_date"),
                    tags_json,
                    now,
                    now,
                ),
            )
            conn.commit()
            todo_id = int(cursor.lastrowid)
            logger.info("待办创建成功", todo_id=todo_id, title=data["title"])
            return todo_id
        except Exception as e:
            logger.error("待办创建失败", error=str(e))
            conn.rollback()
            raise
        finally:
            conn.close()

    async def get_todos(self, status: Optional[str] = None) -> List[Dict[str, Any]]:
        conn = self._get_connection()
        cursor = conn.cursor()

        try:
            query = "SELECT * FROM todos WHERE is_deleted = 0"
            params: List[Any] = []
            if status:
                query += " AND status = ?"
                params.append(status)
            query += " ORDER BY created_at DESC"
            cursor.execute(query, params)
            rows = cursor.fetchall()

            todos: List[Dict[str, Any]] = []
            for row in rows:
                todo = dict(row)
                todo["tags"] = _json_loads(todo.get("tags"), [])
                todos.append(todo)
            return todos
        except Exception as e:
            logger.error("获取待办失败", error=str(e))
            raise
        finally:
            conn.close()

    async def toggle_todo(self, todo_id: int) -> Dict[str, Any]:
        conn = self._get_connection()
        cursor = conn.cursor()

        try:
            cursor.execute("SELECT status FROM todos WHERE id = ?", (todo_id,))
            row = cursor.fetchone()
            if not row:
                raise ValueError(f"待办不存在: {todo_id}")

            current_status = row["status"]
            new_status = "done" if current_status == "pending" else "pending"
            completed_at = _now_iso() if new_status == "done" else None
            cursor.execute(
                """
                UPDATE todos SET status = ?, completed_at = ?, updated_at = ?
                WHERE id = ?
                """,
                (new_status, completed_at, _now_iso(), todo_id),
            )
            conn.commit()
            cursor.execute("SELECT * FROM todos WHERE id = ?", (todo_id,))
            todo = dict(cursor.fetchone())
            todo["tags"] = _json_loads(todo.get("tags"), [])
            return todo
        except Exception as e:
            logger.error("待办状态切换失败", error=str(e))
            conn.rollback()
            raise
        finally:
            conn.close()

    async def delete_todo(self, todo_id: int) -> bool:
        conn = self._get_connection()
        cursor = conn.cursor()

        try:
            cursor.execute(
                """
                UPDATE todos SET is_deleted = 1, updated_at = ?
                WHERE id = ?
                """,
                (_now_iso(), todo_id),
            )
            conn.commit()
            return cursor.rowcount > 0
        except Exception as e:
            logger.error("待办删除失败", error=str(e))
            conn.rollback()
            raise
        finally:
            conn.close()

    # ==================== 会话管理 ====================

    async def create_chat_session(
        self,
        model_key: str,
        title: str = "",
        persona_name: str = "",
        make_active: bool = True,
    ) -> Dict[str, Any]:
        conn = self._get_connection()
        cursor = conn.cursor()

        try:
            now = _now_iso()
            session_id = str(uuid.uuid4())
            final_title = title.strip() or f"新会话 {datetime.now().strftime('%m-%d %H:%M')}"
            cursor.execute(
                """
                INSERT INTO chat_sessions (
                    id, model_key, title, persona_name, created_at,
                    updated_at, last_active_at, is_archived
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)
                """,
                (session_id, model_key, final_title, persona_name, now, now, now),
            )
            if make_active:
                self._set_active_session_sync(cursor, model_key, session_id)
            conn.commit()
            return {
                "id": session_id,
                "model_key": model_key,
                "title": final_title,
                "persona_name": persona_name,
                "created_at": now,
                "updated_at": now,
                "last_active_at": now,
                "is_archived": False,
            }
        except Exception as e:
            logger.error("创建聊天会话失败", error=str(e), model_key=model_key)
            conn.rollback()
            raise
        finally:
            conn.close()

    def _set_active_session_sync(self, cursor: sqlite3.Cursor, model_key: str, session_id: str) -> None:
        cursor.execute(
            """
            INSERT INTO app_state (key, value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
            """,
            (f"active_session::{model_key}", session_id, _now_iso()),
        )

    async def set_active_session(self, model_key: str, session_id: str) -> None:
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            self._set_active_session_sync(cursor, model_key, session_id)
            cursor.execute(
                "UPDATE chat_sessions SET last_active_at = ?, updated_at = ? WHERE id = ?",
                (_now_iso(), _now_iso(), session_id),
            )
            conn.commit()
        except Exception as e:
            logger.error("设置当前会话失败", error=str(e), model_key=model_key, session_id=session_id)
            conn.rollback()
            raise
        finally:
            conn.close()

    async def get_active_session(self, model_key: str, auto_create: bool = True) -> Optional[Dict[str, Any]]:
        conn = self._get_connection()
        cursor = conn.cursor()

        try:
            cursor.execute("SELECT value FROM app_state WHERE key = ?", (f"active_session::{model_key}",))
            row = cursor.fetchone()
            if row:
                session = await self.get_chat_session(str(row["value"]))
                if session and session["model_key"] == model_key:
                    return session

            cursor.execute(
                """
                SELECT * FROM chat_sessions
                WHERE model_key = ? AND is_archived = 0
                ORDER BY last_active_at DESC, updated_at DESC
                LIMIT 1
                """,
                (model_key,),
            )
            existing = cursor.fetchone()
            if existing:
                session = self._map_session_row(existing)
                self._set_active_session_sync(cursor, model_key, session["id"])
                conn.commit()
                return session

            if not auto_create:
                return None
            conn.commit()
        finally:
            conn.close()

        return await self.create_chat_session(model_key=model_key, make_active=True)

    async def get_chat_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("SELECT * FROM chat_sessions WHERE id = ?", (session_id,))
            row = cursor.fetchone()
            return self._map_session_row(row) if row else None
        finally:
            conn.close()

    def _map_session_row(self, row: sqlite3.Row) -> Dict[str, Any]:
        return {
            "id": row["id"],
            "model_key": row["model_key"],
            "title": row["title"],
            "persona_name": row["persona_name"],
            "created_at": row["created_at"],
            "updated_at": row["updated_at"],
            "last_active_at": row["last_active_at"],
            "is_archived": bool(row["is_archived"]),
        }

    async def update_chat_session_title(self, session_id: str, title: str) -> None:
        final_title = title.strip()
        if not final_title:
            return
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute(
                "UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ?",
                (final_title[:80], _now_iso(), session_id),
            )
            conn.commit()
        except Exception as e:
            logger.error("更新会话标题失败", error=str(e), session_id=session_id)
            conn.rollback()
            raise
        finally:
            conn.close()

    async def list_chat_sessions(self, model_key: Optional[str] = None, limit: int = 40) -> List[Dict[str, Any]]:
        conn = self._get_connection()
        cursor = conn.cursor()

        try:
            params: List[Any] = []
            query = """
                SELECT
                    s.*,
                    (
                        SELECT COUNT(1)
                        FROM chat_messages m
                        WHERE m.session_id = s.id
                    ) AS message_count,
                    (
                        SELECT content
                        FROM chat_messages m
                        WHERE m.session_id = s.id
                        ORDER BY m.id DESC
                        LIMIT 1
                    ) AS last_message
                FROM chat_sessions s
                WHERE s.is_archived = 0
            """
            if model_key:
                query += " AND s.model_key = ?"
                params.append(model_key)
            query += " ORDER BY s.last_active_at DESC, s.updated_at DESC LIMIT ?"
            params.append(limit)
            cursor.execute(query, params)
            rows = cursor.fetchall()

            sessions: List[Dict[str, Any]] = []
            for row in rows:
                item = self._map_session_row(row)
                item["message_count"] = int(row["message_count"] or 0)
                item["last_message"] = str(row["last_message"] or "")
                sessions.append(item)
            return sessions
        finally:
            conn.close()

    async def maybe_autoname_session(self, session_id: str, user_message: str) -> None:
        session = await self.get_chat_session(session_id)
        if not session:
            return
        title = str(session["title"] or "")
        if not title.startswith("新会话"):
            return
        clean = " ".join(user_message.strip().split())
        if not clean:
            return
        if len(clean) > 18:
            clean = clean[:18].rstrip() + "..."
        await self.update_chat_session_title(session_id, clean)

    # ==================== 聊天历史 ====================

    async def save_chat_message(
        self,
        role: str,
        content: str,
        session_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        conn = self._get_connection()
        cursor = conn.cursor()

        try:
            now = _now_iso()
            cursor.execute(
                """
                INSERT INTO pet_chat_history (role, content, timestamp)
                VALUES (?, ?, ?)
                """,
                (role, content, now),
            )

            message_id = int(cursor.lastrowid)
            if session_id:
                cursor.execute(
                    """
                    INSERT INTO chat_messages (session_id, role, content, timestamp, metadata)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (session_id, role, content, now, _json_dumps(metadata or {})),
                )
                message_id = int(cursor.lastrowid)
                cursor.execute(
                    """
                    UPDATE chat_sessions
                    SET updated_at = ?, last_active_at = ?
                    WHERE id = ?
                    """,
                    (now, now, session_id),
                )
            conn.commit()
            return {
                "id": message_id,
                "session_id": session_id,
                "role": role,
                "content": content,
                "timestamp": now,
                "metadata": metadata or {},
            }
        except Exception as e:
            logger.error("保存聊天消息失败", error=str(e), role=role, session_id=session_id)
            conn.rollback()
            raise
        finally:
            conn.close()

    async def get_session_messages(self, session_id: str, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        conn = self._get_connection()
        cursor = conn.cursor()

        try:
            query = """
                SELECT id, session_id, role, content, timestamp, metadata
                FROM chat_messages
                WHERE session_id = ?
                ORDER BY id ASC
            """
            params: List[Any] = [session_id]
            if limit:
                query = """
                    SELECT * FROM (
                        SELECT id, session_id, role, content, timestamp, metadata
                        FROM chat_messages
                        WHERE session_id = ?
                        ORDER BY id DESC
                        LIMIT ?
                    ) ORDER BY id ASC
                """
                params = [session_id, limit]
            cursor.execute(query, params)
            rows = cursor.fetchall()
            return [
                {
                    "id": int(row["id"]),
                    "session_id": row["session_id"],
                    "role": row["role"],
                    "content": row["content"],
                    "timestamp": row["timestamp"],
                    "metadata": _json_loads(row["metadata"], {}),
                }
                for row in rows
            ]
        finally:
            conn.close()

    async def get_session_messages_after_id(
        self,
        session_id: str,
        after_id: int = 0,
    ) -> List[Dict[str, Any]]:
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute(
                """
                SELECT id, session_id, role, content, timestamp, metadata
                FROM chat_messages
                WHERE session_id = ? AND id > ?
                ORDER BY id ASC
                """,
                (session_id, int(after_id)),
            )
            rows = cursor.fetchall()
            return [
                {
                    "id": int(row["id"]),
                    "session_id": row["session_id"],
                    "role": row["role"],
                    "content": row["content"],
                    "timestamp": row["timestamp"],
                    "metadata": _json_loads(row["metadata"], {}),
                }
                for row in rows
            ]
        finally:
            conn.close()

    async def count_session_messages(self, session_id: str, role: Optional[str] = None) -> int:
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            if role:
                cursor.execute(
                    "SELECT COUNT(1) AS total FROM chat_messages WHERE session_id = ? AND role = ?",
                    (session_id, role),
                )
            else:
                cursor.execute(
                    "SELECT COUNT(1) AS total FROM chat_messages WHERE session_id = ?",
                    (session_id,),
                )
            row = cursor.fetchone()
            return int(row["total"]) if row and row["total"] is not None else 0
        finally:
            conn.close()

    async def get_recent_chat_history(
        self,
        limit: int = 10,
        session_id: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        if session_id:
            return await self.get_session_messages(session_id=session_id, limit=limit)

        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute(
                """
                SELECT role, content, timestamp
                FROM pet_chat_history
                ORDER BY id DESC
                LIMIT ?
                """,
                (limit,),
            )
            rows = cursor.fetchall()
            return [dict(row) for row in reversed(rows)]
        finally:
            conn.close()

    async def clear_old_chat_history(self, keep_days: int = 30):
        conn = self._get_connection()
        cursor = conn.cursor()

        try:
            cutoff = (datetime.now() - timedelta(days=keep_days)).isoformat()
            cursor.execute("DELETE FROM pet_chat_history WHERE timestamp < ?", (cutoff,))
            cursor.execute("DELETE FROM chat_messages WHERE timestamp < ?", (cutoff,))
            conn.commit()
        except Exception as e:
            logger.error("清理聊天历史失败", error=str(e))
            conn.rollback()
            raise
        finally:
            conn.close()

    # ==================== 长期记忆 ====================

    async def upsert_memory_entry(
        self,
        session_id: str,
        model_key: str,
        source: str,
        content: str,
        summary: str,
        tags: Optional[List[str]],
        keywords: Optional[List[str]],
        embedding: List[float],
        importance: float,
        event_key: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        conn = self._get_connection()
        cursor = conn.cursor()

        try:
            now = _now_iso()
            if event_key:
                cursor.execute(
                    """
                    SELECT id FROM long_term_memories
                    WHERE session_id = ? AND event_key = ?
                    """,
                    (session_id, event_key),
                )
                row = cursor.fetchone()
                if row:
                    cursor.execute(
                        """
                        UPDATE long_term_memories
                        SET content = ?, summary = ?, tags = ?, keywords = ?, embedding = ?,
                            importance = ?, metadata = ?, updated_at = ?
                        WHERE id = ?
                        """,
                        (
                            content,
                            summary,
                            _json_dumps(tags or []),
                            _json_dumps(keywords or []),
                            _json_dumps(embedding),
                            float(importance),
                            _json_dumps(metadata or {}),
                            now,
                            int(row["id"]),
                        ),
                    )
                    conn.commit()
                    return {
                        "id": int(row["id"]),
                        "session_id": session_id,
                        "model_key": model_key,
                        "summary": summary,
                    }

            cursor.execute(
                """
                INSERT INTO long_term_memories (
                    session_id, model_key, source, content, summary, tags,
                    keywords, embedding, importance, event_key, metadata,
                    created_at, updated_at, last_accessed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    session_id,
                    model_key,
                    source,
                    content,
                    summary,
                    _json_dumps(tags or []),
                    _json_dumps(keywords or []),
                    _json_dumps(embedding),
                    float(importance),
                    event_key,
                    _json_dumps(metadata or {}),
                    now,
                    now,
                    now,
                ),
            )
            conn.commit()
            return {
                "id": int(cursor.lastrowid),
                "session_id": session_id,
                "model_key": model_key,
                "summary": summary,
            }
        except Exception as e:
            logger.error("保存长期记忆失败", error=str(e), session_id=session_id, model_key=model_key)
            conn.rollback()
            raise
        finally:
            conn.close()

    async def list_memory_entries(
        self,
        model_key: str,
        session_id: Optional[str] = None,
        include_all_sessions: bool = False,
        limit: int = 120,
    ) -> List[Dict[str, Any]]:
        conn = self._get_connection()
        cursor = conn.cursor()

        try:
            query = """
                SELECT *
                FROM long_term_memories
                WHERE model_key = ?
            """
            params: List[Any] = [model_key]
            if session_id and not include_all_sessions:
                query += " AND session_id = ?"
                params.append(session_id)
            query += " ORDER BY updated_at DESC LIMIT ?"
            params.append(limit)
            cursor.execute(query, params)
            rows = cursor.fetchall()
            return [
                {
                    "id": int(row["id"]),
                    "session_id": row["session_id"],
                    "model_key": row["model_key"],
                    "source": row["source"],
                    "content": row["content"],
                    "summary": row["summary"],
                    "tags": _json_loads(row["tags"], []),
                    "keywords": _json_loads(row["keywords"], []),
                    "embedding": _json_loads(row["embedding"], []),
                    "importance": float(row["importance"] or 0.5),
                    "event_key": row["event_key"],
                    "metadata": _json_loads(row["metadata"], {}),
                    "created_at": row["created_at"],
                    "updated_at": row["updated_at"],
                    "last_accessed_at": row["last_accessed_at"],
                }
                for row in rows
            ]
        finally:
            conn.close()

    async def touch_memory_entries(self, memory_ids: List[int]) -> None:
        if not memory_ids:
            return
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            now = _now_iso()
            placeholders = ",".join("?" for _ in memory_ids)
            cursor.execute(
                f"UPDATE long_term_memories SET last_accessed_at = ? WHERE id IN ({placeholders})",
                [now, *memory_ids],
            )
            conn.commit()
        except Exception as e:
            logger.error("更新记忆访问时间失败", error=str(e), memory_ids=memory_ids)
            conn.rollback()
            raise
        finally:
            conn.close()

    # ==================== 用户映像 ====================

    async def get_impression_profile(self, scope_key: str) -> Optional[Dict[str, Any]]:
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("SELECT * FROM user_impressions WHERE scope_key = ?", (scope_key,))
            row = cursor.fetchone()
            if not row:
                return None
            return {
                "scope_key": row["scope_key"],
                "model_key": row["model_key"],
                "session_id": row["session_id"],
                "summary": row["summary"],
                "facets": _json_loads(row["facets"], {}),
                "token_estimate": int(row["token_estimate"] or 0),
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
            }
        finally:
            conn.close()

    async def upsert_impression_profile(
        self,
        scope_key: str,
        model_key: str,
        session_id: Optional[str],
        summary: str,
        facets: Dict[str, List[str]],
        token_estimate: int,
    ) -> Dict[str, Any]:
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            now = _now_iso()
            cursor.execute(
                """
                INSERT INTO user_impressions (
                    scope_key, model_key, session_id, summary, facets,
                    token_estimate, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(scope_key) DO UPDATE SET
                    model_key=excluded.model_key,
                    session_id=excluded.session_id,
                    summary=excluded.summary,
                    facets=excluded.facets,
                    token_estimate=excluded.token_estimate,
                    updated_at=excluded.updated_at
                """,
                (
                    scope_key,
                    model_key,
                    session_id,
                    summary,
                    _json_dumps(facets),
                    int(token_estimate),
                    now,
                    now,
                ),
            )
            conn.commit()
            return {
                "scope_key": scope_key,
                "model_key": model_key,
                "session_id": session_id,
                "summary": summary,
                "facets": facets,
                "token_estimate": token_estimate,
                "updated_at": now,
            }
        except Exception as e:
            logger.error("保存用户映像失败", error=str(e), scope_key=scope_key)
            conn.rollback()
            raise
        finally:
            conn.close()

    # ==================== 应用状态 ====================

    async def get_app_state(self, key: str) -> Optional[str]:
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("SELECT value FROM app_state WHERE key = ?", (key,))
            row = cursor.fetchone()
            return str(row["value"]) if row and row["value"] is not None else None
        finally:
            conn.close()

    async def set_app_state(self, key: str, value: Any) -> None:
        conn = self._get_connection()
        cursor = conn.cursor()
        try:
            now = _now_iso()
            cursor.execute(
                """
                INSERT INTO app_state (key, value, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET
                    value=excluded.value,
                    updated_at=excluded.updated_at
                """,
                (key, _json_dumps(value) if not isinstance(value, str) else value, now),
            )
            conn.commit()
        except Exception as e:
            logger.error("保存应用状态失败", error=str(e), key=key)
            conn.rollback()
            raise
        finally:
            conn.close()
