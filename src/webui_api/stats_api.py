# -*- coding: utf-8 -*-
"""
统计数据API模块
提供仪表盘所需的统计查询接口
"""
from typing import Optional
from fastapi import APIRouter

from ..core.stats import stats_db

router = APIRouter()


@router.get("/summary")
def get_summary(instance_id: Optional[str] = None):
    return stats_db.get_summary(instance_id)


@router.get("/timeline")
def get_timeline(granularity: str = "day", instance_id: Optional[str] = None, limit: int = 30):
    return stats_db.get_timeline(granularity, instance_id, limit)


@router.get("/events")
def get_recent_events(instance_id: Optional[str] = None, limit: int = 50):
    return stats_db.get_recent_events(limit, instance_id)


@router.get("/instances")
def get_instance_ids():
    return stats_db.get_instance_ids()
