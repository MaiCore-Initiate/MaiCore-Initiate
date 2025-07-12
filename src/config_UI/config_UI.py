import tomli
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi import Request
from fastapi.staticfiles import StaticFiles
import os
import json

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

CONFIG_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../config.toml'))
JSON_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '.config_UI.json'))

app.mount("/src/config_UI", StaticFiles(directory=os.path.dirname(__file__)), name="static")

def load_config():
    with open(CONFIG_PATH, "rb") as f:
        return tomli.load(f)

def save_config(data):
    # 这里只做示例，实际应使用toml库写回
    import toml
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        toml.dump(data, f)

def load_ui_json():
    if not os.path.exists(JSON_PATH):
        return {"instances": [], "ui_settings": {}}
    with open(JSON_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def save_ui_json(data):
    with open(JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def sync_ui_json_with_toml():
    config = load_config()
    ui_json = load_ui_json()
    toml_names = set(config.get("configurations", {}).keys())
    # 只保留 json 中 name 在 toml 里的实例，且只保留指定字段
    new_instances = []
    for i in ui_json["instances"]:
        if i["name"] in toml_names:
            # 只保留 name/absolute_serial_number/serial_number/nickname_path
            new_instances.append({
                "name": i.get("name"),
                "absolute_serial_number": i.get("absolute_serial_number"),
                "serial_number": i.get("serial_number"),
                "nickname_path": i.get("nickname_path")
            })
    ui_json["instances"] = new_instances
    save_ui_json(ui_json)

@app.get("/api/configs")
def get_configs():
    config = load_config()
    configs = config.get("configurations", {})
    return JSONResponse(configs)

@app.post("/api/configs/{name}")
async def update_config(name: str, request: Request):
    config = load_config()
    data = await request.json()
    if name in config["configurations"]:
        for k, v in data.items():
            config["configurations"][name][k] = v
        save_config(config)
        return {"success": True}
    return {"success": False, "msg": "配置不存在"}

import os

def is_valid_path(path):
    return not path or os.path.exists(path)

@app.post("/api/configs")
async def create_config(request: Request):
    config = load_config()
    ui_json = load_ui_json()
    data = await request.json()
    name = data.get("name")
    new_config = data.get("config", {})
    # 检查名称和用户序列号唯一性
    for n, v in config["configurations"].items():
        if n == name or v.get("serial_number") == new_config.get("serial_number"):
            return {"success": False, "msg": "配置集名称或用户序列号已存在"}
    # 自动分配绝对序列号
    used_nums = {int(v.get("absolute_serial_number", 0)) for v in config["configurations"].values()}
    abs_num = len(used_nums) + 1
    while abs_num in used_nums:
        abs_num += 1
    new_config["absolute_serial_number"] = str(abs_num)
    # 路径校验
    for k in ["mai_path", "adapter_path", "napcat_path", "venv_path", "mongodb_path", "webui_path"]:
        if not is_valid_path(new_config.get(k, "")):
            return {"success": False, "msg": f"路径无效: {k}"}
    config["configurations"][name] = new_config
    save_config(config)
    # 只在新建时写入 json，且只保留指定字段
    ui_json["instances"].append({
        "name": name,
        "absolute_serial_number": abs_num,
        "serial_number": new_config.get("serial_number"),
        "nickname_path": new_config.get("nickname_path")
    })
    save_ui_json(ui_json)
    return {"success": True}

@app.get("/api/configs/{name}/uiinfo")
def get_uiinfo(name: str):
    # 只有 json 和 toml 同时存在的配置集才可编辑安装项
    config = load_config()
    ui_json = load_ui_json()
    toml_names = set(config.get("configurations", {}).keys())
    for inst in ui_json["instances"]:
        if inst["name"] == name and name in toml_names:
            return {"editable_install_options": True}
    return {"editable_install_options": False}

@app.on_event("startup")
def startup_event():
    sync_ui_json_with_toml()

@app.delete("/api/configs/{name}")
def delete_config(name: str):
    config = load_config()
    ui_json = load_ui_json()
    if name not in config["configurations"]:
        return {"success": False, "msg": "配置集不存在"}
    del config["configurations"][name]
    save_config(config)
    # 同步删除 UI 配置
    ui_json["instances"] = [i for i in ui_json["instances"] if i["name"] != name]
    save_ui_json(ui_json)
    return {"success": True}

@app.get("/api/ui_settings")
def get_ui_settings():
    data = load_ui_json()
    return data.get("ui_settings", {})

@app.post("/api/ui_settings")
async def set_ui_settings(request: Request):
    data = load_ui_json()
    settings = await request.json()
    # 合并新设置到原有 ui_settings
    ui_settings = data.get("ui_settings", {})
    ui_settings.update(settings)
    data["ui_settings"] = ui_settings
    save_ui_json(data)
    return {"success": True}