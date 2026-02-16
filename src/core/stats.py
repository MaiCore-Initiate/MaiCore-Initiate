# -*- coding: utf-8 -*-
"""
统计数据收集模块
使用 SQLite 记录实例启动/停止/错误事件，提供聚合查询。
"""
import os
import sqlite3
import threading
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import structlog

logger = structlog.get_logger(__name__)

DB_PATH = "data/stats.db"

_CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS instance_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    instance_id TEXT NOT NULL,
    event_type  TEXT NOT NULL,
    component   TEXT NOT NULL,
    timestamp   TEXT NOT NULL,
    duration_s  REAL DEFAULT NULL,
    detail      TEXT DEFAULT NULL
);
"""

# strftime 格式映射
_GRANULARITY_FMT = {
    "hour": "%Y-%m-%dT%H:00:00",
    "day": "%Y-%m-%d",
    "week": "%Y-W%W",
    "month": "%Y-%m",
}


class StatsDB:
    """线程安全的 SQLite 统计数据库。"""

    def __init__(self, db_path: str = DB_PATH):
        self._db_path = db_path
        self._local = threading.local()
        os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)
        # 在主线程初始化表
        self._get_conn().execute(_CREATE_TABLE_SQL)
        self._get_conn().commit()

    def _get_conn(self) -> sqlite3.Connection:
        conn = getattr(self._local, "conn", None)
        if conn is None:
            conn = sqlite3.connect(self._db_path)
            conn.row_factory = sqlite3.Row
            conn.execute(_CREATE_TABLE_SQL)
            self._local.conn = conn
        return conn

    def record_event(
        self,
        instance_id: str,
        event_type: str,
        component: str,
        duration_s: Optional[float] = None,
        detail: Optional[str] = None,
    ) -> None:
        try:
            conn = self._get_conn()
            conn.execute(
                "INSERT INTO instance_events (instance_id, event_type, component, timestamp, duration_s, detail) VALUES (?, ?, ?, ?, ?, ?)",
                (instance_id, event_type, component, datetime.now(timezone.utc).isoformat(), duration_s, detail),
            )
            conn.commit()
        except Exception as e:
            logger.warning("统计事件写入失败", error=str(e))

    def get_summary(self, instance_id: Optional[str] = None) -> Dict[str, Any]:
        conn = self._get_conn()
        where = "WHERE instance_id = ?" if instance_id else ""
        params: tuple = (instance_id,) if instance_id else ()
        row = conn.execute(
            f"SELECT COALESCE(SUM(CASE WHEN event_type='start' THEN 1 ELSE 0 END), 0) AS launch_count, "
            f"COALESCE(SUM(CASE WHEN event_type='stop' THEN duration_s ELSE 0 END), 0) AS stopped_uptime_s, "
            f"COALESCE(SUM(CASE WHEN event_type='error' THEN 1 ELSE 0 END), 0) AS error_count "
            f"FROM instance_events {where}",
            params,
        ).fetchone()
        stopped_uptime = row["stopped_uptime_s"] if row else 0
        launch_count = row["launch_count"] if row else 0
        error_count = row["error_count"] if row else 0

        # 计算仍在运行的实例的实时时长
        live_uptime = self._calc_live_uptime(instance_id)

        return {"launch_count": launch_count, "total_uptime_s": round(stopped_uptime + live_uptime, 1), "error_count": error_count}

    def _calc_live_uptime(self, instance_id: Optional[str] = None) -> float:
        """计算还在运行中（有 start 但没有对应 stop）的实例的累计时长"""
        conn = self._get_conn()
        where = "WHERE instance_id = ?" if instance_id else ""
        params: tuple = (instance_id,) if instance_id else ()
        # 找出每个 (instance_id, component) 最后一个事件，如果是 start 则说明还在运行
        rows = conn.execute(
            f"SELECT instance_id, component, event_type, timestamp FROM instance_events "
            f"{where} ORDER BY id DESC",
            params,
        ).fetchall()
        now = datetime.now(timezone.utc)
        seen: set = set()
        total = 0.0
        for r in rows:
            key = (r["instance_id"], r["component"])
            if key in seen:
                continue
            seen.add(key)
            if r["event_type"] == "start":
                try:
                    start_time = datetime.fromisoformat(r["timestamp"])
                    total += (now - start_time).total_seconds()
                except Exception:
                    pass
        return total

    def get_timeline(
        self, granularity: str = "day", instance_id: Optional[str] = None, limit: int = 30
    ) -> List[Dict[str, Any]]:
        fmt = _GRANULARITY_FMT.get(granularity, _GRANULARITY_FMT["day"])
        conn = self._get_conn()
        conditions = []
        params: list = []
        if instance_id:
            conditions.append("instance_id = ?")
            params.append(instance_id)
        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
        rows = conn.execute(
            f"SELECT strftime('{fmt}', timestamp) AS period, "
            f"SUM(CASE WHEN event_type='start' THEN 1 ELSE 0 END) AS starts, "
            f"SUM(CASE WHEN event_type='stop' THEN 1 ELSE 0 END) AS stops, "
            f"SUM(CASE WHEN event_type='error' THEN 1 ELSE 0 END) AS errors, "
            f"COALESCE(SUM(CASE WHEN event_type='stop' THEN duration_s ELSE 0 END), 0) AS uptime_s "
            f"FROM instance_events {where} "
            f"GROUP BY period ORDER BY period DESC LIMIT ?",
            params + [limit],
        ).fetchall()
        result = [dict(r) for r in rows]

        # 将正在运行的实例时长加到当前时间段
        live = self._calc_live_uptime(instance_id)
        if live > 0 and result:
            now_period = datetime.now(timezone.utc).strftime(fmt)
            for item in result:
                if item["period"] == now_period:
                    item["uptime_s"] = round(item["uptime_s"] + live, 1)
                    break
            else:
                # 当前时间段不在结果中，插入一条
                result.insert(0, {"period": now_period, "starts": 0, "stops": 0, "errors": 0, "uptime_s": round(live, 1)})

        return result

    def get_instance_ids(self) -> List[str]:
        conn = self._get_conn()
        rows = conn.execute("SELECT DISTINCT instance_id FROM instance_events ORDER BY instance_id").fetchall()
        return [r["instance_id"] for r in rows]

    def get_recent_events(self, limit: int = 50, instance_id: Optional[str] = None) -> List[Dict[str, Any]]:
        conn = self._get_conn()
        if instance_id:
            rows = conn.execute(
                "SELECT * FROM instance_events WHERE instance_id = ? ORDER BY id DESC LIMIT ?",
                (instance_id, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM instance_events ORDER BY id DESC LIMIT ?", (limit,)
            ).fetchall()
        return [dict(r) for r in rows]


stats_db = StatsDB()
