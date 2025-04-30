@echo off
chcp 65001

:menu
cls
echo MaiBot Runner
echo ======================
echo 1. 运行麦麦
echo 2. 配置内容（覆盖先前配置）
echo ======================
set /p choice=请选择一个选项 (1 或 2): 

if "%choice%"=="1" goto run_maimbot
if "%choice%"=="2" goto configure
echo 无效的选择，请重试。
pause
goto menu

:configure
cls
setlocal enabledelayedexpansion

:input_bot_path
set "bot_path="
if "%~1" neq "" (
    set "bot_path=%~1"
    shift
) else (
    set /p bot_path=请输入 MaiBot 文件夹的路径: 
)
call :validate_path "!bot_path!" || goto input_bot_path

:input_napcat_adapter_path
set "napcat_adapter_path="
if "%~1" neq "" (
    set "napcat_adapter_path=%~1"
    shift
) else (
    set /p napcat_adapter_path=请输入 MaiBot-Napcat-Adapter 文件夹的路径: 
)
call :validate_path "!napcat_adapter_path!" || goto input_napcat_adapter_path

:input_env_path
set "env_path="
if "%~1" neq "" (
    set "env_path=%~1"
    shift
) else (
    set /p env_path=请输入 .env 文件的路径: 
)
call :validate_file "!env_path!" || goto input_env_path

(
    echo [Paths]
    echo BOT_PATH=!bot_path!
    echo NAPCAT_ADAPTER_PATH=!napcat_adapter_path!
    echo ENV_PATH=!env_path!
) > config.ini

echo 配置已保存。
endlocal
pause
goto menu

:run_maimbot
if not exist config.ini (
    echo 配置文件不存在，请先配置内容。
    pause
    goto menu
)

for /f "tokens=2 delims==" %%a in ('findstr /b "BOT_PATH=" config.ini') do set "BOT_PATH=%%a"
for /f "tokens=2 delims==" %%a in ('findstr /b "NAPCAT_ADAPTER_PATH=" config.ini') do set "NAPCAT_ADAPTER_PATH=%%a"
for /f "tokens=2 delims==" %%a in ('findstr /b "ENV_PATH=" config.ini') do set "ENV_PATH=%%a"

if "%BOT_PATH%"=="" (
    echo 路径配置错误，请重新配置。
    pause
    goto menu
)

if "%NAPCAT_ADAPTER_PATH%"=="" (
    echo 路径配置错误，请重新配置。
    pause
    goto menu
)

if not exist "%ENV_PATH%" (
    echo .env 文件不存在，请重新配置。
    pause
    goto menu
)

start "" powershell -NoExit -Command "& {Set-Location '%BOT_PATH%'; .\venv\Scripts\Activate; $required_packages = @('python-dotenv', 'loguru', 'Pillow', 'pymongo', 'python-dateutil', 'tomlkit', 'packaging', 'jieba'); foreach ($pkg in $required_packages) { if (-not (& pip list --format=freeze | Select-String "^$pkg")) { & pip install $pkg } }; python .\bot.py}"
start "" powershell -NoExit -Command "& {Set-Location '%NAPCAT_ADAPTER_PATH%'; ..\Maibot\venv\Scripts\Activate; python .\main.py}"

goto end

:validate_path
set "path=%~1"
if "%path%"=="" (
    echo 输入的路径不能为空。
    exit /b 1
)
call :contains_chinese "!path!"
if %errorlevel% equ 1 (
    echo 输入的路径包含中文字符，请重新输入。
    exit /b 1
)
if not exist "%path%" (
    echo 输入的路径不存在，请重新输入。
    exit /b 1
)
exit /b 0

:validate_file
set "file=%~1"
if "%file%"=="" (
    echo 输入的文件路径不能为空。
    exit /b 1
)
call :contains_chinese "!file!"
if %errorlevel% equ 1 (
    echo 输入的文件路径包含中文字符，请重新输入。
    exit /b 1
)
if not exist "%file%" (
    echo 输入的文件路径不存在，请重新输入。
    exit /b 1
)
exit /b 0

:contains_chinese
set "text=%~1"
setlocal enabledelayedexpansion
for /f "delims=" %%i in ("!text!") do (
    set "line=%%i"
    for /f "tokens=1 delims=" %%j in ('echo !line! ^| findstr /r "[\x4e00-\x9fa5]"') do (
        endlocal
        exit /b 1
    )
)
endlocal
exit /b 0

:end



