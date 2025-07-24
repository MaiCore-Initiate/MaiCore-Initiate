@echo off
chcp 65001

:: 检查 Python 是否安装
where python >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] 未检测到 Python 环境，请先安装 Python。
    echo 您可以从 https://www.python.org/downloads/ 下载并安装。
    pause
    exit /b
)

:: 安装依赖
echo 正在检查并安装依赖...
pip install -r requirements.txt

:: 启动程序
echo 依赖安装完成，正在启动程序...
python main_refactored.py
pause
