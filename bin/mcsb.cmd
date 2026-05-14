@echo off
chcp 65001 >nul

set "CUR_DIR=%~dp0"
for %%I in ("%CUR_DIR%..") do set "PARENT_DIR=%%~fI"
set "META_FILE=%CUR_DIR%mcsb.env"
set "APP_NAME=MaiCoreStart"
set "APP_VERSION=v5.0.0-beta"
set "APP_EXE=MaiCoreStart-v5.0.0-beta.exe"
set "BUILD_DATE=2025-12-13"

if exist "%META_FILE%" (
    for /f "usebackq tokens=1* delims==" %%A in ("%META_FILE%") do (
        if /i "%%A"=="APP_NAME" set "APP_NAME=%%B"
        if /i "%%A"=="APP_VERSION" set "APP_VERSION=%%B"
        if /i "%%A"=="APP_EXE" set "APP_EXE=%%B"
        if /i "%%A"=="BUILD_DATE" set "BUILD_DATE=%%B"
    )
)

set "PYTHON_EXE=%PARENT_DIR%\venv\Scripts\python.exe"
if not exist "%PYTHON_EXE%" set "PYTHON_EXE=python"

if /i "%1"=="-d" goto deploy_template
if /i "%1"=="-l" goto deploy_template
if /i "%1"=="-c" goto deploy_template
if /i "%1"=="-com" goto deploy_template
if /i "%1"=="-u" goto deploy_template
if /i "%1"=="-t" goto test_template
if /i "%1"=="deploy" goto deploy_template
if /i "%1"=="launch" goto deploy_template
if /i "%1"=="config" goto deploy_template
if /i "%1"=="component" goto deploy_template
if /i "%1"=="uninstall" goto deploy_template
if /i "%1"=="test" goto test_template
if /i "%1"=="login" goto login_provider

:: 检查版本参数
if /i "%1"=="-v" goto show_version
if /i "%1"=="Version" goto show_version
if /i "%1"=="version" goto show_version
if /i "%1"=="--version" goto j_version

if not exist "%PARENT_DIR%\%APP_EXE%" goto fallback_python

cd /d "%PARENT_DIR%"
echo Starting %APP_EXE%...
"%PARENT_DIR%\%APP_EXE%"

if %errorlevel% equ 0 (
    echo Program exited successfully!
) else (
    echo Program exited with error code: %errorlevel%
    pause
)

goto :eof

:fallback_python
cd /d "%PARENT_DIR%"
echo Executable not found, fallback to Python entry...
"%PYTHON_EXE%" "%PARENT_DIR%\main_refactored.py"
exit /b %errorlevel%

:deploy_template
if "%~2"=="" (
    echo Usage: mcsb -d ^<DeploymentMOD path^>
    echo        mcsb -l ^<DeploymentMOD path^>
    echo        mcsb -c ^<DeploymentMOD path^>
    echo        mcsb -com ^<DeploymentMOD path^>
    echo        mcsb -u ^<DeploymentMOD path^>
    echo        mcsb -t ^<DeploymentMOD path^>
    echo        mcsb deploy ^<DeploymentMOD path^>
    echo        mcsb launch ^<DeploymentMOD path^>
    echo        mcsb config ^<DeploymentMOD path^>
    echo        mcsb component ^<DeploymentMOD path^>
    echo        mcsb uninstall ^<DeploymentMOD path^>
    echo        mcsb test ^<DeploymentMOD path^>
    echo.
    echo You can pass either a template directory or a DeploymentMOD.toml file path.
    exit /b 1
)

set "TEMPLATE_MODE=%~1"
set "TEMPLATE_PATH=%~2"
set "MCSB_CALLER_CWD=%cd%"

cd /d "%PARENT_DIR%"
echo Starting template action %TEMPLATE_MODE%...
"%PYTHON_EXE%" "%PARENT_DIR%\main_refactored.py" %TEMPLATE_MODE% "%TEMPLATE_PATH%"
exit /b %errorlevel%

:test_template
if "%~2"=="" (
    echo Usage: mcsb -t ^<DeploymentMOD path^>
    echo        mcsb test ^<DeploymentMOD path^>
    echo.
    echo You can pass either a template directory or a DeploymentMOD.toml file path.
    exit /b 1
)

set "TEMPLATE_PATH=%~2"
set "MCSB_CALLER_CWD=%cd%"

cd /d "%PARENT_DIR%"
echo Starting template syntax validation...
"%PYTHON_EXE%" "%PARENT_DIR%\deployment_mod_test.py" "%TEMPLATE_PATH%"
exit /b %errorlevel%

:login_provider
if "%~2"=="" (
    echo Missing login provider. Usage: mcsb login github.com
    exit /b 1
)
if /i not "%~2"=="github.com" (
    echo Unsupported login provider: %~2
    echo Supported provider: github.com
    exit /b 1
)

cd /d "%PARENT_DIR%"
"%PYTHON_EXE%" "%PARENT_DIR%\main_refactored.py" login "%~2"
exit /b %errorlevel%

:show_version
echo.
echo ========================================
echo           %APP_NAME% %APP_VERSION%
echo ========================================
echo.
echo "程序简介："
echo "  %APP_NAME% 是一个功能强大的麦麦核心启动器程序，"
echo "  集成了多种组件管理和部署功能，支持多种开发环境。"
echo "  自动化安装、配置和管理各种开发工具。"
echo.
echo "版本信息："
echo "  版本号: %APP_VERSION%"
echo "  构建时间: %BUILD_DATE%"
echo "  开发者: xiaoCZX、一闪、Lui"
echo.
echo "使用方法："
echo "  mcsb              - 启动程序"
echo "  mcsb -d 路径      - 执行完整部署模版"
echo "  mcsb -l 路径      - 执行模版启动阶段"
echo "  mcsb -c 路径      - 执行模版配置阶段"
echo "  mcsb -com 路径    - 执行模版组件阶段"
echo "  mcsb -u 路径      - 执行模版卸载阶段"
echo "  mcsb -t 路径      - 执行模版语法检测"
echo "  mcsb deploy 路径  - 执行完整部署模版"
echo "  mcsb launch 路径  - 执行模版启动阶段"
echo "  mcsb config 路径  - 执行模版配置阶段"
echo "  mcsb component 路径 - 执行模版组件阶段"
echo "  mcsb uninstall 路径 - 执行模版卸载阶段"
echo "  mcsb test 路径    - 执行模版语法检测"
echo "  mcsb -v           - 显示版本及信息"
echo "  mcsb Version      - 显示版本及信息"
echo "  mcsb version      - 显示版本及信息"
echo "  mcsb --version    - 显示版本"
echo.
echo ========================================
echo.

:j_version
echo %APP_NAME% version %APP_VERSION%
goto :eof
