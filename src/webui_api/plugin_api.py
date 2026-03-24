# -*- coding: utf-8 -*-
"""
插件管理 API 模块
为 WebUI 前端提供插件查询、安装、卸载等接口
"""
import os
import json
import time
import shutil
import subprocess
import datetime
import logging
import tempfile
import zipfile
import tarfile
from typing import Any, Dict, List, Optional

import requests as http_requests
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from packaging.version import parse as parse_version, InvalidVersion

from ..core.config import config_manager
from .auth_core import require_admin

logger = logging.getLogger(__name__)
router = APIRouter()

# ── 常量 ──
REPO_BASE = "https://raw.githubusercontent.com/Mai-with-u/plugin-repo/main"
PLUGINS_INDEX_URL = f"{REPO_BASE}/plugins.json"
PLUGINS_DETAILS_URL = f"{REPO_BASE}/plugin_details.json"
CACHE_FILE = os.path.join(os.getcwd(), "config", "plugin_cache.json")


# ── 缓存工具 ──

def _load_cache(ignore_expiry: bool = False):
    try:
        if not os.path.exists(CACHE_FILE):
            return None
        with open(CACHE_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
        if not ignore_expiry and (time.time() - data.get("last_updated", 0) > 86400):
            return None
        return data
    except Exception:
        return None


def _save_cache(index, details):
    try:
        os.makedirs(os.path.dirname(CACHE_FILE), exist_ok=True)
        with open(CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump({"last_updated": time.time(), "index": index, "details": details}, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.error(f"Failed to save plugin cache: {e}")


def _fetch_plugin_data(force: bool = False):
    if not force:
        cached = _load_cache()
        if cached:
            return cached["index"], cached["details"]
    try:
        idx = http_requests.get(PLUGINS_INDEX_URL, timeout=10).json()
        det = http_requests.get(PLUGINS_DETAILS_URL, timeout=10).json()
        _save_cache(idx, det)
        return idx, det
    except Exception as e:
        cached = _load_cache(ignore_expiry=True)
        if cached:
            return cached["index"], cached["details"]
        raise HTTPException(502, f"获取插件列表失败: {e}")


def _is_compatible(plugin: dict, version: str) -> bool:
    if version == "classical":
        return False
    host = plugin.get("manifest", {}).get("host_application", {})
    if version in ("main", "dev"):
        return "max_version" not in host
    try:
        v = parse_version(version)
        min_v = host.get("min_version")
        max_v = host.get("max_version")
        if min_v and v < parse_version(min_v):
            return False
        if max_v and v > parse_version(max_v):
            return False
        return True
    except InvalidVersion:
        return False


# ── 辅助函数 ──

def _get_instance(instance_name: Optional[str] = None, instance_serial: Optional[str] = None):
    config_manager.reload_if_changed()
    configs = config_manager.get_all_configurations()
    if instance_name and instance_name in configs:
        return instance_name, configs[instance_name]
    if instance_serial:
        for name, cfg in configs.items():
            if str(cfg.get("serial_number")) == instance_serial or str(cfg.get("absolute_serial_number")) == instance_serial:
                return name, cfg
    return None, None


def _normalize_bot_type(bot_type: str) -> str:
    if bot_type == "Neo-MoFox":
        return "Neo-MoFox"
    if bot_type in {"MoFox-Core", "MoFox_bot"}:
        return "MoFox-Core"
    return "MaiBot"


def _get_bot_path(cfg: dict) -> str:
    bot_type = _normalize_bot_type(cfg.get("bot_type", "MaiBot"))
    if bot_type == "Neo-MoFox":
        return cfg.get("neo_mofox_path", "")
    if bot_type == "MoFox-Core":
        return cfg.get("mofox_path", "")
    return cfg.get("mai_path", "")


def _get_plugins_dir(cfg: dict) -> str:
    bot_path = _get_bot_path(cfg)
    if not bot_path or not os.path.exists(bot_path):
        raise HTTPException(400, "实例路径无效")
    return os.path.join(bot_path, "plugins")


def _read_manifest(path: str) -> dict:
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def _on_rm_error(func, path, exc_info):
    os.chmod(path, 0o777)
    func(path)


def _safe_plugin_folder(plugin_folder: str) -> str:
    """校验插件文件夹名，防止路径穿越。"""
    name = os.path.basename(plugin_folder)
    if not name or name in (".", "..") or "/" in plugin_folder or "\\" in plugin_folder:
        raise HTTPException(400, "非法插件文件夹名")
    return name


def _safe_extract_zip(zip_path: str, extract_dir: str):
    """安全解压 zip，拒绝路径穿越条目。"""
    with zipfile.ZipFile(zip_path, 'r') as zf:
        for member in zf.namelist():
            target = os.path.realpath(os.path.join(extract_dir, member))
            if not target.startswith(os.path.realpath(extract_dir) + os.sep) and target != os.path.realpath(extract_dir):
                raise HTTPException(400, f"非法归档路径: {member}")
        zf.extractall(extract_dir)


def _safe_extract_tar(tar_path: str, extract_dir: str):
    """安全解压 tar，拒绝路径穿越条目。"""
    with tarfile.open(tar_path, 'r:*') as tf:
        for member in tf.getmembers():
            target = os.path.realpath(os.path.join(extract_dir, member.name))
            if not target.startswith(os.path.realpath(extract_dir) + os.sep) and target != os.path.realpath(extract_dir):
                raise HTTPException(400, f"非法归档路径: {member.name}")
        tf.extractall(extract_dir)


def _should_skip_local_plugin_dir(folder_name: str) -> bool:
    """过滤不应识别为插件的目录。"""
    return folder_name == "__pycache__" or folder_name.startswith(".")


def _find_plugin_root(directory: str, require_manifest: bool = True) -> Optional[str]:
    candidates: List[str] = []
    for current_root, dirs, files in os.walk(directory):
        dirs[:] = [d for d in dirs if not _should_skip_local_plugin_dir(d)]
        if "plugin.py" not in files:
            continue
        if require_manifest and "_manifest.json" not in files:
            continue
        candidates.append(current_root)

    if not candidates:
        return None

    return max(
        candidates,
        key=lambda path: (len(os.path.relpath(path, directory).split(os.sep)), len(path))
    )


def _extract_7z(archive_path: str, extract_dir: str):
    seven_zip = shutil.which("7z") or shutil.which("7za") or shutil.which("7zr")
    if not seven_zip:
        raise HTTPException(400, "未检测到 7z，无法解压该压缩包")
    result = subprocess.run(
        [seven_zip, "x", archive_path, f"-o{extract_dir}", "-y"],
        capture_output=True,
        text=True
    )
    if result.returncode != 0:
        raise HTTPException(500, f"7z 解压失败: {result.stderr or result.stdout}")


def _extract_archive(archive_path: str, extract_dir: str):
    lower = archive_path.lower()
    if lower.endswith(".zip"):
        _safe_extract_zip(archive_path, extract_dir)
        return
    if lower.endswith((".tar", ".tar.gz", ".tgz", ".tar.bz2", ".tbz2", ".tar.xz", ".txz")):
        _safe_extract_tar(archive_path, extract_dir)
        return
    if lower.endswith(".7z"):
        _extract_7z(archive_path, extract_dir)
        return
    raise HTTPException(400, f"不支持的压缩格式: {os.path.basename(archive_path)}")


def _extract_mfp_archive(mfp_path: str, extract_dir: str):
    errors = []
    for suffix, extractor in (
        (".zip", _safe_extract_zip),
        (".7z", _extract_7z),
        (".tar", _safe_extract_tar),
    ):
        renamed_path = f"{mfp_path}{suffix}"
        try:
            shutil.copyfile(mfp_path, renamed_path)
            extractor(renamed_path, extract_dir)
            return suffix
        except HTTPException as exc:
            errors.append(f"{suffix}: {exc.detail}")
        except Exception as exc:  # pragma: no cover - 防御性兜底
            errors.append(f"{suffix}: {exc}")
        finally:
            try:
                os.unlink(renamed_path)
            except Exception:
                pass

    raise HTTPException(400, "mfp 解压失败，已依次尝试 zip、7z、tar。 " + " | ".join(errors))


def _resolve_plugin_folder_by_id(plugins_dir: str, plugin_id: str) -> Optional[str]:
    safe_id = _safe_plugin_folder(plugin_id)
    direct_path = os.path.join(plugins_dir, safe_id)
    if os.path.isdir(direct_path):
        return direct_path

    for item in os.listdir(plugins_dir):
        item_path = os.path.join(plugins_dir, item)
        if not os.path.isdir(item_path) or _should_skip_local_plugin_dir(item):
            continue
        if item == safe_id:
            return item_path
        manifest_path = os.path.join(item_path, "_manifest.json")
        if not os.path.exists(manifest_path):
            continue
        try:
            manifest = _read_manifest(manifest_path)
        except Exception:
            continue
        if manifest.get("id") == safe_id:
            return item_path
    return None


def _import_plugin_from_directory(source_dir: str, cfg: dict, instance_name: str) -> Dict[str, Any]:
    normalized_type = _normalize_bot_type(cfg.get("bot_type", "MaiBot"))
    require_manifest = normalized_type == "MaiBot"
    plugin_root = _find_plugin_root(source_dir, require_manifest=require_manifest)
    if not plugin_root:
        if require_manifest:
            raise HTTPException(400, "压缩包中未找到包含 plugin.py 和 _manifest.json 的有效插件目录")
        raise HTTPException(400, "未找到包含 plugin.py 的有效插件目录")

    plugins_dir = _get_plugins_dir(cfg)
    os.makedirs(plugins_dir, exist_ok=True)

    folder_name = _safe_plugin_folder(os.path.basename(os.path.normpath(plugin_root)))
    plugin_id = folder_name
    plugin_name = folder_name
    manifest_path = os.path.join(plugin_root, "_manifest.json")
    if os.path.exists(manifest_path):
        try:
            manifest = _read_manifest(manifest_path)
            plugin_id = manifest.get("id", plugin_id)
            plugin_name = manifest.get("name", plugin_name)
        except Exception:
            pass

    target_dir = os.path.join(plugins_dir, folder_name)
    if os.path.exists(target_dir):
        shutil.rmtree(target_dir, onerror=_on_rm_error)

    shutil.copytree(plugin_root, target_dir)

    if normalized_type == "MaiBot":
        _add_plugin_to_config(instance_name, plugin_id)

    return {
        "plugin_id": plugin_id,
        "plugin_name": plugin_name,
        "folder_name": folder_name,
        "requires_manifest": require_manifest,
    }


def _add_plugin_to_config(instance_name: str, plugin_id: str):
    configs = config_manager.get_all_configurations()
    if instance_name in configs:
        cfg = configs[instance_name]
        if "plugins" not in cfg or not isinstance(cfg["plugins"], list):
            cfg["plugins"] = []
        cfg["plugins"] = [p for p in cfg["plugins"] if p.get("id") != plugin_id]
        cfg["plugins"].append({"id": plugin_id, "installed_at": datetime.datetime.now().isoformat()})
        config_manager.save()


def _remove_plugin_from_config(instance_name: str, plugin_id: str):
    configs = config_manager.get_all_configurations()
    if instance_name in configs:
        cfg = configs[instance_name]
        if "plugins" in cfg and isinstance(cfg["plugins"], list):
            cfg["plugins"] = [p for p in cfg["plugins"] if p.get("id") != plugin_id]
            config_manager.save()


# ── 请求模型 ──

class InstallRequest(BaseModel):
    plugin_id: str
    instance_name: str


class UninstallRequest(BaseModel):
    plugin_id: str
    instance_name: str


class ScanRequest(BaseModel):
    instance_name: Optional[str] = None
    instance_serial: Optional[str] = None


class BatchUninstallRequest(BaseModel):
    instance_name: Optional[str] = None
    instance_serial: Optional[str] = None
    plugin_ids: List[str]


class CreateFolderRequest(BaseModel):
    instance_serial: str
    plugin_folder: str
    sub_path: str = ""


class FinalizePluginRequest(BaseModel):
    instance_serial: str
    plugin_folder: str


# ══════════════════════════════════════════
#  远程插件 API
# ══════════════════════════════════════════

@router.get("/list")
def list_plugins(instance_serial: str, show_all: bool = False):
    config_manager.reload_if_changed()
    configs = config_manager.get_all_configurations()

    version = "0.0.0"
    for cfg in configs.values():
        if str(cfg.get("serial_number")) == instance_serial or str(cfg.get("absolute_serial_number")) == instance_serial:
            version = cfg.get("version_path", "0.0.0")
            break

    index, details = _fetch_plugin_data()
    plugins = list(reversed(details))
    if not show_all:
        plugins = [p for p in plugins if _is_compatible(p, version)]

    result = []
    for p in plugins:
        m = p.get("manifest", {})
        host = m.get("host_application", {})
        installed_list = []
        for name, cfg in configs.items():
            plist = cfg.get("plugins", [])
            if isinstance(plist, list):
                for rec in plist:
                    if rec.get("id") == p.get("id"):
                        installed_list.append(cfg.get("serial_number", ""))
                        break

        repo_url = ""
        for idx_item in index:
            if idx_item.get("id") == p.get("id"):
                repo_url = idx_item.get("repositoryUrl", "")
                break

        result.append({
            "id": p.get("id"),
            "name": m.get("name", "Unknown"),
            "author": m.get("author", {}).get("name", "Unknown"),
            "version": m.get("version", "0.0.0"),
            "description": m.get("description", ""),
            "license": m.get("license", ""),
            "keywords": m.get("keywords", []),
            "compat_min": host.get("min_version", "?"),
            "compat_max": host.get("max_version", "最新"),
            "manifest_version": m.get("manifest_version", ""),
            "default_locale": m.get("default_locale", ""),
            "installed_in": installed_list,
            "repo_url": repo_url,
        })

    return {"success": True, "plugins": result}


@router.get("/detail/{plugin_id}")
def get_plugin_detail(plugin_id: str):
    _, details = _fetch_plugin_data()
    for p in details:
        if p.get("id") == plugin_id:
            return {"success": True, "plugin": p}
    raise HTTPException(404, "插件未找到")


@router.post("/refresh", dependencies=[Depends(require_admin)])
def refresh_plugins():
    _fetch_plugin_data(force=True)
    return {"success": True, "message": "插件列表已刷新"}


@router.get("/installed/{instance_serial}")
def get_installed_plugins(instance_serial: str):
    _, cfg = _get_instance(instance_serial=instance_serial)
    if not cfg:
        raise HTTPException(404, "实例未找到")

    plugins = cfg.get("plugins", [])
    if not isinstance(plugins, list):
        plugins = []

    bot_path = _get_bot_path(cfg)
    enriched = []
    for rec in plugins:
        pid = rec.get("id", "")
        info = {"id": pid, "installed_at": rec.get("installed_at", "")}
        if bot_path:
            manifest_path = os.path.join(bot_path, "plugins", pid, "_manifest.json")
            if os.path.exists(manifest_path):
                try:
                    m = _read_manifest(manifest_path)
                    info["name"] = m.get("name", pid)
                    info["version"] = m.get("version", "?")
                    info["description"] = m.get("description", "")
                    info["author"] = m.get("author", {}).get("name", "")
                except Exception:
                    pass
        enriched.append(info)

    return {"success": True, "plugins": enriched}


@router.post("/install", dependencies=[Depends(require_admin)])
def install_plugin(req: InstallRequest):
    if not shutil.which("git"):
        raise HTTPException(400, "未检测到 Git，无法安装插件")

    instance_name, cfg = _get_instance(instance_name=req.instance_name)
    if not cfg or not instance_name:
        raise HTTPException(404, "实例未找到")
    if _normalize_bot_type(cfg.get("bot_type", "MaiBot")) != "MaiBot":
        raise HTTPException(400, "当前实例类型仅支持本地导入插件")

    plugins_dir = _get_plugins_dir(cfg)
    safe_id = _safe_plugin_folder(req.plugin_id)
    target_dir = os.path.join(plugins_dir, safe_id)

    index, _ = _fetch_plugin_data()
    repo_url = None
    for p in index:
        if p.get("id") == req.plugin_id:
            repo_url = p.get("repositoryUrl")
            break
    if not repo_url:
        raise HTTPException(404, "未找到插件仓库地址")

    if os.path.exists(target_dir):
        shutil.rmtree(target_dir, onerror=_on_rm_error)

    os.makedirs(plugins_dir, exist_ok=True)
    result = subprocess.run(["git", "clone", repo_url, target_dir], capture_output=True, text=True)
    if result.returncode != 0:
        raise HTTPException(500, f"Git clone 失败: {result.stderr}")

    _add_plugin_to_config(req.instance_name, req.plugin_id)
    return {"success": True, "message": f"插件 {req.plugin_id} 安装成功"}


@router.post("/uninstall", dependencies=[Depends(require_admin)])
def uninstall_plugin(req: UninstallRequest):
    instance_name, cfg = _get_instance(instance_name=req.instance_name)
    if not cfg or not instance_name:
        raise HTTPException(404, "实例未找到")
    if _normalize_bot_type(cfg.get("bot_type", "MaiBot")) != "MaiBot":
        raise HTTPException(400, "当前实例类型仅支持本地导入插件")

    bot_path = _get_bot_path(cfg)
    safe_id = _safe_plugin_folder(req.plugin_id)
    target_dir = os.path.join(bot_path, "plugins", safe_id) if bot_path else ""

    if target_dir and os.path.exists(target_dir):
        shutil.rmtree(target_dir, onerror=_on_rm_error)

    _remove_plugin_from_config(req.instance_name, req.plugin_id)
    return {"success": True, "message": f"插件 {req.plugin_id} 卸载成功"}


# ══════════════════════════════════════════
#  本地插件管理 API
# ══════════════════════════════════════════

@router.get("/local/list")
def local_list_plugins(instance_serial: str):
    """获取本地已安装插件的完整信息"""
    name, cfg = _get_instance(instance_serial=instance_serial)
    if not cfg:
        raise HTTPException(404, "实例未找到")

    bot_path = _get_bot_path(cfg)
    if not bot_path or not os.path.exists(bot_path):
        return {"success": True, "plugins": []}

    plugins_dir = os.path.join(bot_path, "plugins")
    if not os.path.exists(plugins_dir):
        return {"success": True, "plugins": []}

    registered = {p.get("id"): p for p in (cfg.get("plugins", []) or []) if isinstance(p, dict)}
    normalized_type = _normalize_bot_type(cfg.get("bot_type", "MaiBot"))
    result = []

    for item in os.listdir(plugins_dir):
        item_path = os.path.join(plugins_dir, item)
        if not os.path.isdir(item_path):
            continue
        if _should_skip_local_plugin_dir(item):
            continue
        manifest_path = os.path.join(item_path, "_manifest.json")
        plugin_py = os.path.join(item_path, "plugin.py")
        has_manifest = os.path.exists(manifest_path)
        has_plugin_py = os.path.exists(plugin_py)

        info: Dict[str, Any] = {
            "folder_name": item,
            "has_manifest": has_manifest,
            "has_plugin_py": has_plugin_py,
            "registered": item in registered,
            "installed_at": registered.get(item, {}).get("installed_at", ""),
            "id": item,
            "name": item,
            "bot_type": normalized_type,
        }

        if has_manifest:
            try:
                m = _read_manifest(manifest_path)
                info.update({
                    "id": m.get("id", item),
                    "name": m.get("name", item),
                    "version": m.get("version", "?"),
                    "description": m.get("description", ""),
                    "author": m.get("author", {}).get("name", ""),
                    "license": m.get("license", ""),
                    "keywords": m.get("keywords", []),
                    "homepage_url": m.get("homepage_url", ""),
                    "repository_url": m.get("repository_url", ""),
                    "host_application": m.get("host_application", {}),
                })
                if info["id"] in registered:
                    info["registered"] = True
                    info["installed_at"] = registered.get(info["id"], {}).get("installed_at", info["installed_at"])
            except Exception:
                pass
        elif normalized_type == "Neo-MoFox" and has_plugin_py:
            info["description"] = "Neo-MoFox 本地插件"

        result.append(info)

    return {"success": True, "plugins": result}


@router.post("/local/scan", dependencies=[Depends(require_admin)])
def local_scan_plugins(req: ScanRequest):
    """扫描本地插件目录，将未注册的有效插件注册到配置"""
    name, cfg = _get_instance(instance_name=req.instance_name, instance_serial=req.instance_serial)
    if not cfg:
        raise HTTPException(404, "实例未找到")
    if _normalize_bot_type(cfg.get("bot_type", "MaiBot")) != "MaiBot":
        raise HTTPException(400, "当前实例类型无需扫描注册插件")

    bot_path = _get_bot_path(cfg)
    plugins_dir = os.path.join(bot_path, "plugins") if bot_path else ""
    if not plugins_dir or not os.path.exists(plugins_dir):
        return {"success": True, "scanned": [], "registered_count": 0}

    registered_ids = set()
    for p in (cfg.get("plugins", []) or []):
        if isinstance(p, dict):
            registered_ids.add(p.get("id", ""))

    scanned = []
    registered_count = 0

    for item in os.listdir(plugins_dir):
        item_path = os.path.join(plugins_dir, item)
        if not os.path.isdir(item_path):
            continue
        if _should_skip_local_plugin_dir(item):
            continue
        if not (os.path.exists(os.path.join(item_path, "_manifest.json")) and os.path.exists(os.path.join(item_path, "plugin.py"))):
            continue

        try:
            m = _read_manifest(os.path.join(item_path, "_manifest.json"))
            plugin_id = m.get("id", item)
            plugin_name = m.get("name", item)
        except Exception:
            plugin_id = item
            plugin_name = item

        scanned.append({"id": plugin_id, "name": plugin_name, "folder": item})

        if plugin_id not in registered_ids and item not in registered_ids:
            _add_plugin_to_config(name, plugin_id)
            registered_count += 1

    return {"success": True, "scanned": scanned, "registered_count": registered_count}


@router.post("/local/batch-uninstall", dependencies=[Depends(require_admin)])
def local_batch_uninstall(req: BatchUninstallRequest):
    """批量卸载插件"""
    name, cfg = _get_instance(instance_name=req.instance_name, instance_serial=req.instance_serial)
    if not cfg or not name:
        raise HTTPException(404, "实例未找到")

    bot_path = _get_bot_path(cfg)
    removed = []
    plugins_dir = os.path.join(bot_path, "plugins") if bot_path else ""

    for pid in req.plugin_ids:
        safe_id = _safe_plugin_folder(pid)
        target_dir = _resolve_plugin_folder_by_id(plugins_dir, safe_id) if plugins_dir and os.path.exists(plugins_dir) else None
        manifest_plugin_id = None
        if target_dir:
            manifest_path = os.path.join(target_dir, "_manifest.json")
            if os.path.exists(manifest_path):
                try:
                    manifest_plugin_id = _read_manifest(manifest_path).get("id")
                except Exception:
                    manifest_plugin_id = None
        if target_dir and os.path.exists(target_dir):
            shutil.rmtree(target_dir, onerror=_on_rm_error)
            removed.append(os.path.basename(target_dir))
        else:
            removed.append(safe_id)
        _remove_plugin_from_config(name, safe_id)
        if manifest_plugin_id and manifest_plugin_id != safe_id:
            _remove_plugin_from_config(name, manifest_plugin_id)

    return {"success": True, "removed": removed}


@router.post("/local/batch-unregister", dependencies=[Depends(require_admin)])
def local_batch_unregister(req: BatchUninstallRequest):
    """批量注销插件（仅取消注册，不删除本地文件）"""
    name, cfg = _get_instance(instance_name=req.instance_name, instance_serial=req.instance_serial)
    if not cfg or not name:
        raise HTTPException(404, "实例未找到")

    unregistered = []
    for pid in req.plugin_ids:
        _remove_plugin_from_config(name, pid)
        unregistered.append(pid)

    return {"success": True, "unregistered": unregistered}


@router.post("/local/upload-archive", dependencies=[Depends(require_admin)])
async def local_upload_archive(
    instance_serial: str = Form(...),
    file: UploadFile = File(...),
):
    """上传压缩包并解压导入插件"""
    name, cfg = _get_instance(instance_serial=instance_serial)
    if not cfg or not name:
        raise HTTPException(404, "实例未找到")

    filename = file.filename or ""
    lower = filename.lower()
    normalized_type = _normalize_bot_type(cfg.get("bot_type", "MaiBot"))

    with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(filename)[1]) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    extract_dir = tempfile.mkdtemp()
    try:
        if lower.endswith(".mfp"):
            if normalized_type != "Neo-MoFox":
                raise HTTPException(400, "mfp 插件包仅支持 Neo-MoFox 实例导入")
            _extract_mfp_archive(tmp_path, extract_dir)
        else:
            _extract_archive(tmp_path, extract_dir)

        result = _import_plugin_from_directory(extract_dir, cfg, name)
        return {"success": True, **result}
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass
        try:
            shutil.rmtree(extract_dir, onerror=_on_rm_error)
        except Exception:
            pass


@router.post("/local/upload-folder", dependencies=[Depends(require_admin)])
async def local_upload_folder(
    instance_serial: str = Form(...),
    relative_paths: List[str] = Form(...),
    files: List[UploadFile] = File(...),
):
    """上传整个插件文件夹，并自动识别最内层插件目录"""
    name, cfg = _get_instance(instance_serial=instance_serial)
    if not cfg or not name:
        raise HTTPException(404, "实例未找到")

    if len(files) != len(relative_paths):
        raise HTTPException(400, "文件数量与路径数量不一致")

    staging_dir = tempfile.mkdtemp()
    try:
        for upload, relative_path in zip(files, relative_paths):
            normalized = relative_path.replace("\\", "/").strip("/")
            parts = [part for part in normalized.split("/") if part not in ("", ".")]
            if not parts or any(part == ".." for part in parts):
                raise HTTPException(400, f"非法文件路径: {relative_path}")

            target_path = os.path.join(staging_dir, *parts)
            target_real = os.path.realpath(target_path)
            staging_real = os.path.realpath(staging_dir)
            if not target_real.startswith(staging_real + os.sep) and target_real != staging_real:
                raise HTTPException(400, f"非法文件路径: {relative_path}")

            os.makedirs(os.path.dirname(target_path), exist_ok=True)
            with open(target_path, "wb") as output:
                output.write(await upload.read())

        result = _import_plugin_from_directory(staging_dir, cfg, name)
        return {"success": True, **result}
    finally:
        try:
            shutil.rmtree(staging_dir, onerror=_on_rm_error)
        except Exception:
            pass


@router.post("/local/upload-files", dependencies=[Depends(require_admin)])
async def local_upload_files(
    instance_serial: str = Form(...),
    plugin_folder: str = Form(...),
    sub_path: str = Form(""),
    files: List[UploadFile] = File(...),
):
    """上传单个或多个文件到插件目录（支持子路径）"""
    name, cfg = _get_instance(instance_serial=instance_serial)
    if not cfg or not name:
        raise HTTPException(404, "实例未找到")

    plugins_dir = _get_plugins_dir(cfg)
    # 安全检查：防止路径穿越
    safe_folder = _safe_plugin_folder(plugin_folder)
    safe_sub = os.path.normpath(sub_path).lstrip(os.sep).lstrip("/")
    if ".." in safe_sub:
        raise HTTPException(400, "非法子路径")

    target_dir = os.path.join(plugins_dir, safe_folder, safe_sub) if safe_sub else os.path.join(plugins_dir, safe_folder)
    os.makedirs(target_dir, exist_ok=True)

    saved = []
    for f in files:
        fname = os.path.basename(f.filename or "unknown")
        dest = os.path.join(target_dir, fname)
        content = await f.read()
        with open(dest, "wb") as out:
            out.write(content)
        saved.append(os.path.join(safe_sub, fname) if safe_sub else fname)

    return {"success": True, "saved": saved}


@router.post("/local/create-folder", dependencies=[Depends(require_admin)])
def local_create_folder(req: CreateFolderRequest):
    """在插件目录下创建子文件夹"""
    _, cfg = _get_instance(instance_serial=req.instance_serial)
    if not cfg:
        raise HTTPException(404, "实例未找到")

    plugins_dir = _get_plugins_dir(cfg)
    safe_folder = _safe_plugin_folder(req.plugin_folder)
    safe_sub = os.path.normpath(req.sub_path).lstrip(os.sep).lstrip("/")
    if ".." in safe_sub:
        raise HTTPException(400, "非法子路径")

    target = os.path.join(plugins_dir, safe_folder, safe_sub) if safe_sub else os.path.join(plugins_dir, safe_folder)
    os.makedirs(target, exist_ok=True)
    return {"success": True, "path": os.path.join(safe_folder, safe_sub) if safe_sub else safe_folder}


@router.post("/local/finalize", dependencies=[Depends(require_admin)])
def local_finalize_plugin(req: FinalizePluginRequest):
    """验证插件目录完整性并注册到配置"""
    name, cfg = _get_instance(instance_serial=req.instance_serial)
    if not cfg or not name:
        raise HTTPException(404, "实例未找到")

    plugins_dir = _get_plugins_dir(cfg)
    safe_folder = _safe_plugin_folder(req.plugin_folder)
    plugin_dir = os.path.join(plugins_dir, safe_folder)

    if not os.path.isdir(plugin_dir):
        raise HTTPException(400, "插件目录不存在")

    manifest_path = os.path.join(plugin_dir, "_manifest.json")
    plugin_py_path = os.path.join(plugin_dir, "plugin.py")

    missing = []
    if not os.path.exists(plugin_py_path):
        missing.append("plugin.py")
    if not os.path.exists(manifest_path):
        missing.append("_manifest.json")
    if missing:
        raise HTTPException(400, f"缺少必要文件: {', '.join(missing)}")

    try:
        m = _read_manifest(manifest_path)
        plugin_id = m.get("id", safe_folder)
        plugin_name = m.get("name", safe_folder)
    except Exception as e:
        raise HTTPException(400, f"_manifest.json 解析失败: {e}")

    _add_plugin_to_config(name, plugin_id)
    return {"success": True, "plugin_id": plugin_id, "plugin_name": plugin_name}


@router.get("/local/tree")
def local_plugin_tree(instance_serial: str, plugin_folder: str):
    """获取插件目录的文件树"""
    _, cfg = _get_instance(instance_serial=instance_serial)
    if not cfg:
        raise HTTPException(404, "实例未找到")

    plugins_dir = _get_plugins_dir(cfg)
    safe_folder = _safe_plugin_folder(plugin_folder)
    root = os.path.join(plugins_dir, safe_folder)

    if not os.path.isdir(root):
        return {"success": True, "tree": []}

    def walk(d: str, prefix: str = "") -> list:
        items = []
        try:
            for entry in sorted(os.listdir(d)):
                full = os.path.join(d, entry)
                rel = os.path.join(prefix, entry) if prefix else entry
                if os.path.isdir(full):
                    items.append({"name": entry, "path": rel, "type": "dir", "children": walk(full, rel)})
                else:
                    items.append({"name": entry, "path": rel, "type": "file"})
        except Exception:
            pass
        return items

    return {"success": True, "tree": walk(root)}
