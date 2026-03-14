@echo off
echo ========================================
echo  MaiCore 桌宠 Electron 构建脚本
echo ========================================
echo.

cd desktop_pet_frontend

echo [1/3] 安装依赖...
call npm install
if errorlevel 1 (
    echo 依赖安装失败！
    pause
    exit /b 1
)

echo.
echo [2/3] 构建前端...
call npm run build
if errorlevel 1 (
    echo 构建失败！
    pause
    exit /b 1
)

echo.
echo [3/3] 检查构建产物...
if exist "dist\win-unpacked\desktop-pet-scheduler.exe" (
    echo.
    echo ========================================
    echo  构建成功！
    echo ========================================
    echo 可执行文件: desktop_pet_frontend\dist\win-unpacked\desktop-pet-scheduler.exe
    echo.
    echo 现在可以在WebUI中启动桌宠了！
) else (
    echo 构建产物未找到，请检查错误信息
)

echo.
pause
