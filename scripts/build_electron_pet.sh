#!/bin/bash
echo "========================================"
echo " MaiCore 桌宠 Electron 构建脚本"
echo "========================================"
echo

cd desktop_pet_frontend

echo "[1/3] 安装依赖..."
npm install
if [ $? -ne 0 ]; then
    echo "依赖安装失败！"
    exit 1
fi

echo
echo "[2/3] 构建前端..."
npm run build
if [ $? -ne 0 ]; then
    echo "构建失败！"
    exit 1
fi

echo
echo "[3/3] 检查构建产物..."
if [ -f "dist/win-unpacked/desktop-pet-scheduler.exe" ] || [ -d "dist/mac/desktop-pet-scheduler.app" ] || [ -f "dist/linux-unpacked/desktop-pet-scheduler" ]; then
    echo
    echo "========================================"
    echo " 构建成功！"
    echo "========================================"
    echo "现在可以在WebUI中启动桌宠了！"
else
    echo "构建产物未找到，请检查错误信息"
    exit 1
fi
