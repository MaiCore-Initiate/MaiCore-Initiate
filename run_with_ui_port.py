import json
import os
import subprocess
import threading
import time
import webbrowser
import json
import os
import subprocess

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
