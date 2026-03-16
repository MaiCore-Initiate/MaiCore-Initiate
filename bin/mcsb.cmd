@echo off
chcp 65001 >nul

:: 检查版本参数
if /i "%1"=="-v" goto show_version
if /i "%1"=="Version" goto show_version
if /i "%1"=="version" goto show_version
if /i "%1"=="--version" goto j_version

set "CUR_DIR=%~dp0"
for %%I in ("%CUR_DIR%..") do set "PARENT_DIR=%%~fI"

if not exist "%PARENT_DIR%\MaiCoreStart-v5.0.0-beta.exe" (
    echo Error: Cannot find MaiCoreStart-v5.0.0-beta.exe
    echo Expected path: %PARENT_DIR%\MaiCoreStart-v5.0.0-beta.exe
    pause
    exit /b 1
)

cd /d "%PARENT_DIR%"
echo Starting MaiCoreStart-v5.0.0-beta.exe...
"%PARENT_DIR%\MaiCoreStart-v5.0.0-beta.exe"

if %errorlevel% equ 0 (
    echo Program exited successfully!
) else (
    echo Program exited with error code: %errorlevel%
    pause
)

goto :eof

:show_version
echo.
echo ========================================
echo           MaiCoreStart v5.0.0-beta
echo ========================================
echo.
echo "程序简介："
echo "  MaiCoreStart 是一个功能强大的麦麦核心启动器程序，"
echo "  集成了多种组件管理和部署功能，支持多种开发环境。"
echo "  自动化安装、配置和管理各种开发工具。"
echo.
echo "版本信息："
echo "  版本号: v5.0.0-beta"
echo "  构建时间: 2025-12-13"
echo "  开发者: xiaoCZX、一闪、Lui"
echo.
echo "使用方法："
echo "  mcsb              - 启动程序"
echo "  mcsb -v           - 显示版本及信息"
echo "  mcsb Version      - 显示版本及信息"
echo "  mcsb version      - 显示版本及信息"
echo "  mcsb --version    - 显示版本"
echo.
echo ========================================
echo.

:j_version
echo MaiCoreStart version v5.0.0-beta
goto :eof