"""
实例打包与导入模块 (.mcsins)
格式：ISO 9660 (Joliet) 文件，内含 meta.json + <name>.zip
"""
import io
import json
import os
import re
import zipfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import pycdlib
from rich.console import Console
from rich.markdown import Markdown
from rich.prompt import Confirm
from rich.table import Table

console = Console()

PROJECT_ROOT = Path(__file__).parent.parent.parent
ACCOUNT_DATA_FILE = PROJECT_ROOT / "data" / "account_system.json"


@dataclass
class PackFilter:
    no_data: bool = False
    no_config: bool = False
    no_components: bool = False
    no_src: bool = False
    no_plugins: bool = False
    no_venv: bool = True        # 默认不打包 venv
    only_components: list = field(default_factory=list)  # --c{...}
    only_plugins: list = field(default_factory=list)     # --p{...}


def check_github_auth() -> dict:
    """检查是否有 GitHub 已登录用户，返回用户信息，未登录则抛出异常"""
    if not ACCOUNT_DATA_FILE.exists():
        raise RuntimeError("账号数据不存在，请先启动 WebUI 并通过 GitHub 登录")
    with open(ACCOUNT_DATA_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    for user in data.get("users", []):
        if str(user.get("github_id", "")).strip():
            return {
                "login": user.get("github_login", ""),
                "name": user.get("name") or user.get("github_login", ""),
                "url": user.get("github_url", ""),
                "email": user.get("email", ""),
            }
    raise RuntimeError("未检测到 GitHub 登录状态，请先执行 mcsb login github.com")


def _detect_venv(search_dir: Path) -> Optional[Path]:
    for name in (".venv", "venv", ".env", "env"):
        candidate = search_dir / name
        if candidate.is_dir() and (candidate / "pyvenv.cfg").exists():
            return candidate
    return None


def resolve_instance_dirs(cfg: dict) -> dict:
    """从实例配置解析出各关键路径"""
    bot_type = cfg.get("bot_type", "MaiBot")
    if bot_type in ("MoFox-Core", "MoFox_bot"):
        bot_instance_dir = Path(cfg.get("mofox_path") or "")
    elif bot_type == "Neo-MoFox":
        bot_instance_dir = Path(cfg.get("neo_mofox_path") or "")
    else:
        bot_instance_dir = Path(cfg.get("mai_path") or "")

    if not str(bot_instance_dir) or not bot_instance_dir.is_dir():
        raise ValueError(f"实例主程序目录未配置或不存在: {bot_instance_dir}")

    nickname_dir = bot_instance_dir.parent
    venv_path_str = (cfg.get("venv_path") or "").strip()
    if venv_path_str:
        venv_dir: Optional[Path] = Path(venv_path_str) if Path(venv_path_str).is_dir() else None
    else:
        venv_dir = _detect_venv(bot_instance_dir) or _detect_venv(nickname_dir)

    return {
        "bot_dir": bot_instance_dir,
        "nickname_dir": nickname_dir,
        "config_dir": bot_instance_dir / "config",
        "data_dir": bot_instance_dir / "data",
        "plugins_dir": bot_instance_dir / "plugins",
        "venv_dir": venv_dir,
    }


def _get_components(nickname_dir: Path, bot_dir: Path) -> list:
    """实例目录下除 bot 本体文件夹外的所有文件/目录"""
    bot_name = bot_dir.name
    return [item for item in nickname_dir.iterdir() if item.name != bot_name]


def _scrub_api_keys(content: str) -> str:
    return re.sub(r'(?m)^(\s*api_key\s*=\s*)["\'].*?["\']', r'\1"sk-xxxxxx"', content)


def _add_to_zip(zf: zipfile.ZipFile, src: Path, arc_prefix: str, scrub: bool = False):
    """将文件或目录写入 zip，arc_prefix 为 zip 内路径"""
    _SCRUB_NAMES = {"model_config.toml", "model.toml"}
    if src.is_file():
        if scrub and src.name in _SCRUB_NAMES:
            raw = src.read_text(encoding="utf-8", errors="replace")
            zf.writestr(arc_prefix, _scrub_api_keys(raw).encode("utf-8"))
        else:
            zf.write(src, arc_prefix)
    elif src.is_dir():
        for fpath in src.rglob("*"):
            if fpath.is_file():
                rel = fpath.relative_to(src).as_posix()
                arc = f"{arc_prefix}/{rel}"
                if scrub and fpath.name in _SCRUB_NAMES:
                    raw = fpath.read_text(encoding="utf-8", errors="replace")
                    zf.writestr(arc, _scrub_api_keys(raw).encode("utf-8"))
                else:
                    zf.write(fpath, arc)


def list_components(cfg: dict) -> list:
    """列出实例目录下所有组件，打印表格并返回名称列表"""
    dirs = resolve_instance_dirs(cfg)
    items = _get_components(dirs["nickname_dir"], dirs["bot_dir"])
    table = Table(title="实例目录下的组件")
    table.add_column("序号", style="cyan")
    table.add_column("名称", style="green")
    table.add_column("类型")
    for i, c in enumerate(items, 1):
        table.add_row(str(i), c.name, "目录" if c.is_dir() else "文件")
    console.print(table)
    return [c.name for c in items]


def list_plugins(cfg: dict) -> list:
    """列出实例插件目录下所有插件文件夹，打印表格并返回名称列表"""
    dirs = resolve_instance_dirs(cfg)
    plugins_dir = dirs["plugins_dir"]
    if not plugins_dir.is_dir():
        console.print("[yellow]插件目录不存在[/yellow]")
        return []
    items = [p for p in plugins_dir.iterdir() if p.is_dir()]
    table = Table(title="插件列表")
    table.add_column("序号", style="cyan")
    table.add_column("名称", style="green")
    for i, p in enumerate(items, 1):
        table.add_row(str(i), p.name)
    console.print(table)
    return [p.name for p in items]


def pack_instance(
    cfg_name: str,
    pack_filter: PackFilter,
    output_path: str,
    description: str,
    github_user: dict,
) -> str:
    """
    打包实例为 .mcsins 文件。
    cfg_name: 配置集名称或实例序列号
    返回最终输出路径。
    """
    from src.core.config import config_manager

    configs = config_manager.get_all_configurations()
    cfg = configs.get(cfg_name)
    if cfg is None:
        for n, c in configs.items():
            if str(c.get("serial_number", "")) == str(cfg_name):
                cfg, cfg_name = c, n
                break
    if cfg is None:
        raise ValueError(f"实例 '{cfg_name}' 未找到")

    dirs = resolve_instance_dirs(cfg)
    bot_dir = dirs["bot_dir"]
    nickname_dir = dirs["nickname_dir"]
    config_dir = dirs["config_dir"]
    data_dir = dirs["data_dir"]
    plugins_dir = dirs["plugins_dir"]
    venv_dir = dirs["venv_dir"]
    bot_name = bot_dir.name
    pack_venv = not pack_filter.no_venv

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        # 源码（bot_dir 下，排除 config/data/plugins 及 venv）
        if not pack_filter.no_src:
            excl = {"config", "data", "plugins"}
            if venv_dir and venv_dir.parent == bot_dir:
                excl.add(venv_dir.name)
            for item in bot_dir.iterdir():
                if item.name not in excl:
                    _add_to_zip(zf, item, f"{bot_name}/{item.name}")

        if not pack_filter.no_config and config_dir.is_dir():
            _add_to_zip(zf, config_dir, f"{bot_name}/config", scrub=True)

        if not pack_filter.no_data and data_dir.is_dir():
            _add_to_zip(zf, data_dir, f"{bot_name}/data")

        if not pack_filter.no_plugins and plugins_dir.is_dir():
            if pack_filter.only_plugins:
                for pname in pack_filter.only_plugins:
                    pdir = plugins_dir / pname
                    if pdir.is_dir():
                        _add_to_zip(zf, pdir, f"{bot_name}/plugins/{pname}")
            else:
                _add_to_zip(zf, plugins_dir, f"{bot_name}/plugins")

        if pack_venv and venv_dir and venv_dir.is_dir():
            _add_to_zip(zf, venv_dir, f"{bot_name}/{venv_dir.name}")

        if not pack_filter.no_components:
            venv_in_nickname = venv_dir and venv_dir.parent == nickname_dir
            for comp in _get_components(nickname_dir, bot_dir):
                if venv_in_nickname and comp.name == venv_dir.name and not pack_venv:
                    continue
                if pack_filter.only_components and comp.name not in pack_filter.only_components:
                    continue
                _add_to_zip(zf, comp, comp.name)

    zip_data = zip_buffer.getvalue()
    zip_fname = f"{cfg_name}.zip"

    # 统计实际打包的组件和插件列表（用于 meta）
    packed_components: list = []
    if not pack_filter.no_components:
        venv_in_nickname = venv_dir and venv_dir.parent == nickname_dir
        for c in _get_components(nickname_dir, bot_dir):
            if venv_in_nickname and venv_dir and c.name == venv_dir.name and not pack_venv:
                continue
            if pack_filter.only_components and c.name not in pack_filter.only_components:
                continue
            packed_components.append(c.name)

    packed_plugins: list = []
    if not pack_filter.no_plugins and plugins_dir.is_dir():
        packed_plugins = (pack_filter.only_plugins if pack_filter.only_plugins
                          else [p.name for p in plugins_dir.iterdir() if p.is_dir()])

    meta = {
        "meta": {
            "name": cfg.get("nickname_path", cfg_name),
            "serial": cfg.get("serial_number", ""),
            "author": github_user.get("name") or github_user.get("login", ""),
            "mail": github_user.get("email", ""),
            "account": github_user.get("url", ""),
            "time": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "type": cfg.get("bot_type", "MaiBot"),
            "version": cfg.get("version_path", ""),
            "description": description,
            "components": packed_components,
            "plugins": packed_plugins,
            "pack-source": "MaiCoreStart",
        }
    }
    meta_data = json.dumps(meta, ensure_ascii=False, indent=2).encode("utf-8")

    # ISO 9660 短名称（8+3，全大写，只含字母数字下划线）
    iso_zip_short = re.sub(r"[^A-Z0-9_]", "_", cfg_name[:8].upper()) + ".ZIP"

    iso = pycdlib.PyCdlib()
    iso.new(joliet=3, sys_ident="MAICORESTART", vol_ident="MCSINS")
    iso.add_fp(io.BytesIO(meta_data), len(meta_data), iso_path="/META.JSN;1", joliet_path="/meta.json")
    iso.add_fp(io.BytesIO(zip_data), len(zip_data), iso_path=f"/{iso_zip_short};1", joliet_path=f"/{zip_fname}")

    out_path = os.path.abspath(output_path)
    parent = os.path.dirname(out_path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    iso.write(out_path)
    iso.close()

    return out_path


def import_instance(mcsins_path: str, dest_dir: str) -> str:
    """
    从 .mcsins 文件导入实例。
    展示元数据后交互确认，解压到 dest_dir/<serial>/，注册到 config_manager。
    """
    from src.core.config import config_manager

    mcsins_path = os.path.abspath(mcsins_path)
    if not os.path.exists(mcsins_path):
        raise FileNotFoundError(f"文件不存在: {mcsins_path}")

    iso = pycdlib.PyCdlib()
    iso.open(mcsins_path)

    # 读取 meta.json
    buf = io.BytesIO()
    iso.get_file_from_iso_fp(buf, joliet_path="/meta.json")
    raw_meta = json.loads(buf.getvalue().decode("utf-8"))
    meta_info = raw_meta.get("meta", raw_meta)

    # 展示实例信息
    console.rule("[bold]实例信息")
    for key, label in [
        ("name", "名称"), ("serial", "序列号"), ("type", "类型"),
        ("version", "版本"), ("time", "打包时间"),
    ]:
        console.print(f"[bold cyan]{label}：[/bold cyan]{meta_info.get(key, '-')}")
    author = meta_info.get("author", "-")
    mail = meta_info.get("mail", "")
    console.print(f"[bold cyan]作者：[/bold cyan]{author}{f' <{mail}>' if mail else ''}")
    console.print(f"[bold cyan]GitHub：[/bold cyan]{meta_info.get('account', '-')}")

    desc = meta_info.get("description", "")
    if desc:
        console.rule("[bold]描述")
        console.print(Markdown(desc))

    for key, label in [("components", "组件"), ("plugins", "插件")]:
        items = meta_info.get(key, [])
        if items:
            console.print(f"[bold cyan]{label}：[/bold cyan]{', '.join(items)}")
    console.rule()

    if not Confirm.ask(f"确认导入到 {dest_dir} ?"):
        iso.close()
        raise RuntimeError("用户取消导入")

    # 查找 zip 文件（Joliet 路径）
    zip_joliet_path: Optional[str] = None
    for child in iso.list_children(joliet_path="/"):
        if child.is_dot() or child.is_dotdot():
            continue
        try:
            fname = child.file_identifier.decode("utf-16-be")
        except Exception:
            fname = str(child.file_identifier)
        if fname.lower().endswith(".zip"):
            zip_joliet_path = f"/{fname}"
            break

    if zip_joliet_path is None:
        iso.close()
        raise RuntimeError("包内未找到 .zip 文件")

    zip_buf = io.BytesIO()
    iso.get_file_from_iso_fp(zip_buf, joliet_path=zip_joliet_path)
    iso.close()

    # 解压到目标目录
    serial = meta_info.get("serial") or "instance"
    extract_dir = os.path.join(os.path.abspath(dest_dir), serial)
    os.makedirs(extract_dir, exist_ok=True)
    zip_buf.seek(0)
    with zipfile.ZipFile(zip_buf) as zf:
        zf.extractall(extract_dir)

    # 注册到 config_manager
    bot_type = meta_info.get("type", "MaiBot")
    if bot_type in ("MoFox-Core", "MoFox_bot"):
        path_key = "mofox_path"
    elif bot_type == "Neo-MoFox":
        path_key = "neo_mofox_path"
    else:
        path_key = "mai_path"

    bot_dir = os.path.join(extract_dir, bot_type)
    instance_name = meta_info.get("name") or serial
    cfg_key = instance_name
    existing = config_manager.get_all_configurations()
    if cfg_key in existing:
        cfg_key = f"{instance_name}_{serial}"

    config_manager.add_configuration(cfg_key, {
        "serial_number": serial,
        "nickname_path": instance_name,
        "version_path": meta_info.get("version", ""),
        "bot_type": bot_type,
        "qq_account": "",
        path_key: bot_dir,
        "adapter_path": "",
        "napcat_path": "",
        "venv_path": "",
        "mongodb_path": "",
        "webui_path": "",
        "source": "import",
        "absolute_serial_number": config_manager.generate_unique_serial(),
    })
    config_manager.save()

    console.print(f"[green]✓ 实例已导入到 {extract_dir}，配置集名称：{cfg_key}[/green]")
    return extract_dir
