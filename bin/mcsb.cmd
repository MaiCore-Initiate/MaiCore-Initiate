@echo off
chcp 65001 >nul

set "CUR_DIR=%~dp0"
for %%I in ("%CUR_DIR%..") do set "PARENT_DIR=%%~fI"

if /i "%1"=="-d" goto deploy_template
if /i "%1"=="-l" goto deploy_template
if /i "%1"=="-c" goto deploy_template
if /i "%1"=="-com" goto deploy_template
if /i "%1"=="deploy" goto deploy_template
if /i "%1"=="launch" goto deploy_template
if /i "%1"=="config" goto deploy_template
if /i "%1"=="component" goto deploy_template

:: 检查版本参数
if /i "%1"=="-v" goto show_version
if /i "%1"=="Version" goto show_version
if /i "%1"=="version" goto show_version
if /i "%1"=="--version" goto j_version

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

:deploy_template
if "%~2"=="" (
    echo Usage: mcsb -d ^<DeploymentMOD path^>
    echo        mcsb -l ^<DeploymentMOD path^>
    echo        mcsb -c ^<DeploymentMOD path^>
    echo        mcsb -com ^<DeploymentMOD path^>
    echo        mcsb deploy ^<DeploymentMOD path^>
    echo        mcsb launch ^<DeploymentMOD path^>
    echo        mcsb config ^<DeploymentMOD path^>
    echo        mcsb component ^<DeploymentMOD path^>
    echo.
    echo You can pass either a template directory or a DeploymentMOD.toml file path.
    exit /b 1
)

set "TEMPLATE_MODE=%~1"
set "TEMPLATE_PATH=%~2"
set "PYTHON_EXE=%PARENT_DIR%\venv\Scripts\python.exe"
if not exist "%PYTHON_EXE%" set "PYTHON_EXE=python"

cd /d "%PARENT_DIR%"
echo Starting template action %TEMPLATE_MODE%...
"%PYTHON_EXE%" "%PARENT_DIR%\main_refactored.py" %TEMPLATE_MODE% "%TEMPLATE_PATH%"
exit /b %errorlevel%

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
echo "  mcsb -d 路径      - 执行完整部署模版"
echo "  mcsb -l 路径      - 执行模版启动阶段"
echo "  mcsb -c 路径      - 执行模版配置阶段"
echo "  mcsb -com 路径    - 执行模版组件阶段"
echo "  mcsb deploy 路径  - 执行完整部署模版"
echo "  mcsb launch 路径  - 执行模版启动阶段"
echo "  mcsb config 路径  - 执行模版配置阶段"
echo "  mcsb component 路径 - 执行模版组件阶段"
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
