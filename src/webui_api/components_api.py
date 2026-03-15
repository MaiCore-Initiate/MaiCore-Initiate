# -*- coding: utf-8 -*-
"""
组件下载API
提供组件列表、下载、状态查询等功能
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import structlog
import uuid
import threading
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/components", tags=["components"])


class ComponentInfo(BaseModel):
    """组件信息模型"""
    key: str
    name: str
    description: str
    icon: str
    status: str = "available"
    version: Optional[str] = None
    download_url: Optional[str] = None
    installed: Optional[bool] = None
    message: Optional[str] = None


class DownloadRequest(BaseModel):
    """下载请求模型"""
    component_key: str
    install_path: Optional[str] = None  # SQLiteStudio等绿色软件的安装目录


class DownloadTaskResponse(BaseModel):
    """下载任务创建响应"""
    task_id: str
    component_key: str


# 任务存储（简单内存实现）
_download_tasks: Dict[str, Dict[str, Any]] = {}
_task_lock = threading.Lock()
_executor = ThreadPoolExecutor(max_workers=3)

CANCELLED_STATUS = {"status": "canceled", "phase": "canceled"}


def _now() -> str:
    return datetime.now().isoformat()


def _create_task(component_key: str) -> str:
    task_id = uuid.uuid4().hex
    with _task_lock:
        _download_tasks[task_id] = {
            "task_id": task_id,
            "component_key": component_key,
            "status": "pending",
            "phase": "pending",
            "percent": 0,
            "message": "等待开始",
            "bytes_downloaded": 0,
            "total_bytes": None,
            "filename": None,
            "started_at": _now(),
            "finished_at": None,
            "error": None,
        }
    return task_id


def _update_task(task_id: str, **fields):
    with _task_lock:
        if task_id not in _download_tasks:
            return
        _download_tasks[task_id].update(fields)


def _get_task(task_id: str) -> Optional[Dict[str, Any]]:
    with _task_lock:
        return _download_tasks.get(task_id)


def _is_canceled(task_id: str) -> bool:
    task = _get_task(task_id)
    return bool(task and task.get("status") == "canceled")


def get_component_manager():
    """获取组件管理器实例"""
    try:
        from src.modules.component_download.component_manager import component_manager
        return component_manager
    except ImportError as e:
        logger.error("导入组件管理器失败", error=str(e))
        raise HTTPException(status_code=500, detail=f"组件管理器不可用: {str(e)}")


def _get_component_runtime_info(manager, component_key: str) -> Dict[str, Any]:
    """读取下载器暴露的动态组件信息"""
    try:
        downloader = getattr(manager, "downloaders", {}).get(component_key)
        if downloader and hasattr(downloader, "get_download_info"):
            info = downloader.get_download_info()
            if isinstance(info, dict):
                return info
    except Exception as e:
        logger.warning("读取组件动态信息失败", component_key=component_key, error=str(e))
    return {}


@router.get("/list", response_model=List[ComponentInfo], summary="获取组件列表")
def get_components_list():
    """获取所有可用的组件列表"""
    try:
        manager = get_component_manager()
        components = []

        for key in manager.list_available_components():
            info = manager.get_component_info(key)
            if info:
                status_info = manager.check_component_status(key)
                runtime_info = _get_component_runtime_info(manager, key)
                components.append(ComponentInfo(
                    key=key,
                    name=info['name'],
                    description=info['description'],
                    icon=info['icon'],
                    status=status_info.get('status', 'unknown'),
                    version=runtime_info.get('version'),
                    download_url=runtime_info.get('download_url'),
                    installed=runtime_info.get('installed'),
                    message=status_info.get('message', '')
                ))

        return components
    except Exception as e:
        logger.error("获取组件列表失败", error=str(e))
        raise HTTPException(status_code=500, detail=f"获取组件列表失败: {str(e)}")


@router.get("/{component_key}/status", summary="获取组件状态")
def get_component_status(component_key: str):
    """获取指定组件的状态信息"""
    try:
        manager = get_component_manager()
        status_info = manager.check_component_status(component_key)

        if status_info['status'] == 'unknown':
            raise HTTPException(status_code=404, detail="组件不存在")

        return status_info
    except HTTPException:
        raise
    except Exception as e:
        logger.error("获取组件状态失败", error=str(e), component_key=component_key)
        raise HTTPException(status_code=500, detail=f"获取组件状态失败: {str(e)}")


def _normalize_progress(update: Dict[str, Any]) -> Dict[str, Any]:
    data = update.copy()
    # clamp percent
    if 'percent' in data and data['percent'] is not None:
        try:
            data['percent'] = max(0, min(100, int(data['percent'])))
        except Exception:
            data['percent'] = 0
    # default status
    status = data.get('status')
    phase = data.get('phase')
    if not status:
        if phase in ('failed', 'error'):
            status = 'failed'
        elif phase == 'done':
            status = 'done'
        elif phase == 'canceled':
            status = 'canceled'
        else:
            status = 'running'
    data['status'] = status
    # default phase
    if not phase:
        data['phase'] = 'downloading'
    return data


def _progress_callback_factory(task_id: str):
    def _cb(update: Dict[str, Any]):
        if _is_canceled(task_id):
            _update_task(task_id, **CANCELLED_STATUS, message="已取消", finished_at=_now())
            return
        data = _normalize_progress(update)
        _update_task(task_id, **data)
    return _cb


def _run_download_task(task_id: str, component_key: str, install_path: Optional[str] = None):
    manager = get_component_manager()
    info = manager.get_component_info(component_key) or {"name": component_key}
    progress_cb = _progress_callback_factory(task_id)

    try:
        # 检查是否已取消
        if _is_canceled(task_id):
            _update_task(task_id, **CANCELLED_STATUS, message="已取消", finished_at=_now())
            logger.info("任务已取消", task_id=task_id)
            return

        _update_task(task_id, status="running", phase="preparing", message="准备中", percent=5)
        logger.info("开始后台下载组件", component_key=component_key, task_id=task_id, install_path=install_path)

        success = manager.download_component(
            component_key,
            non_interactive=True,
            task_id=task_id,
            progress_cb=progress_cb,
            install_path=install_path
        )

        # 再次检查是否已取消
        if _is_canceled(task_id):
            _update_task(task_id, **CANCELLED_STATUS, message="已取消", finished_at=_now())
            logger.info("任务已取消", task_id=task_id)
            return

        if success:
            _update_task(
                task_id,
                status="done",
                phase="done",
                percent=100,
                message=f"{info.get('name', component_key)} 下载成功",
                finished_at=_now()
            )
            logger.info("组件下载成功", component_key=component_key, task_id=task_id)
        else:
            _update_task(
                task_id,
                status="failed",
                phase="failed",
                message=f"{info.get('name', component_key)} 下载失败",
                finished_at=_now()
            )
            logger.warning("组件下载失败", component_key=component_key, task_id=task_id)
    except Exception as e:
        _update_task(
            task_id,
            status="failed",
            phase="failed",
            message=f"下载异常: {str(e)}",
            error=str(e),
            finished_at=_now()
        )
        logger.error("下载组件异常", error=str(e), component_key=component_key, task_id=task_id)


@router.post("/download", response_model=DownloadTaskResponse, summary="下载组件（返回任务ID）")
def download_component(request: DownloadRequest):
    """
    下载指定的组件（异步执行）
    返回 task_id，前端可轮询进度
    """
    try:
        manager = get_component_manager()
        component_key = request.component_key
        install_path = request.install_path

        # 检查组件是否存在
        info = manager.get_component_info(component_key)
        if not info:
            raise HTTPException(status_code=404, detail="组件不存在")

        # 创建任务
        task_id = _create_task(component_key)

        # 启动后台线程执行下载
        _executor.submit(_run_download_task, task_id, component_key, install_path)

        return DownloadTaskResponse(task_id=task_id, component_key=component_key)

    except HTTPException:
        raise
    except Exception as e:
        logger.error("下载组件异常", error=str(e), component_key=request.component_key)
        raise HTTPException(status_code=500, detail=f"下载组件失败: {str(e)}")


@router.get("/progress/{task_id}", summary="查询下载进度")
def get_download_progress(task_id: str):
    task = _get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    return task


@router.post("/cancel/{task_id}", summary="取消下载任务")
def cancel_download_task(task_id: str):
    """取消正在进行的下载任务"""
    task = _get_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    current_status = task.get("status")
    if current_status in ("done", "failed", "canceled"):
        return {"message": "任务已结束，无法取消", "task": task}

    _update_task(task_id, status="canceled", phase="canceled", message="用户取消", finished_at=_now())
    logger.info("用户取消下载任务", task_id=task_id)

    updated_task = _get_task(task_id)
    return {"message": "任务已取消", "task": updated_task}


@router.post("/cleanup", summary="清理临时安装包")
def cleanup_installers():
    """清理临时文件夹中的所有安装包"""
    try:
        from src.modules.component_download.component_manager import component_manager
        temp_dir = component_manager.get_temporary_directory()

        if not temp_dir.exists():
            return {"message": "临时目录不存在，无需清理", "path": str(temp_dir)}

        import shutil
        deleted_count = 0
        errors = []

        for item in temp_dir.iterdir():
            try:
                if item.is_file():
                    item.unlink()
                    deleted_count += 1
                elif item.is_dir():
                    shutil.rmtree(item)
                    deleted_count += 1
            except Exception as e:
                errors.append(f"{item.name}: {str(e)}")

        logger.info("清理临时安装包", deleted_count=deleted_count, errors=errors)

        if errors:
            return {
                "message": f"已清理 {deleted_count} 个文件/目录，{len(errors)} 个失败",
                "deleted_count": deleted_count,
                "errors": errors,
                "path": str(temp_dir)
            }
        else:
            return {
                "message": f"已清理 {deleted_count} 个文件/目录",
                "deleted_count": deleted_count,
                "path": str(temp_dir)
            }

    except Exception as e:
        logger.error("清理临时安装包失败", error=str(e))
        raise HTTPException(status_code=500, detail=f"清理失败: {str(e)}")


@router.get("/{component_key}/info", summary="获取组件详细信息")
def get_component_info_detail(component_key: str):
    """获取指定组件的详细信息"""
    try:
        manager = get_component_manager()
        info = manager.get_component_info(component_key)

        if not info:
            raise HTTPException(status_code=404, detail="组件不存在")

        status_info = manager.check_component_status(component_key)
        runtime_info = _get_component_runtime_info(manager, component_key)

        return {
            "key": component_key,
            "name": info['name'],
            "description": info['description'],
            "icon": info['icon'],
            "status": status_info.get('status', 'unknown'),
            "message": status_info.get('message', ''),
            "version": runtime_info.get('version'),
            "download_url": runtime_info.get('download_url'),
            "installed": runtime_info.get('installed'),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("获取组件信息失败", error=str(e), component_key=component_key)
        raise HTTPException(status_code=500, detail=f"获取组件信息失败: {str(e)}")
