# -*- coding: utf-8 -*-
"""独立桌宠悬浮窗口进程。"""
from __future__ import annotations

import argparse
import json
import sys
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path


@dataclass
class OverlayOptions:
    url: str
    x: int
    y: int
    width: int
    height: int
    always_on_top: bool
    transparent: bool
    position_report_url: str = ""


class OverlayBridge:
    """给前端 JS 暴露的桥接能力。"""

    def __init__(self, options: OverlayOptions):
        self.options = options
        self._window = None

    def bind_window(self, window) -> None:
        self._window = window

    def ping(self) -> str:
        return "pong"

    def report_position(self, x: int, y: int) -> bool:
        if not self.options.position_report_url:
            return False
        payload = json.dumps({"x": int(x), "y": int(y)}).encode("utf-8")
        req = urllib.request.Request(
            self.options.position_report_url,
            method="POST",
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(req, timeout=2.0) as resp:
                return 200 <= resp.status < 300
        except (urllib.error.URLError, TimeoutError):
            return False

    def get_window_position(self) -> dict:
        if self._window is None:
            return {"x": 0, "y": 0}
        try:
            return {"x": int(getattr(self._window, "x", 0)), "y": int(getattr(self._window, "y", 0))}
        except Exception:
            return {"x": 0, "y": 0}

    def move_window(self, x: int, y: int) -> bool:
        if self._window is None:
            return False
        try:
            self._window.move(int(x), int(y))
            return True
        except Exception:
            return False


def parse_args(argv: list[str]) -> OverlayOptions:
    parser = argparse.ArgumentParser(description="MaiCore Desktop Pet Overlay")
    parser.add_argument("--url", required=True, help="桌宠页面地址")
    parser.add_argument("--x", type=int, default=80)
    parser.add_argument("--y", type=int, default=120)
    parser.add_argument("--width", type=int, default=360)
    parser.add_argument("--height", type=int, default=520)
    parser.add_argument("--always-on-top", action="store_true")
    parser.add_argument("--transparent", action="store_true")
    parser.add_argument("--position-report-url", default="", help="位置上报接口")
    ns = parser.parse_args(argv)
    return OverlayOptions(
        url=ns.url,
        x=ns.x,
        y=ns.y,
        width=ns.width,
        height=ns.height,
        always_on_top=ns.always_on_top,
        transparent=ns.transparent,
        position_report_url=ns.position_report_url,
    )


def main(argv: list[str]) -> int:
    options = parse_args(argv)
    try:
        import webview  # type: ignore
    except Exception:
        print("缺少 pywebview 依赖，请执行 pip install pywebview", file=sys.stderr)
        return 2

    bridge = OverlayBridge(options)

    # 查找图标文件
    icon_path = None
    possible_icon_paths = [
        Path(__file__).parent.parent.parent / "webui" / "frontend" / "public" / "favicon.ico",
        Path(__file__).parent.parent.parent / "webui" / "frontend" / "public" / "logo.png",
        Path(__file__).parent.parent.parent / "data" / "icon.png",
    ]
    for path in possible_icon_paths:
        if path.exists():
            icon_path = str(path)
            break

    # 创建窗口配置
    window_config = {
        "title": "MaiCore 桌宠",
        "url": options.url,
        "x": options.x,
        "y": options.y,
        "width": options.width,
        "height": options.height,
        "frameless": True,
        "easy_drag": False,
        "on_top": options.always_on_top,
        "transparent": options.transparent,
        "background_color": "#000000" if options.transparent else "#101418",
        "js_api": bridge,
    }

    # 如果找到图标，添加到配置中
    if icon_path:
        window_config["icon"] = icon_path

    window = webview.create_window(**window_config)
    bridge.bind_window(window)
    window  # silence linter for runtime-only object
    webview.start(debug=False)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
