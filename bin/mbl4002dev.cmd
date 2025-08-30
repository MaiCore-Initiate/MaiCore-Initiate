@echo off
REM 获取当前脚本所在目录
set "CUR_DIR=%~dp0"
REM 获取上级目录
set "PARENT_DIR=%CUR_DIR%.."
REM 切换到上级目录并启动 exe
cd /d "%PARENT_DIR%"
start "" "MaiBotInitiate-V4.0.0.2-dev.exe"
