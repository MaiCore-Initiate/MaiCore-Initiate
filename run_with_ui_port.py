import json
import os
import subprocess
import threading
import time
import webbrowser
import json
import os
import subprocess
import ctypes
import sys

def is_admin():
    """检查是否具有管理员权限"""
    try:
        return ctypes.windll.shell32.IsUserAnAdmin()
    except:
        return False

def run_as_admin():
    """以管理员权限重新运行当前脚本"""
    script = os.path.abspath(sys.argv[0])
    # 保存当前工作目录
    current_dir = os.getcwd()
    # 将当前目录作为参数传递
    params = ' '.join([script, f'--working-dir="{current_dir}"'] + sys.argv[1:])
    
    # 请求UAC提升
    ctypes.windll.shell32.ShellExecuteW(None, "runas", sys.executable, params, None, 1)
    sys.exit(0)


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
    # 确定虚拟环境中的uvicorn路径
    venv_path = os.path.join(os.path.dirname(__file__), 'venv')
    if sys.platform == "win32":
        uvicorn_executable = os.path.join(venv_path, 'Scripts', 'uvicorn.exe')
    else:
        uvicorn_executable = os.path.join(venv_path, 'bin', 'uvicorn')

    if os.path.exists(uvicorn_executable):
        # 使用虚拟环境中的uvicorn
        cmd = f'"{uvicorn_executable}" src.config_UI.config_UI:app --reload --port {port}'
        print(f"[INFO] 在虚拟环境中启动: {cmd}")
    else:
        # 回退到全局uvicorn，并发出警告
        print("[WARNING] 未找到项目虚拟环境中的uvicorn，将尝试使用全局uvicorn。")
        print("[WARNING] 如果后端闪退，请确保已在全局环境中安装了 'uvicorn' 和 'fastapi'。")
        cmd = f"uvicorn src.config_UI.config_UI:app --reload --port {port}"
        print(f"[INFO] 启动命令: {cmd}")
        
    subprocess.run(cmd, shell=True)

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
