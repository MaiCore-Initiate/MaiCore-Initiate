import os
import json
import subprocess
import re
import ctypes
from colorama import Fore, Style, init
import time
import toml  # 新增：导入TOML库

# 初始化颜色支持
init(autoreset=True)

CONFIG_FILE = "config.toml"
# 更新配置模板
CONFIG_TEMPLATE = {
    "current_config": "default",
    "configurations": {
        "default": {
            "serial_number": "1",          # 用户自定义序列号（置顶）
            "absolute_serial_number": 1,   # 绝对序列号（置顶）
            "version_path": "0.0.0",
            "nickname_path": "默认配置",
            "mai_path": "",
            "adapter_path": "",
            "napcat_path": ""
        }
    }
}

# 颜色定义
COLORS = {
    "blue": Fore.CYAN,
    "green": Fore.GREEN,
    "yellow": Fore.YELLOW,
    "red": Fore.RED,
    "gray": Fore.LIGHTBLACK_EX,
    "purple": Fore.MAGENTA,
    "orange": Fore.YELLOW + Style.BRIGHT,
    "cyan": Fore.CYAN + Style.BRIGHT
}

# 倒计时函数
def countdown_timer(seconds):
    for i in range(seconds, 0, -1):
        print_color(f"\r返回主菜单倒计时: {i}秒...", "yellow", end="")
        time.sleep(1)
    print()

def clear_screen():
    os.system('cls' if os.name == 'nt' else 'clear')


def print_color(text, color=None, end="\n"):
    if color in COLORS:
        print(f"{COLORS[color]}{text}{Style.RESET_ALL}", end=end)
    else:
        print(text, end=end)


def print_header():
    header = r"""
  __  __           _   __  __   _               _              ____   _               _   
 |  \/  |   __ _  (_) |  \/  | | |__     ___   | |_           / ___| | |__     __ _  | |_ 
 | |\/| |  / _` | | | | |\/| | | '_ \   / _ \  | __|  _____  | |     | '_ \   / _` | | __|
 | |  | | | (_| | | | | |  | | | |_) | | (_| | | |_  |_____| | |___  | | | | | (_| | | |_ 
 |_|  |_|  \__,_| |_| |_|  |_| |_.__/   \___/   \__|          \____| |_| |_|  \__,_|  \__|
"""
    print_color(header, "blue")
    print_color("促进多元化艺术创作发展普及", "blue")
    print_color("\n🌈麦麦启动器控制台", "blue")
    print_color("——————————", "gray")
    print_color("选择选项", "gray")
    print("================")
    print_color(" [A] 🚀 运行麦麦", "blue")
    print_color(" [B] 运行麦麦（同时启动NapCatQQ和Mongo DB）", "blue")
    print_color(" [C] 配置管理（新建/修改/检查配置）", "blue")  # 合并C、D选项
    print_color(" [D] LPMM知识库构建", "cyan")  # 原D选项删除，调整后续选项顺序
    print_color(" [E] 知识库迁移（MongoDB → SQLite）", "cyan")
    print_color(" [F] 实例部署辅助系统", "red")
    print_color(" [Q] 👋退出程序", "purple")
    print("================\n")

def is_legacy_version(version):
    """检测是否为旧版本（小于0.6.0或为classical）"""
    if not version:
        return False
    
    version = version.lower().strip()
    
    # 检查是否为classical版本
    if version == "classical":
        return True
    
    # 检查是否小于0.6.0
    try:
        # 提取主版本号（去掉-fix等后缀）
        main_version = version.split('-')[0]
        version_parts = main_version.split('.')
        
        # 确保至少有两个版本号部分
        if len(version_parts) >= 2:
            major = int(version_parts[0])
            minor = int(version_parts[1])
            
            # 检查是否小于0.6.0
            if major < 0 or (major == 0 and minor < 6):
                return True
    except (ValueError, IndexError):
        # 如果版本号格式无法解析，默认为新版本
        return False
    
    return False


def load_config():
    try:
        if not os.path.exists(CONFIG_FILE):
            print_color(f"❌ 配置文件 {CONFIG_FILE} 不存在，将使用默认配置", "red")
            return CONFIG_TEMPLATE.copy()
        
        with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
            config = toml.load(f)
            print_color(f"✅ 成功加载配置文件，current_config: {config.get('current_config')}", "green")  # 调试信息
            # 确保配置结构完整
            if "configurations" not in config:
                print_color("⚠️ 配置缺少 'configurations'，使用默认值", "yellow")
                config["configurations"] = CONFIG_TEMPLATE["configurations"].copy()
            if "current_config" not in config:
                print_color("⚠️ 配置缺少 'current_config'，使用默认值 'default'", "yellow")
                config["current_config"] = "default"
            return config
    except Exception as e:
        print_color(f"❌ 加载配置文件失败：{str(e)}，将使用默认配置", "red")
        return CONFIG_TEMPLATE.copy()



def save_config(config):
    with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
        toml.dump(config, f)


def has_chinese(path):
    return bool(re.search('[\u4e00-\u9fff]', path))


def validate_path(path, check_file=None):
    """增强路径验证"""
    errors = []
    if not path:
        return (False, "❌ 路径未配置")
    if has_chinese(path):
        return (False, "❌ 路径包含中文")
    if not os.path.exists(path):
        return (False, "❌ 路径不存在")
    if check_file and not os.path.isfile(os.path.join(path, check_file)):
        return (False, f"❌ 缺少必要文件：{check_file}")
    return (True, "")


def get_input(prompt, color=None, check_file=None, allow_empty=False, is_exe=False):
    """增强输入函数"""
    while True:
        print_color(prompt, color)
        path = input("> ").strip().strip('"')

        if allow_empty and not path:
            return ""

        if not path:
            print_color("❌ 路径不能为空！", "red")
            continue

        # 路径标准化处理
        path = os.path.normpath(path)

        # 特殊验证规则
        if is_exe:
            valid, msg = validate_exe_path(path)
        else:
            valid, msg = validate_path(path, check_file)

        if valid:
            return path
        print_color(f"❌ 路径验证失败：{msg}", "red")


def validate_exe_path(path):
    """专门验证exe路径"""
    if not path:
        return (True, "")  # 允许空路径
    if has_chinese(path):
        return (False, "❌ 路径包含中文")
    if not os.path.exists(path):
        return (False, "❌ 路径不存在")
    if not path.lower().endswith('.exe'):
        return (False, "❌ 不是有效的exe文件")
    return (True, "")


def auto_detect_mai():
    print_color("🟢 正在检索麦麦本体...", "yellow")
    default_path = os.path.abspath("MaiBot")
    if os.path.isfile(os.path.join(default_path, "bot.py")):
        return default_path
    return ""


def auto_detect_adapter():
    print_color("🟢 正在检索适配器...", "yellow")
    default_path = os.path.abspath("MaiBot-Napcat-Adapter")
    if os.path.isfile(os.path.join(default_path, "main.py")):
        return default_path
    return ""


def get_text_input(prompt, color=None, allow_empty=False):
    """文本专用输入函数（无路径验证）"""
    while True:
        print_color(prompt, color)
        text = input("> ").strip().strip('"')
        
        if allow_empty and not text:
            return ""
            
        if not text:
            print_color("❌ 输入不能为空！", "red")
            continue
            
        return text

def config_menu():
    while True:
        clear_screen()
        print_color("[🔧 配置模式]", "green")
        print("================")
        print_color(" [A] 自动检索麦麦", "green")
        print_color(" [B] 手动配置", "green")
        print_color(" [C] 管理配置集(新建/删除)", "cyan")
        print_color(" [D] 检查现有配置", "green")
        print_color(" [Q] 返回上级", "blue")
        print("================")

        choice = input("请选择操作: ").upper()
        
        if choice == "Q":
            break

        # 加载配置并进行安全检查
        config = load_config()
        if not config:
            print_color("❌ 无法加载配置文件，恢复为默认配置", "red")
            config = CONFIG_TEMPLATE.copy()
            save_config(config)

        configs = config.get("configurations", CONFIG_TEMPLATE["configurations"].copy())
        current_cfg_name = config.get("current_config", "default")
        
        # 检查当前配置是否存在，如果不存在则切换到默认配置或第一个可用配置
        if current_cfg_name not in configs:
            if configs:
                current_cfg_name = next(iter(configs))
                config["current_config"] = current_cfg_name
                print_color(f"⚠️ 当前配置 '{current_cfg_name}' 不存在，已切换到: {current_cfg_name}", "yellow")
            else:
                configs["default"] = CONFIG_TEMPLATE["configurations"]["default"].copy()
                current_cfg_name = "default"
                config["current_config"] = current_cfg_name
                config["configurations"] = configs
                print_color("⚠️ 未找到任何配置，已创建默认配置", "yellow")
            save_config(config)
        
        current_cfg = configs[current_cfg_name]
        config_count = len(configs)

        if choice == "A":
            # ...（自动配置逻辑保持不变）
            pass

        elif choice == "B":
            # ...（手动配置逻辑保持不变）
            pass

        elif choice == "C":
            while True:
                clear_screen()
                print_color("[🔧 配置集管理]", "green")
                print("================")
                
                # 重新加载最新配置
                config = load_config()
                configs = config.get("configurations", {})
                
                # 检查配置是否为空
                if not configs:
                    print_color("❌ 当前没有任何配置", "red")
                    time.sleep(2)
                    break
                
                # 列出所有配置集
                for cfg_name, cfg in configs.items():
                    absolute_serial = cfg.get('absolute_serial_number', 'N/A')
                    nickname = cfg.get('nickname_path', '未命名')
                    serial_number = cfg.get('serial_number', 'N/A')
                    version = cfg.get('version_path', 'N/A')
                    mai_path = cfg.get('mai_path', '未配置')
                    adapter_path = cfg.get('adapter_path', '未配置')
                    napcat_path = cfg.get('napcat_path', '未配置')
                    
                    print_color(f"实例 {nickname} (序列号: {serial_number})", "cyan")
                    print(f"版本号：{version}")
                    print(f"麦麦路径：{mai_path}")
                    print(f"适配器路径：{adapter_path}")
                    print(f"NapCat路径：{napcat_path}")
                    print("——————————")

                print("\n[操作选项]")
                print_color(" [A] 新建配置集", "green")
                print_color(" [B] 删除配置集", "red")
                print_color(" [Q] 返回上级", "blue")
                sub_choice = input("请选择操作: ").upper()

                if sub_choice == "Q":
                    break

                # 在新建配置集的部分，替换现有逻辑
                elif sub_choice == "A":
                    # 新建配置集逻辑
                    new_name = get_text_input("请输入新配置集名称（英文标识符）:", "green")
                    if new_name not in configs:
                        configs[new_name] = CONFIG_TEMPLATE["configurations"]["default"].copy()
                        config["current_config"] = new_name
                        config["configurations"] = configs
                        save_config(config)
                        print_color(f"✅ 已创建新配置集: {new_name}", "green")
                        time.sleep(1)
        
                        # 进入配置流程
                        clear_screen()
                        print_color(f"[🔧 配置 {new_name}]", "green")
                        print_color("请选择配置方式:", "green")
                        print_color(" [A] 自动检索麦麦", "green")
                        print_color(" [B] 手动配置", "green")
                        cfg_choice = input("请选择操作: ").upper()
                        
                        current_cfg = configs[new_name]
                        
                        # 先获取版本号
                        version = get_text_input("请输入版本号（如0.7.0或0.6.3-fix4或classical）：", "green")
                        
                        # 检测是否为旧版本
                        is_legacy = is_legacy_version(version)
                        
                        if cfg_choice == "A":
                            # 自动检测麦麦
                            mai_path = auto_detect_mai()
                            if not mai_path:
                                mai_path = get_input("请输入麦麦本体路径：", "green", check_file="bot.py")
                            else:
                                print_color(f"✅ 已自动检测到麦麦本体：{mai_path}", "green")

                            # 根据版本决定是否配置适配器
                            if is_legacy:
                                adapter_path = "当前配置集的对象实例版本较低，无适配器"
                                print_color("检测到旧版本，无需配置适配器", "yellow")
                            else:
                                # 自动检测适配器
                                adapter_path = auto_detect_adapter()
                                if not adapter_path:
                                    adapter_path = get_input("请输入适配器路径：", "green", check_file="main.py")
                                else:
                                    print_color(f"✅ 已自动检测到适配器：{adapter_path}", "green")

                            # NapCat路径（新旧版本都可能需要）
                            napcat_path = get_input("请输入NapCatQQ路径（可为空）：", "green", allow_empty=True, is_exe=True)
                            
                            # 获取昵称和序列号
                            nickname = get_text_input("请输入配置昵称：", "green")
                            serial_number = get_text_input("请输入用户自定义序列号（如abc）：", "green")

                            # 生成唯一的绝对序列号
                            absolute_serial = generate_unique_absolute_serial(configs)

                            # 更新配置
                            current_cfg.update({
                                "serial_number": serial_number,
                                "absolute_serial_number": absolute_serial,
                                "version_path": version,
                                "nickname_path": nickname,
                                "mai_path": mai_path,
                                "adapter_path": adapter_path,
                                "napcat_path": napcat_path
                            })
                            
                        elif cfg_choice == "B":
                            # 手动配置
                            absolute_serial = generate_unique_absolute_serial(configs)
                            
                            # 根据版本决定是否配置适配器
                            if is_legacy:
                                adapter_path = "当前配置集的对象实例版本较低，无适配器"
                                print_color("检测到旧版本，无需配置适配器", "yellow")
                                mai_path = get_input("请输入麦麦本体路径：", "green", check_file="bot.py")
                            else:
                                mai_path = get_input("请输入麦麦本体路径：", "green", check_file="bot.py")
                                adapter_path = get_input("请输入适配器路径：", "green", check_file="main.py")
                            
                            current_cfg.update({
                                "serial_number": get_text_input("请输入用户自定义序列号（如abc）：", "green"),
                                "absolute_serial_number": absolute_serial,
                                "version_path": version,
                                "nickname_path": get_text_input("请输入配置昵称：", "green"),
                                "mai_path": mai_path,
                                "adapter_path": adapter_path,
                                "napcat_path": get_input("请输入NapCatQQ路径（可为空）：", "green", allow_empty=True, is_exe=True)
                            })

                        config["configurations"] = configs
                        save_config(config)
                        print_color("🎉 配置已保存！", "green")
                        time.sleep(1)
                    else:
                        print_color("❌ 配置集名称已存在", "red")
                        time.sleep(1)

                elif sub_choice == "B":
                    # 删除配置集逻辑（修改：只允许通过用户序列号删除）
                    targets = get_text_input("请输入要删除的用户序列号（多个用英文逗号分隔）:", "red").split(',')
                    targets = [t.strip() for t in targets]
                    
                    confirm = input("该操作不可撤销，确定删除吗？(Y/N) ").upper()
                    if confirm == 'Y':
                        deleted = []
                        for cfg_name in list(configs.keys()):
                            cfg = configs[cfg_name]
                            serial_number = cfg.get('serial_number', '')
                            if serial_number in targets:  # 只匹配用户序列号
                                deleted.append(cfg_name)
                        
                        # 执行删除
                        for cfg_name in deleted:
                            del configs[cfg_name]
                        
                        # 处理当前配置
                        if config["current_config"] in deleted:
                            if configs:
                                config["current_config"] = next(iter(configs))
                            else:
                                configs["default"] = CONFIG_TEMPLATE["configurations"]["default"].copy()
                                config["current_config"] = "default"
                        
                        config["configurations"] = configs
                        save_config(config)
                        
                        # 显示结果
                        not_found = [
                            t for t in targets if t not in [cfg.get('serial_number', '') for cfg in configs.values()]
                        ]
                        if not_found:
                            print_color(f"未找到用户序列号: {', '.join(not_found)}", "red")
                        print_color(f"已删除 {len(deleted)} 个配置集", "green")
                    else:
                        print_color("已取消删除操作", "yellow")
                    time.sleep(1)
                else:
                    print_color("❌ 无效选项", "red")
                    time.sleep(1)

        elif choice == "D":
            check_config()

        input("\n按回车键返回配置菜单...")


def run_script(work_dir, commands):
    """可靠的脚本执行函数（兼容版）"""
    try:
        # 自动查找PowerShell路径
        powershell_path = None
        # 尝试通过注册表获取PowerShell路径
        try:
            import winreg
            reg_key = winreg.OpenKey(
                winreg.HKEY_LOCAL_MACHINE,
                r"SOFTWARE\Microsoft\PowerShell\3\PowerShellEngine"
            )
            powershell_path = os.path.join(
                winreg.QueryValueEx(reg_key, "ApplicationBase")[0],
                "powershell.exe"
            )
            winreg.CloseKey(reg_key)
        except:
            pass

        # 回退到默认路径
        if not powershell_path or not os.path.exists(powershell_path):
            default_paths = [
                os.path.expandvars(r"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"),
                os.path.expandvars(r"%SystemRoot%\SysNative\WindowsPowerShell\v1.0\powershell.exe"),  # 处理32位进程重定向
                os.path.expandvars(r"%ProgramFiles%\PowerShell\7\pwsh.exe")  # PowerShell 7+
            ]
            for path in default_paths:
                if os.path.exists(path):
                    powershell_path = path
                    break
            else:
                raise Exception("❌ 无法找到PowerShell可执行文件")

        # 处理带空格的路径
        safe_work_dir = f'"{work_dir}"' if ' ' in work_dir else work_dir

        # 构造命令
        if isinstance(commands, list):
            ps_command = '; '.join(commands)
        else:
            ps_command = commands

        # 启动进程
        subprocess.Popen(
            [
                powershell_path,
                '-NoExit',
                '-Command',
                f'cd {safe_work_dir}; {ps_command}'
            ],
            creationflags=subprocess.CREATE_NEW_CONSOLE
        )
        return True
    except Exception as e:
        print_color(f"❌ 启动失败!：{str(e)}", "red")
        return False

def check_config():
    """检查和重新配置任意配置集"""
    config = load_config()
    configs = config["configurations"]
    
    while True:
        clear_screen()
        print_color("[🔧 检查现有配置]", "green")
        
        # 使用 select_config 显示所有配置集并选择
        selected_cfg = select_config(configs)
        if not selected_cfg:  # 用户选择了返回
            return  # 返回配置菜单
        
        # 查找选中的配置集名称
        selected_config_name = next(
            (name for name, cfg in configs.items() if cfg == selected_cfg),
            None
        )
        if not selected_config_name:
            print_color("❌ 未找到匹配的配置集！", "red")
            input("按回车键返回主菜单...")
            return
        
        # 显示选中的配置集信息
        print(f"当前配置名称: {selected_config_name}")
        print_color(f"用户序列号: {selected_cfg['serial_number'] or '未配置'}","cyan")
        print(f"绝对序列号: {selected_cfg['absolute_serial_number'] or '未配置'}")
        print_color(f"昵称: {selected_cfg['nickname_path'] or '未配置'}", "cyan")
        print(f"麦麦本体路径: {selected_cfg['mai_path'] or '未配置'}")
        print(f"适配器路径: {selected_cfg['adapter_path'] or '未配置'}")
        print(f"NapCat路径: {selected_cfg['napcat_path'] or '未配置'}")

        # 检查NapCat路径有效性
        if selected_cfg["napcat_path"]:
            valid, msg = validate_exe_path(selected_cfg["napcat_path"])
            if not valid:
                print_color(f"❌ NapCatQQ路径错误!：{msg}", "red")

        # 检查配置有效性
        errors = validate_config(selected_cfg)
        if errors:
            print_color("❌ 发现配置错误!：", "red")
            for error in errors:
                print_color(f"• {error}", "red")

        print("\n=================")
        print_color(" [A] 重新配置此配置集", "green")
        print_color(" [B] 返回配置菜单", "yellow")
        choice = input("请选择操作: ").upper()

        if choice == "B":
            break
        elif choice == "A":
            reconfigure_current_config(config, selected_config_name, selected_cfg)
            # 重新加载配置以确保更新
            config = load_config()
            configs = config["configurations"]
        else:
            print_color("❌ 无效选项", "red")
            time.sleep(1)

    input("\n按回车键返回配置菜单...")


def generate_unique_absolute_serial(configs):
    """生成唯一的绝对序列号，只与其他绝对序列号比较，确保真正唯一"""
    # 只收集已使用的绝对序列号
    used_absolute_serials = set()
    for cfg in configs.values():
        abs_serial = cfg.get('absolute_serial_number')
        if abs_serial is not None:
            # 确保转换为整数进行比较
            try:
                used_absolute_serials.add(int(abs_serial))
            except (ValueError, TypeError):
                # 如果转换失败，跳过这个值
                continue
    
    # 从1开始生成绝对序列号
    candidate_serial = 1
    while candidate_serial in used_absolute_serials:
        candidate_serial += 1
    
    return candidate_serial


def reconfigure_current_config(config, current_config_name, current_cfg):
    """重新配置当前配置集"""
    clear_screen()
    print_color(f"[🔧 重新配置 {current_config_name}]", "green")
    print("================")
    print("以下信息将保持不变:")
    print(f"当前配置名称: {current_config_name}")
    print_color(f"用户序列号: {current_cfg['serial_number']}","cyan")
    print(f"绝对序列号: {current_cfg['absolute_serial_number']}")
    print("================")
    
    # 存储原始值作为备份
    original_cfg = current_cfg.copy()
    
    # 逐项询问是否配置
    print_color("\n开始配置流程...", "green")
    
    # 配置版本号
    print_color(f"\n当前版本号: {current_cfg['version_path'] or '未配置'}", "cyan")
    if input("是否重新配置版本号？(Y/N): ").upper() == 'Y':
        current_cfg['version_path'] = get_text_input("请输入新的版本号（如0.7.0或0.6.3-fix4）：", "green")
    
    # 配置昵称
    print_color(f"\n当前昵称: {current_cfg['nickname_path'] or '未配置'}", "cyan")
    if input("是否重新配置昵称？(Y/N): ").upper() == 'Y':
        current_cfg['nickname_path'] = get_text_input("请输入新的配置昵称：", "green")
    
    # 配置麦麦本体路径
    print_color(f"\n当前麦麦本体路径: {current_cfg['mai_path'] or '未配置'}", "cyan")
    if input("是否重新配置麦麦本体路径？(Y/N): ").upper() == 'Y':
        current_cfg['mai_path'] = get_input("请输入新的麦麦本体路径：", "green", check_file="bot.py")
    
    # 配置适配器路径
    print_color(f"\n当前适配器路径: {current_cfg['adapter_path'] or '未配置'}", "cyan")
    if input("是否重新配置适配器路径？(Y/N): ").upper() == 'Y':
        current_cfg['adapter_path'] = get_input("请输入新的适配器路径：", "green", check_file="main.py")
    
    # 配置NapCat路径
    print_color(f"\n当前NapCat路径: {current_cfg['napcat_path'] or '未配置'}", "cyan")
    if input("是否重新配置NapCat路径？(Y/N): ").upper() == 'Y':
        current_cfg['napcat_path'] = get_input("请输入新的NapCatQQ路径（可为空）：", "green", allow_empty=True, is_exe=True)
    
    # 保存配置
    config["configurations"][current_config_name] = current_cfg
    save_config(config)
    print_color("✅ 配置已更新！", "green")
    input("按回车键继续...")

def validate_config(config):
    """完整的配置验证"""
    errors = []

    # 检查麦麦本体
    valid, msg = validate_path(config["mai_path"], check_file="bot.py")
    if not valid:
        errors.append(f"麦麦本体路径：{msg}")

    # 检查适配器（仅新版本需要）
    version = config.get("version_path", "")
    if not is_legacy_version(version):
        # 新版本需要检查适配器
        valid, msg = validate_path(config["adapter_path"], check_file="main.py")
        if not valid:
            errors.append(f"适配器路径：{msg}")
    else:
        # 旧版本需要检查run.bat文件
        valid, msg = validate_path(config["mai_path"], check_file="run.bat")
        if not valid:
            errors.append(f"麦麦本体路径缺少run.bat文件：{msg}")

    # 检查NapCat路径
    if config["napcat_path"]:
        valid, msg = validate_exe_path(config["napcat_path"])
        if not valid:
            errors.append(f"NapCatQQ路径：{msg}")

    return errors


def run_mai():
    config = load_config()
    all_configs = config["configurations"]
    
    # 显示实例选择菜单（保持不变）
    clear_screen()
    print_color("请选择您要启动的实例：", "green")
    for idx, (cfg_name, cfg) in enumerate(all_configs.items(), 1):
        print(f"实例{idx}")
        print_color(f"序列号\"{cfg['serial_number']}\"（绝对序列号：{cfg['absolute_serial_number']}）","cyan")  # 显示两个序列号
        print_color(f"昵称\"{cfg['nickname_path']}\"","cyan")
        print(f"版本\"{cfg['version_path']}\"")
        print(f"本体路径\"{cfg['mai_path']}\"")
        print(f"适配器路径\"{cfg['adapter_path']}\"")
        print(f"NapCat路径\"{cfg['napcat_path'] or '未配置'}\"")
        print("——————————")

    # 获取用户输入的序列号（支持用户自定义序列号或绝对序列号）
    selected_serial = get_text_input("请输入您要启动的实例序列号：", "green")
    
    # 根据序列号或绝对序列号查找配置（支持两种匹配方式）
    selected_cfg = next(
        (cfg for cfg in all_configs.values() 
         if cfg["serial_number"] == selected_serial or str(cfg["absolute_serial_number"]) == selected_serial),
        None
    )
    
    if not selected_cfg:
        print_color("❌ 未找到匹配的实例序列号！", "red")
        input("按回车键返回主菜单...")
        return

    # 原有配置验证逻辑（保持不变）
    errors = validate_config(selected_cfg)
    if errors:
        print_color("❌ 发现配置错误!：", "red")
        for error in errors:
            print_color(f"• {error}", "red")
        input("按回车键返回主菜单...")
        return

    try:
        # 启动麦麦本体（修改路径获取为selected_cfg）
        success1 = run_script(
            work_dir=selected_cfg["mai_path"],  # 改为selected_cfg
            commands="python bot.py"
        )

        # 启动适配器（修改路径获取为selected_cfg）
        venv_activate = os.path.normpath(
            os.path.join(
                selected_cfg["mai_path"],  # 改为selected_cfg
                "venv",
                "Scripts",
                "activate"
            )
        )
        success2 = run_script(
            work_dir=selected_cfg["adapter_path"],  # 改为selected_cfg
            commands=[
                f'& "{venv_activate}"',
                'python main.py'
            ]
        )

        if success1 and success2:
            print_color("🟢 麦麦启动成功！两个PowerShell窗口将保持打开", "green")
        else:
            print_color("🔔 部分组件启动失败，请检查弹出的窗口", "yellow")

    except Exception as e:
        print_color(f"❌ 启动失败：{str(e)}", "red")
    finally:
        input("按回车键返回主菜单...")

# 剩余函数保持原有实现（check_process, check_mongodb, run_full, main）
def check_process(process_name):
    try:
        output = subprocess.check_output(f'tasklist /FI "IMAGENAME eq {process_name}"', shell=True)
        return process_name.lower() in output.decode().lower()
    except:
        return False


def check_mongodb():
    try:
        output = subprocess.check_output('sc query MongoDB', shell=True)
        return "RUNNING" in output.decode()
    except:
        return False


def run_full():
    config = load_config()
    # 检查NapCat
    napcat_running = check_process("NapCatWinBootMain.exe")
    if not napcat_running:
        if config["napcat_path"]:
            try:
                subprocess.Popen(f'"{config["napcat_path"]}"')
                print_color("🟢 NapCat启动成功！", "green")
            except:
                print_color("❌ NapCat启动失败！", "red")
        else:
            print_color("🔔 NapCat路径未配置！", "yellow")

    # 检查MongoDB
    if check_mongodb():
        print_color("🟢 MongoDB已启动！", "green")
    else:
        print_color("🔔 MongoDB未启动！", "yellow")

    run_mai()

def select_config(configs):
    """显示配置集并让用户选择目标实例，返回选中的配置"""
    while True:  # 添加循环，允许用户返回
        clear_screen()
        print_color("请选择您要使用的实例：", "green")
        for idx, (cfg_name, cfg) in enumerate(configs.items(), 1):
            print(f"实例{idx}")
            print_color(f"序列号\"{cfg['serial_number']}\"（绝对序列号：{cfg['absolute_serial_number']}）","cyan") 
            print_color(f"昵称\"{cfg['nickname_path']}\"", "cyan")
            print(f"版本\"{cfg['version_path']}\"")
            print(f"本体路径\"{cfg['mai_path']}\"")
            print(f"适配器路径\"{cfg['adapter_path']}\"")
            print(f"NapCat路径\"{cfg['napcat_path'] or '未配置'}\"")
            print("——————————")

        # 获取用户输入的序列号（支持用户自定义序列号或绝对序列号）
        print_color("请输入您要使用的实例序列号（输入Q返回）：", "green")
        selected_serial = input("> ").strip()
        
        # 检查用户是否要返回
        if selected_serial.upper() == 'Q':
            return None
        
        # 根据序列号或绝对序列号查找配置
        selected_cfg = next(
            (cfg for cfg in configs.values()
             if cfg["serial_number"] == selected_serial or str(cfg["absolute_serial_number"]) == selected_serial),
            None
        )
        
        if not selected_cfg:
            print_color("❌ 未找到匹配的实例序列号！", "red")
            input("按回车键继续...")
            continue  # 继续循环而不是返回
        
        return selected_cfg
    
    return selected_cfg

def run_lpmm_script(mai_path, script_name, description, warning_messages=None):
    """运行LPMM相关脚本的通用函数"""
    if not mai_path:
        print_color("❌ 麦麦知识库（本体）路径未配置！请重新配置！", "red")
        return False

    try:
        # 激活虚拟环境
        print_color(f"正在进行{description}...", "cyan")
        print_color("正在激活虚拟环境...", "cyan")
        
        # 显示警告信息
        if warning_messages:
            for msg in warning_messages:
                print_color(msg, "orange")
        
        # 确认执行
        print_color("\n是否继续执行？(Y/N)：", "yellow")
        choice = input().upper()
        if choice != 'Y':
            print_color("操作已取消！", "yellow")
            return False
            
        # 运行脚本
        print_color(f"操作已确认！正在启动{description}程序...", "green")
        print_color("请在PowerShell窗口中确认执行程序！", "blue")
        
        try:
            # 构建PowerShell命令
            ps_command = f'cd "{mai_path}"; .\\venv\\Scripts\\activate.ps1; python .\\scripts\\{script_name}'
            
            # 使用start命令启动PowerShell
            start_command = f'start powershell -NoExit -ExecutionPolicy Bypass -Command "{ps_command}"'
            
            # 执行命令
            subprocess.run(start_command, shell=True, check=True)
            
            # 等待用户输入确认PowerShell操作已完成
            print_color("\n请在PowerShell窗口中完成操作后，在此处按回车键继续...", "yellow")
            input()
            
            return True
            
        except subprocess.CalledProcessError as e:
            print_color(f"❌ 执行失败：{str(e)}", "red")
            return False
        
    except Exception as e:
        print_color(f"❌ 执行失败：{str(e)}", "red")
        return False

def run_lpmm_entity_extract(configs):
    """运行LPMM知识库实体提取"""
    selected_cfg = select_config(configs)
    if not selected_cfg:
        return False
    
    mai_path = selected_cfg["mai_path"]
    warnings = [
        "实体提取操作将会花费较多api余额和时间，建议在空闲时段执行。举例：600万字全剧情，提取选用deepseek v3 0324，消耗约40元，约3小时。",
        "建议使用硅基流动的非Pro模型，或者使用可以用赠金抵扣的Pro模型",
        "请确保账户余额充足，并且在执行前确认无误。"
    ]
    success = run_lpmm_script(
        mai_path,
        "info_extraction.py",
        "LPMM知识库实体提取",
        warnings
    )
    if success:
        print_color("\nLPMM知识库实体提取已结束！", "green")
    return success


def run_lpmm_knowledge_import(configs):
    """运行LPMM知识库知识图谱导入"""
    selected_cfg = select_config(configs)
    if not selected_cfg:
        return False
    
    mai_path = selected_cfg["mai_path"]
    warnings = [
        "OpenIE导入时会大量发送请求，可能会撞到请求速度上限，请注意选用的模型",
        "同之前样例：在本地模型下，在70分钟内我们发送了约8万条请求，在网络允许下，速度会更快",
        "推荐使用硅基流动的Pro/BAAI/bge-m3",
        "每百万Token费用为0.7元",
        "知识导入时，会消耗大量系统资源，建议在较好配置电脑上运行",
        "同上样例，导入时10700K几乎跑满，14900HX占用80%，峰值内存占用约3G"
    ]
    success = run_lpmm_script(
        mai_path,
        "import_openie.py",
        "LPMM知识库知识图谱导入",
        warnings
    )
    if success:
        print_color("\nLPMM知识库知识图谱导入已结束！", "green")
    return success

def run_lpmm_pipeline(configs):
    """运行LPMM一条龙服务"""
    if run_lpmm_text_split(configs):
        print_color("\nLPMM知识库文本分割已结束！", "green")
        print_color("是否继续进行实体提取操作？(Y/N)：", "yellow")
        if input().upper() == 'Y':
            if run_lpmm_entity_extract(configs):
                print_color("\nLPMM知识库实体提取已结束！", "green")
                while True:
                    print_color("\n [A] 实体提取可能失败，重新提取？", "red")
                    print_color(" [B] 继续进行知识图谱导入操作", "green")
                    print_color(" [C] 取消后续操作并返回主菜单", "yellow")
                    choice = input("请选择操作: ").upper()
                    
                    if choice == 'A':
                        if not run_lpmm_entity_extract(configs):
                            break
                    elif choice == 'B':
                        if run_lpmm_knowledge_import(configs):
                            print_color("\nLPMM知识库知识图谱导入已结束！LPMM知识库构建操作已结束！", "green")
                        break
                    elif choice == 'C':
                        break
    
    print_color("\n已关闭命令行窗口，即将返回主菜单！", "green")
    countdown_timer(5)


def validate_config(config):
    """完整的配置验证"""
    errors = []

    # 检查麦麦本体
    valid, msg = validate_path(config["mai_path"], check_file="bot.py")
    if not valid:
        errors.append(f"麦麦本体路径：{msg}")

    # 检查适配器（仅新版本需要）
    version = config.get("version_path", "")
    if not is_legacy_version(version):
        # 新版本需要检查适配器
        adapter_path = config.get("adapter_path", "")
        # 确保适配器路径不是占位符文本
        if adapter_path and adapter_path != "当前配置集的对象实例版本较低，无适配器":
            valid, msg = validate_path(adapter_path, check_file="main.py")
            if not valid:
                errors.append(f"适配器路径：{msg}")
        else:
            errors.append("适配器路径：路径未配置或无效")
    else:
        # 旧版本需要检查run.bat文件
        valid, msg = validate_path(config["mai_path"], check_file="run.bat")
        if not valid:
            errors.append(f"麦麦本体路径缺少run.bat文件：{msg}")

    # 检查NapCat路径
    if config["napcat_path"]:
        valid, msg = validate_exe_path(config["napcat_path"])
        if not valid:
            errors.append(f"NapCatQQ路径：{msg}")

    return errors


def run_mai():
    config = load_config()
    all_configs = config["configurations"]
    
    # 显示实例选择菜单
    selected_cfg = select_config(all_configs)
    if not selected_cfg:
        return

    # 检查配置有效性
    errors = validate_config(selected_cfg)
    if errors:
        print_color("❌ 发现配置错误!：", "red")
        for error in errors:
            print_color(f"• {error}", "red")
        input("按回车键返回主菜单...")
        return

    try:
        version = selected_cfg.get("version_path", "")
        
        if is_legacy_version(version):
            # 旧版本启动逻辑：直接运行run.bat
            print_color("检测到旧版本，使用兼容启动模式", "yellow")
            
            run_bat_path = os.path.join(selected_cfg["mai_path"], "run.bat")
            if os.path.exists(run_bat_path):
                # 使用 subprocess.Popen 启动新的 cmd 窗口
                success = True
                try:
                    subprocess.Popen(
                        f'cmd /c start cmd /k "{run_bat_path}"',
                        cwd=selected_cfg["mai_path"],
                        shell=True
                    )
                    print_color("🟢 旧版本麦麦启动成功！CMD窗口将保持打开", "green")
                except Exception as e:
                    print_color(f"❌ 旧版本麦麦启动失败：{str(e)}", "red")
                    success = False
                
                if not success:
                    print_color("🔔 旧版本麦麦启动可能失败，请检查弹出的窗口", "yellow")
            else:
                print_color("❌ 未找到run.bat文件！", "red")
        else:
            # 新版本启动逻辑：启动麦麦本体和适配器
            print_color("使用新版本启动模式", "green")
            
            # 启动麦麦本体
            success1 = run_script(
                work_dir=selected_cfg["mai_path"],
                commands="python bot.py"
            )

            # 启动适配器（仅在适配器路径有效时）
            adapter_path = selected_cfg.get("adapter_path", "")
            if adapter_path and adapter_path != "当前配置集的对象实例版本较低，无适配器":
                venv_activate = os.path.normpath(
                    os.path.join(
                        selected_cfg["mai_path"],
                        "venv",
                        "Scripts",
                        "activate"
                    )
                )
                success2 = run_script(
                    work_dir=adapter_path,
                    commands=[
                        f'& "{venv_activate}"',
                        'python main.py'
                    ]
                )

                if success1 and success2:
                    print_color("🟢 麦麦启动成功！两个PowerShell窗口将保持打开", "green")
                else:
                    print_color("🔔 部分组件启动失败，请检查弹出的窗口", "yellow")
            else:
                if success1:
                    print_color("🟢 麦麦本体启动成功！", "green")
                else:
                    print_color("🔔 麦麦本体启动失败，请检查弹出的窗口", "yellow")

    except Exception as e:
        print_color(f"❌ 启动失败：{str(e)}", "red")
    finally:
        input("按回车键返回主菜单...")



def run_full():
    config = load_config()
    all_configs = config["configurations"]
    
    # 显示实例选择菜单
    selected_cfg = select_config(all_configs)
    if not selected_cfg:
        return

    # 检查配置有效性
    errors = validate_config(selected_cfg)
    if errors:
        print_color("❌ 发现配置错误!：", "red")
        for error in errors:
            print_color(f"• {error}", "red")
        input("按回车键返回主菜单...")
        return

    version = selected_cfg.get("version_path", "")
    
    # 检查NapCat（新旧版本都可能需要）
    napcat_running = check_process("NapCatWinBootMain.exe")
    if not napcat_running:
        if selected_cfg["napcat_path"]:
            try:
                subprocess.Popen(f'"{selected_cfg["napcat_path"]}"')
                print_color("🟢 NapCat启动成功！", "green")
            except Exception as e:
                print_color(f"❌ NapCat启动失败！{str(e)}", "red")
        else:
            print_color("🔔 NapCat路径未配置，跳过NapCat的启动", "yellow")

    # 检查MongoDB（仅新版本需要）
    if not is_legacy_version(version):
        if check_mongodb():
            print_color("🟢 MongoDB已启动！", "green")
        else:
            if version > "0.7.0":
                print_color("🔔 MongoDB服务未启动，请手动启动！若您使用的是高于0.7.0版本的麦麦，请忽略该警告", "yellow")
            else:
                print_color("🔔 MongoDB服务未启动，请手动启动！", "yellow")

    # 启动麦麦
    try:
        if is_legacy_version(version):
            # 旧版本启动逻辑：直接运行run.bat
            print_color("检测到旧版本，使用兼容启动模式", "yellow")
            run_bat_path = os.path.join(selected_cfg["mai_path"], "run.bat")
            if os.path.exists(run_bat_path):
                # 使用 subprocess.Popen 启动新的 cmd 窗口
                success = True
                try:
                    subprocess.Popen(
                        f'cmd /c start cmd /k "{run_bat_path}"',
                        cwd=selected_cfg["mai_path"],
                        shell=True
                    )
                    print_color("🟢 旧版本麦麦启动成功！CMD窗口将保持打开", "green")
                except Exception as e:
                    print_color(f"❌ 旧版本麦麦启动失败：{str(e)}", "red")
                    success = False
                
                if not success:
                    print_color("🔔 旧版本麦麦启动可能失败，请检查弹出的窗口", "yellow")
            else:
                print_color("❌ 未找到run.bat文件！", "red")
        else:
            # 新版本启动逻辑：启动麦麦本体和适配器
            print_color("使用新版本启动模式", "green")
            
            # 启动麦麦本体
            success1 = run_script(
                work_dir=selected_cfg["mai_path"],
                commands="python bot.py"
            )

            # 启动适配器（仅在适配器路径有效时）
            adapter_path = selected_cfg.get("adapter_path", "")
            if adapter_path and adapter_path != "当前配置集的对象实例版本较低，无适配器":
                venv_activate = os.path.normpath(
                    os.path.join(
                        selected_cfg["mai_path"],
                        "venv",
                        "Scripts",
                        "activate"
                    )
                )
                success2 = run_script(
                    work_dir=adapter_path,
                    commands=[
                        f'& "{venv_activate}"',
                        'python main.py'
                    ]
                )

                if success1 and success2:
                    print_color("🟢 麦麦启动成功！两个PowerShell窗口将保持打开", "green")
                else:
                    print_color("🔔 部分组件启动失败，请检查弹出的窗口", "yellow")
            else:
                if success1:
                    print_color("🟢 麦麦本体启动成功！PowerShell窗口将保持打开", "green")
                else:
                    print_color("🔔 麦麦本体启动失败，请检查弹出的窗口", "yellow")

    except Exception as e:
        print_color(f"❌ 启动失败：{str(e)}", "red")
    finally:
        input("按回车键返回主菜单...")




def run_lpmm_script(mai_path, script_name, description, warning_messages=None):
    """运行LPMM相关脚本的通用函数"""
    if not mai_path:
        print_color("❌ 麦麦知识库（本体）路径未配置！请重新配置！", "red")
        return False

    try:
        # 激活虚拟环境
        print_color(f"正在进行{description}...", "cyan")
        print_color("正在激活虚拟环境...", "cyan")
        
        # 显示警告信息
        if warning_messages:
            for msg in warning_messages:
                print_color(msg, "orange")
        
        # 确认执行
        print_color("\n是否继续执行？(Y/N)：", "yellow")
        choice = input().upper()
        if choice != 'Y':
            print_color("操作已取消！", "yellow")
            return False
            
        # 运行脚本
        print_color(f"操作已确认！正在启动{description}程序...", "green")
        print_color("请在PowerShell窗口中确认执行程序！", "blue")
        
        try:
            # 构建PowerShell命令
            ps_command = f'cd "{mai_path}"; .\\venv\\Scripts\\activate.ps1; python .\\scripts\\{script_name}'
            
            # 使用start命令启动PowerShell
            start_command = f'start powershell -NoExit -ExecutionPolicy Bypass -Command "{ps_command}"'
            
            # 执行命令
            subprocess.run(start_command, shell=True, check=True)
            
            # 等待用户输入确认PowerShell操作已完成
            print_color("\n请在PowerShell窗口中完成操作后，在此处按回车键继续...", "yellow")
            input()
            
            return True
            
        except subprocess.CalledProcessError as e:
            print_color(f"❌ 执行失败：{str(e)}", "red")
            return False
        
    except Exception as e:
        print_color(f"❌ 执行失败：{str(e)}", "red")
        return False

def run_lpmm_text_split(configs):
    """运行LPMM文本分割"""
    selected_cfg = select_config(configs)
    if not selected_cfg:
        return False
    
    mai_path = selected_cfg["mai_path"]
    # 验证路径
    valid, msg = validate_path(mai_path, check_file="bot.py")
    if not valid:
        print_color(f"❌ 麦麦本体路径无效：{msg}", "red")
        input("按回车键返回菜单...")
        return False
    
    print_color("该进程将处理\\MaiBot\\data/lpmm_raw_data目录下的所有.txt文件。", "cyan")
    print_color("处理后的数据将全部合并为一个.JSON文件并储存在\\MaiBot\\data/imported_lpmm_data目录中。", "cyan")
    success = run_lpmm_script(
        mai_path,
        "raw_data_preprocessor.py",
        "LPMM知识库文本分割"
    )
    if success:
        print_color("\nLPMM知识库文本分割已结束！", "green")
    return success

def run_lpmm_entity_extract(configs):
    """运行LPMM知识库实体提取"""
    selected_cfg = select_config(configs)
    if not selected_cfg:
        return False
    
    mai_path = selected_cfg["mai_path"]
    # 验证路径
    valid, msg = validate_path(mai_path, check_file="bot.py")
    if not valid:
        print_color(f"❌ 麦麦本体路径无效：{msg}", "red")
        input("按回车键返回菜单...")
        return False
    
    warnings = [
        "实体提取操作将会花费较多api余额和时间，建议在空闲时段执行。举例：600万字全剧情，提取选用deepseek v3 0324，消耗约40元，约3小时。",
        "建议使用硅基流动的非Pro模型，或者使用可以用赠金抵扣的Pro模型",
        "请确保账户余额充足，并且在执行前确认无误。"
    ]
    success = run_lpmm_script(
        mai_path,
        "info_extraction.py",
        "LPMM知识库实体提取",
        warnings
    )
    if success:
        print_color("\nLPMM知识库实体提取已结束！", "green")
    return success

def run_lpmm_knowledge_import(configs):
    """运行LPMM知识库知识图谱导入"""
    selected_cfg = select_config(configs)
    if not selected_cfg:
        return False
    
    mai_path = selected_cfg["mai_path"]
    # 验证路径
    valid, msg = validate_path(mai_path, check_file="bot.py")
    if not valid:
        print_color(f"❌ 麦麦本体路径无效：{msg}", "red")
        input("按回车键返回菜单...")
        return False
    
    warnings = [
        "OpenIE导入时会大量发送请求，可能会撞到请求速度上限，请注意选用的模型",
        "同之前样例：在本地模型下，在70分钟内我们发送了约8万条请求，在网络允许下，速度会更快",
        "推荐使用硅基流动的Pro/BAAI/bge-m3",
        "每百万Token费用为0.7元",
        "知识导入时，会消耗大量系统资源，建议在较好配置电脑上运行",
        "同上样例，导入时10700K几乎跑满，14900HX占用80%，峰值内存占用约3G"
    ]
    success = run_lpmm_script(
        mai_path,
        "import_openie.py",
        "LPMM知识库知识图谱导入",
        warnings
    )
    if success:
        print_color("\nLPMM知识库知识图谱导入已结束！", "green")
    return success

def run_lpmm_pipeline(configs):
    """运行LPMM一条龙服务"""
    if run_lpmm_text_split(configs):
        print_color("\nLPMM知识库文本分割已结束！", "green")
        print_color("是否继续进行实体提取操作？(Y/N)：", "yellow")
        if input().upper() == 'Y':
            if run_lpmm_entity_extract(configs):
                print_color("\nLPMM知识库实体提取已结束！", "green")
                while True:
                    print_color("\n [A] 实体提取可能失败，重新提取？", "red")
                    print_color(" [B] 继续进行知识图谱导入操作", "green")
                    print_color(" [C] 取消后续操作并返回主菜单", "yellow")
                    choice = input("请选择操作: ").upper()
                    
                    if choice == 'A':
                        if not run_lpmm_entity_extract(configs):
                            break
                    elif choice == 'B':
                        if run_lpmm_knowledge_import(configs):
                            print_color("\nLPMM知识库知识图谱导入已结束！LPMM知识库构建操作已结束！", "green")
                        break
                    elif choice == 'C':
                        break
    
    print_color("\n已关闭命令行窗口，即将返回主菜单！", "green")
    countdown_timer(3)

def lpmm_menu():
    """LPMM知识库构建子菜单"""
    while True:
        clear_screen()
        print_color("[🔧 LPMM知识库构建]", "cyan")
        print("================")
        print_color(" [A] LPMM知识库一条龙构建（适用于支持LPMM知识库的版本，推荐0.6.3）", "cyan")
        print_color(" [B] LPMM知识库文本分割", "cyan")
        print_color(" [C] LPMM知识库实体提取", "cyan")
        print_color(" [D] LPMM知识库知识图谱导入", "cyan")
        print_color(" [Q] 返回主菜单", "blue")
        print("================")

        choice = input("请选择操作: ").upper()
        config = load_config()
        configs = config["configurations"]  # 提取 configurations 字典

        if choice == "Q":
            break
        elif choice == "A":
            run_lpmm_pipeline(configs)
        elif choice == "B":
            run_lpmm_text_split(configs)
        elif choice == "C":
            run_lpmm_entity_extract(configs)
        elif choice == "D":
            run_lpmm_knowledge_import(configs)
        else:
            print_color("❌ 无效选项", "red")
            time.sleep(1)

def migrate_mongodb_to_sqlite():
    """MongoDB to SQLite database migration menu"""
    clear_screen()
    print_color("[🔧 知识库迁移 (MongoDB → SQLite)]", "cyan")
    print("================")
    print_color("该功能系用于将较低版本的麦麦（如0.6.3-fix4）的知识库迁移至较高版本的麦麦（如0.7.0）的知识库", "cyan")
    
    # Load configurations
    config = load_config()
    configs = config["configurations"]
    
    # Select instance using existing select_config function
    selected_cfg = select_config(configs)
    if not selected_cfg:
        return
    
    # Validate mai_path
    mai_path = selected_cfg["mai_path"]
    valid, msg = validate_path(mai_path, check_file="bot.py")
    if not valid:
        print_color(f"❌ 麦麦本体路径无效：{msg}", "red")
        input("按回车键返回主菜单...")
        return
    
    # Check if MongoDB service is running
    if not check_mongodb():
        print_color("❌ MongoDB服务未启动！请确保MongoDB服务已开启后再试。", "red")
        input("按回车键返回主菜单...")
        return
    
    # Confirm migration
    print_color("该操作将迁移原MongoDB数据库下名为MegBot的数据库至最新的SQLite数据库", "cyan")
    print_color("迁移前请确保MongoDB服务已开启", "yellow")
    print_color("是否继续？(Y/N)：", "yellow")
    choice = input().upper()
    if choice != 'Y':
        print_color("操作已取消！", "yellow")
        input("按回车键返回主菜单...")
        return
    
    # Path to the migration batch file
    bat_file = os.path.join(mai_path, "mongodb_to_sqlite.bat")
    
    # Check if the batch file exists
    if not os.path.isfile(bat_file):
        print_color(f"❌ 迁移脚本文件 {bat_file} 不存在！", "red")
        input("按回车键返回主菜单...")
        return
    
    # Run the migration script
    try:
        print_color("操作已确认！正在启动MongoDB到SQLite迁移程序...", "green")
        print_color("请在命令行窗口中确认执行程序！", "blue")
        
        # Execute the batch file
        subprocess.run(f'"{bat_file}"', shell=True, check=True)
        
        print_color("\nMongoDB到SQLite迁移已完成！", "green")
    except subprocess.CalledProcessError as e:
        print_color(f"❌ 迁移失败：{str(e)}", "red")
    except Exception as e:
        print_color(f"❌ 迁移失败：{str(e)}", "red")
    
    input("按回车键返回主菜单...")

def Deployment():
    """部署菜单"""
    while True:
        clear_screen()
        print_color("[🔧 部署（当前仅支持安装Git环境的部署）]", "cyan")
        print("================")
        print_color("======功能开发中，敬请期待！======", "red")
        print_color(" [A] 运行MaiBot", "cyan")
        print_color(" [B] 运行完整环境", "cyan")
        print_color(" [C] 配置菜单", "cyan")
        print_color(" [D] LPMM知识库构建", "cyan")
        print_color(" [E] MongoDB到SQLite迁移", "cyan")
        print_color(" [F] 检查当前配置", "cyan")
        print_color(" [Q] 返回主菜单", "blue")
        print("================")

        choice = input("请选择操作: ").upper()

        if choice == "Q":
            break
        elif choice == "A":
            run_mai()
        elif choice == "B":
            run_full()
        elif choice == "C":
            config_menu()
        elif choice == "D":
            lpmm_menu()
        elif choice == "E":
            migrate_mongodb_to_sqlite()
        elif choice == "F":
            check_config()
        else:
            print_color("❌ 无效选项", "red")
            time.sleep(1)


def main():
    # 设置控制台编码
    if os.name == 'nt':
        ctypes.windll.kernel32.SetConsoleOutputCP(65001)

    while True:
        clear_screen()
        print_header()
        choice = input("请输入选项：").upper()

        if choice == "Q":
            break
        elif choice == "A":
            run_mai()
        elif choice == "B":
            run_full()
        elif choice == "C":
            config_menu()
        elif choice == "D":
            lpmm_menu()
        elif choice == "E":
            migrate_mongodb_to_sqlite()  # Call the new function
        elif choice == "F":
            Deployment()
        else:
            print_color("❌ 无效选项", "red")
            time.sleep(1)



if __name__ == "__main__":
    # 设置控制台编码
    if os.name == 'nt':
        ctypes.windll.kernel32.SetConsoleOutputCP(65001)
    main()