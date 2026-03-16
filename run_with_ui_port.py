import json
import os
import subprocess
import threading
import time
import webbrowser
import sys


# 读取 .config_UI.json 中的端口号
json_path = os.path.join(os.path.dirname(__file__), 'src', 'config_UI', '.config_UI.json')
if not os.path.exists(json_path):
    port = 8000
else:
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
        port = data.get('ui_settings', {}).get('port', 8000)

# 启动后端服务的函数
def start_backend():
    # 确定虚拟环境中的 Python 和 uvicorn 路径
    venv_path = os.path.join(os.path.dirname(__file__), 'venv')
    
    if sys.platform == "win32":
        python_executable = os.path.join(venv_path, 'Scripts', 'python.exe')
        uvicorn_module = os.path.join(venv_path, 'Scripts', 'uvicorn.exe')
    else:
        python_executable = os.path.join(venv_path, 'bin', 'python')
        uvicorn_module = os.path.join(venv_path, 'bin', 'uvicorn')

    # 获取项目根目录作为工作目录
    base_dir = os.path.dirname(__file__)
    
    if os.path.exists(python_executable):
        # 方式1: 直接使用虚拟环境中的 python -m uvicorn (推荐)
        cmd = [python_executable, '-m', 'uvicorn', 'src.config_UI.config_UI:app', '--reload', '--port', str(port)]
        print(f"[INFO] 使用虚拟环境 Python 启动: {' '.join(cmd)}")
        subprocess.run(cmd, cwd=base_dir)
    elif os.path.exists(uvicorn_module):
        # 方式2: 使用虚拟环境中的 uvicorn.exe
        cmd = [uvicorn_module, 'src.config_UI.config_UI:app', '--reload', '--port', str(port)]
        print(f"[INFO] 使用 uvicorn.exe 启动: {' '.join(cmd)}")
        subprocess.run(cmd, cwd=base_dir)
    else:
        # 回退到全局 uvicorn
        print("[WARNING] 未找到项目虚拟环境中的 uvicorn，将尝试使用全局 uvicorn。")
        print("[WARNING] 如果后端闪退，请确保已在全局环境中安装了 'uvicorn' 和 'fastapi'。")
        cmd = ['uvicorn', 'src.config_UI.config_UI:app', '--reload', '--port', str(port)]
        print(f"[INFO] 启动命令: {' '.join(cmd)}")
        subprocess.run(cmd, cwd=base_dir)

# 启动前端页面的函数
def open_frontend():
    # 等待后端启动
    time.sleep(2)
    url = f"http://127.0.0.1:{port}/src/config_UI/config_UI.html"
    print(f"[INFO] 打开前端页面: {url}")
    webbrowser.open(url)

if __name__ == "__main__":
    t = threading.Thread(target=open_frontend)
    t.daemon = True
    t.start()
    start_backend()
