"""Windows notification utilities."""
from __future__ import annotations

import ctypes
import logging
import sys
import threading
from pathlib import Path
from typing import Optional

import structlog

from src.core.p_config import p_config_manager

# Windows FlashWindowEx constants
FLASHW_STOP = 0
FLASHW_CAPTION = 1
FLASHW_TRAY = 2
FLASHW_ALL = 3
FLASHW_TIMER = 4
FLASHW_TIMERNOFG = 12


class FLASHWINFO(ctypes.Structure):
    _fields_ = [
        ("cbSize", ctypes.c_uint),
        ("hwnd", ctypes.c_void_p),
        ("dwFlags", ctypes.c_uint),
        ("uCount", ctypes.c_uint),
        ("dwTimeout", ctypes.c_uint),
    ]

try:
    from winotify import Notification, audio  # type: ignore
    WINOTIFY_AVAILABLE = True
except ImportError:  # pragma: no cover - optional dependency
    Notification = None  # type: ignore
    WINOTIFY_AVAILABLE = False

logger = structlog.get_logger(__name__)


class WindowsNotifier:
    """Helper class to send notifications to Windows Action Center."""

    def __init__(self, icon_filename: str = "output.ico") -> None:
        self.icon_path = self._resolve_icon(icon_filename)
        self._lock = threading.Lock()
        self._warned_unavailable = False

    @staticmethod
    def _resolve_icon(icon_filename: str) -> Path:
        base_dir = Path(getattr(sys, "_MEIPASS", Path(__file__).parent.parent.parent))
        return base_dir / icon_filename

    def is_available(self) -> bool:
        return sys.platform.startswith("win") and WINOTIFY_AVAILABLE

    def _flash_taskbar(self) -> None:
        """Flash the console window in the taskbar."""
        if not sys.platform.startswith("win"):
            return

        try:
            # 获取控制台窗口句柄
            hwnd = ctypes.windll.kernel32.GetConsoleWindow()
            if not hwnd:
                return

            fwi = FLASHWINFO()
            fwi.cbSize = ctypes.sizeof(FLASHWINFO)
            fwi.hwnd = hwnd
            # FLASHW_ALL | FLASHW_TIMERNOFG: 闪烁标题栏和任务栏，直到窗口被激活
            fwi.dwFlags = FLASHW_ALL | FLASHW_TIMERNOFG
            fwi.uCount = 0
            fwi.dwTimeout = 0

            ctypes.windll.user32.FlashWindowEx(ctypes.byref(fwi))
        except Exception as e:
            logger.debug("Failed to flash taskbar", error=str(e))

    def is_enabled(self) -> bool:
        enabled = p_config_manager.get("notifications.windows_center_enabled", False)
        if not enabled:
            return False
        if not self.is_available():
            if not self._warned_unavailable:
                logger.warning(
                    "已开启Windows通知，但缺少 winotify 依赖或不在Windows环境。"
                )
                self._warned_unavailable = True
            return False
        return True

    def send(self, title: str, message: str, duration: int = 5) -> bool:
        """Send a notification if enabled."""
        if not self.is_enabled():
            logger.info("Windows通知未启用，跳过发送", title=title)
            return False
        
        if not WINOTIFY_AVAILABLE:
            return False
            
        icon = str(self.icon_path) if self.icon_path.exists() else None
        message_preview = message if len(message) <= 120 else f"{message[:117]}..."
        logger.info("尝试发送Windows通知", title=title, has_icon=bool(icon), message_preview=message_preview)

        try:
            # 创建通知对象，如果有图标则传入
            notification_args = {
                "app_id": "MaiCore-Start",
                "title": title,
                "msg": message,
                "duration": "short" if duration <= 5 else "long"
            }
            if icon:
                notification_args["icon"] = icon
            
            toast = Notification(**notification_args)
            toast.set_audio(audio.Default, loop=False)
            toast.show()
            self._flash_taskbar()
            logger.info("Windows通知发送成功", title=title)
            return True
        except Exception as exc:
            logger.error("Windows通知发送失败", error=str(exc), title=title)
            if not self._warned_unavailable:
                logger.warning("Windows通知发送失败，请检查系统通知设置或相关依赖。")
                self._warned_unavailable = True
            return False


class NotificationLogHandler(logging.Handler):
    """Logging handler that forwards high-severity records to Windows notifications."""

    def __init__(self, notifier: WindowsNotifier, title: str = "部署告警") -> None:
        super().__init__(level=logging.WARNING)
        self.notifier = notifier
        self.title = title

    def emit(self, record: logging.LogRecord) -> None:  # pragma: no cover - side effect
        if not self.notifier.is_enabled():
            return
        try:
            # 尝试提取纯文本消息，而不是格式化后的完整日志
            msg = self._extract_pure_message(record)
            self.notifier.send(self.title, msg)
        except Exception as exc:
            logger.warning("日志通知发送失败", error=str(exc))
    
    def _extract_pure_message(self, record: logging.LogRecord) -> str:
        """
        从日志记录中提取纯文本消息
        """
        # 尝试从消息中提取纯文本
        msg = record.getMessage()
        
        # 如果消息是JSON格式，尝试解析并提取事件
        if msg.startswith('{') and msg.endswith('}'):
            try:
                import json
                data = json.loads(msg)
                if 'event' in data:
                    return str(data['event'])
            except:
                pass
        
        # 否则返回原始消息
        return msg


windows_notifier = WindowsNotifier()
