"""
mcsb 打包/导入子命令 CLI 入口
调用方式：python -m src.cli.mcsb_cli <args>
"""
import argparse
import os
import sys


def _parse_filter(filter_str: str, cfg: dict):
    """解析 -f 参数字符串，返回 PackFilter"""
    from src.cli.pack import PackFilter, list_components, list_plugins

    pf = PackFilter()
    if not filter_str:
        return pf

    items = [s.strip() for s in filter_str.split(",") if s.strip()]
    pending_components: list = []
    pending_plugins: list = []
    need_list_comp = False
    need_list_plug = False

    for item in items:
        if item == "!data":
            pf.no_data = True
        elif item == "!config":
            pf.no_config = True
        elif item == "!components":
            pf.no_components = True
        elif item == "!src":
            pf.no_src = True
        elif item == "!plugins":
            pf.no_plugins = True
        elif item == "!venv":
            pf.no_venv = True
        elif item == "!+venv":
            pf.no_venv = False
        elif item.startswith("--c{") and item.endswith("}"):
            names = [n.strip() for n in item[4:-1].split(",") if n.strip()]
            pending_components.extend(names)
        elif item.startswith("--p{") and item.endswith("}"):
            names = [n.strip() for n in item[4:-1].split(",") if n.strip()]
            pending_plugins.extend(names)
        elif item == "@components":
            need_list_comp = True
        elif item == "@plugins":
            need_list_plug = True

    if need_list_comp:
        available = list_components(cfg)
        if available:
            print("请输入要打包的组件序号（逗号分隔），留空表示全部，输入 ! 表示全不选：")
            choice = input("> ").strip()
            if choice == "!":
                pf.no_components = True
            elif choice:
                indices = [int(x.strip()) - 1 for x in choice.split(",") if x.strip().isdigit()]
                pending_components.extend(available[i] for i in indices if 0 <= i < len(available))

    if need_list_plug:
        available = list_plugins(cfg)
        if available:
            print("请输入要打包的插件序号（逗号分隔），留空表示全部，输入 ! 表示全不选：")
            choice = input("> ").strip()
            if choice == "!":
                pf.no_plugins = True
            elif choice:
                indices = [int(x.strip()) - 1 for x in choice.split(",") if x.strip().isdigit()]
                pending_plugins.extend(available[i] for i in indices if 0 <= i < len(available))

    if pending_components:
        pf.only_components = pending_components
    if pending_plugins:
        pf.only_plugins = pending_plugins

    return pf


def _resolve_output(serial: str, site: str | None, index: int) -> str:
    """根据 -s 参数和序号生成输出路径"""
    if not site:
        # 默认：实例目录同级
        from src.core.config import config_manager
        configs = config_manager.get_all_configurations()
        cfg = configs.get(serial)
        if cfg is None:
            for c in configs.values():
                if str(c.get("serial_number", "")) == str(serial):
                    cfg = c
                    break
        if cfg:
            from src.cli.pack import resolve_instance_dirs
            try:
                dirs = resolve_instance_dirs(cfg)
                parent = dirs["nickname_dir"].parent
            except Exception:
                parent = os.getcwd()
        else:
            parent = os.getcwd()
        return os.path.join(str(parent), f"{serial}.mcsins")

    # site 是目录
    if os.path.isdir(site) or (not site.lower().endswith(".mcsins") and not os.path.splitext(site)[1]):
        os.makedirs(site, exist_ok=True)
        fname = f"{serial}.mcsins" if index == 0 else f"{serial} ({index}).mcsins"
        return os.path.join(site, fname)

    # site 包含文件名
    if index == 0:
        return site
    base, ext = os.path.splitext(site)
    return f"{base} ({index}){ext}"


def cmd_pack(args):
    from src.cli.pack import check_github_auth, pack_instance
    from src.core.config import config_manager

    try:
        github_user = check_github_auth()
    except RuntimeError as e:
        print(f"[错误] {e}", file=sys.stderr)
        sys.exit(1)

    serials = [s.strip() for s in args.serials.split(",") if s.strip()]
    description = ""
    if args.des:
        if args.des.endswith(".md") and os.path.isfile(args.des):
            description = open(args.des, encoding="utf-8").read()
        else:
            description = args.des.replace("\\n", "\n")

    configs = config_manager.get_all_configurations()

    for idx, serial in enumerate(serials):
        cfg = configs.get(serial)
        if cfg is None:
            for c in configs.values():
                if str(c.get("serial_number", "")) == str(serial):
                    cfg = c
                    break
        if cfg is None:
            print(f"[错误] 实例 '{serial}' 未找到，已跳过", file=sys.stderr)
            continue

        pf = _parse_filter(args.filter or "", cfg)
        out = _resolve_output(serial, args.site, idx)
        print(f"正在打包实例 {serial!r} -> {out} ...")
        try:
            result = pack_instance(serial, pf, out, description, github_user)
            print(f"[完成] {result}")
        except Exception as e:
            print(f"[错误] 打包失败: {e}", file=sys.stderr)


def cmd_import(args):
    from src.cli.pack import import_instance
    dest = args.site or os.getcwd()
    try:
        import_instance(args.file, dest)
    except RuntimeError as e:
        print(f"[取消] {e}", file=sys.stderr)
        sys.exit(0)
    except Exception as e:
        print(f"[错误] 导入失败: {e}", file=sys.stderr)
        sys.exit(1)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="mcsb",
        description="MaiCoreStart 实例打包与导入工具",
        add_help=True,
    )
    sub = parser.add_subparsers(dest="command")

    # --- output / -o ---
    pack_p = sub.add_parser("output", aliases=["-o"], help="打包实例")
    pack_p.add_argument("serials", help="实例序列号，多个用逗号分隔")
    pack_p.add_argument("-f", "--filter", dest="filter", default=None, help="打包过滤参数")
    pack_p.add_argument("-s", "--site", dest="site", default=None, help="输出路径")
    pack_p.add_argument("-des", "--description", dest="des", default=None, help="描述文字或 .md 文件路径")
    pack_p.set_defaults(func=cmd_pack)

    # --- import / -in ---
    imp_p = sub.add_parser("import", aliases=["-in"], help="导入实例")
    imp_p.add_argument("file", help=".mcsins 文件路径")
    imp_p.add_argument("-s", "--site", dest="site", default=None, help="导入目标目录")
    imp_p.set_defaults(func=cmd_import)

    return parser


def main(argv=None):
    # argparse 不支持 "-o" 作为 subcommand alias，需要在解析前做映射
    if argv is None:
        argv = sys.argv[1:]

    # 将 "-o" 映射为 "output"，"-in" 映射为 "import"
    if argv and argv[0] in ("-o",):
        argv = ["output"] + argv[1:]
    elif argv and argv[0] in ("-in",):
        argv = ["import"] + argv[1:]

    parser = build_parser()
    args = parser.parse_args(argv)
    if not hasattr(args, "func"):
        parser.print_help()
        sys.exit(0)
    args.func(args)


if __name__ == "__main__":
    main()
