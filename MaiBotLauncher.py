import os
import json
import subprocess
import re
import ctypes
import time
import toml # 新增：导入TOML库
import requests
import zipfile
import sys
from colorama import Fore, Style, init
from tqdm import tqdm  
import shutil # 用于删除实例
import winreg # 用于注册表操作
import tempfile  # 添加tempfile模块
from urllib.request import urlopen  # 添加urlopen
from urllib.error import URLError, HTTPError  # 添加错误处理


if sys.platform == 'win32':
    kernel32 = ctypes.windll.kernel32
    kernel32.SetConsoleMode(kernel32.GetStdHandle(-11), 7)

def print_rgb(text, rgb_hex, end="\n", bold=False):
    """
    使用 RGB 十六进制值打印彩色文本
    
    Args:
        text (str): 要打印的文本
        rgb_hex (str): RGB 十六进制值 (如 "#BADFFA")
        end (str): 行尾字符
        bold (bool): 是否加粗
    """
    # 确保输入是有效的十六进制颜色
    if not rgb_hex.startswith("#") or len(rgb_hex) != 7:
        print(text, end=end)
        return
    
    try:
        # 将十六进制转换为RGB
        r = int(rgb_hex[1:3], 16)
        g = int(rgb_hex[3:5], 16)
        b = int(rgb_hex[5:7], 16)
        
        # 构建ANSI转义序列
        bold_code = "1;" if bold else ""
        escape_seq = f"\033[{bold_code}38;2;{r};{g};{b}m"
        reset_seq = "\033[0m"
        
        print(f"{escape_seq}{text}{reset_seq}", end=end)
    except ValueError:
        print(text, end=end)

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

def is_admin():
    """检查是否以管理员权限运行"""
    try:
        return ctypes.windll.shell32.IsUserAnAdmin()
    except:
        return False

def run_as_admin():
    """以管理员权限重新运行程序"""
    ctypes.windll.shell32.ShellExecuteW(None, "runas", sys.executable, " ".join(sys.argv), None, 1)
    sys.exit(0)

# 在 print_header 函数中使用自定义颜色
def print_header():
    header = r"""
88b         d88           88 888888ba                                ,ad88ba,  88                                
888         888           "" 88    "8b            88                d8"'  `"8b 88                    88     
888b       d888              88    ,8P            88               d8'         88                    88     
88 8b     d8'88 ,adPYYba, 88 88aaaa8P'  ,adPYba,  88MMM            88          88,dPPYba,  ,adPPYba, 88MMM  
88 `8b   d8' 88 ""    `Y8 88 88“”“”8b, a8"    "8a 88     aaaaaaaa  88          88P'    "8a ""    `Y8 88     
88  `8b d8'  88 ,adPPPP88 88 88    `8b 8b      d8 88     “”“”“”“”  Y8,         88       88 ,adPPPP88 88     
88   `888'   88 88,   ,88 88 88    a8P "8a,  ,a8" 88,               Y8a.  .a8P 88       88 88,   ,88 88,    
88           88 `"8bdP"Y8 88 888888P"   `"YbdP"'   "Y888             `"Y88Y"'  88       88 `"8bdP"Y8  "Y888  
"""
    print_rgb(header, "#BADFFA")  # 使用自定义颜色
    print_rgb("促进多元化艺术创作发展普及", "#BADFFA")
    print_rgb("\n🌈麦麦启动器控制台", "#BADFFA")
    print_color("——————————", "gray")
    print_color("选择选项", "gray")
    print("====>>启动类<<====")
    print_rgb(" [A] 🚀 运行麦麦", "#4AF933")
    print_rgb(" [B] 运行麦麦（同时启动NapCatQQ和Mongo DB）", "#4AF933")
    print("====>>配置类<<====")
    print_rgb(" [C] 配置管理（新建/修改/检查配置）", "#F2FF5D")
    print("====>>功能类<<====")
    print_rgb(" [D] 知识库构建", "#00FFBB")
    print_rgb(" [E] 知识库迁移（MongoDB → SQLite）", "#28DCF0")
    print("====>>部署类<<====")
    print_rgb(" [F] 实例部署辅助系统", "#FF6B6B")  # 使用另一个自定义颜色
    print("====>>关于类<<====")
    print_rgb(" [G] 关于本程序", "#6DA0FD")
    print("====>>退出类<<====")
    print_rgb(" [Q] 👋退出程序", "#7E1DE4")

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
            print_rgb("❌ 路径不能为空！", "#FF6B6B")
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
        print_rgb(f"❌ 路径验证失败：{msg}", "#FF6B6B")


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
    print_rgb("🟢 正在检索麦麦本体...", "#F2FF5D")
    default_path = os.path.abspath("MaiBot")
    if os.path.isfile(os.path.join(default_path, "bot.py")):
        return default_path
    return ""


def auto_detect_adapter():
    print_rgb("🟢 正在检索适配器...", "#F2FF5D")
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
            print_rgb("❌ 输入不能为空！", "#FF6B6B")
            continue
            
        return text

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

def config_menu():
    while True:
        clear_screen()
        print_rgb("[🔧 配置模式]", "#F2FF5D")
        print("================")
        print_color(" [A] 自动检索麦麦", "green")
        print_color(" [B] 手动配置", "green")
        print_rgb(" [C] 管理配置集(新建/删除)", "#6DA0FD")
        print_rgb(" [D] 检查现有配置", "#6DA0FD")
        print_rgb(" [Q] 返回上级", "#7E1DE4")
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
                print_rgb("[🔧 配置集管理]", "#6DA0FD")
                print("================")
                
                # 重新加载最新配置
                config = load_config()
                configs = config.get("configurations", {})
                
                # 检查配置是否为空
                if not configs:
                    print_rgb("❌ 当前没有任何配置", "#FF6B6B")
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
                    
                    print_rgb(f"实例 {nickname} (序列号: {serial_number})", "#005CFA")
                    print(f"版本号：{version}")
                    print(f"麦麦路径：{mai_path}")
                    print(f"适配器路径：{adapter_path}")
                    print(f"NapCat路径：{napcat_path}")
                    print("——————————")

                print("\n[操作选项]")
                print_rgb(" [A] 新建配置集", "#6DFD8A")
                print_rgb(" [B] 删除配置集", "#FF6B6B")
                print_rgb(" [Q] 返回上级", "#7E1DE4")
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
                        print_rgb(f"✅ 已创建新配置集: {new_name}", "#6DFD8A")
                        time.sleep(1)
        
                        # 进入配置流程
                        clear_screen()
                        print_rgb(f"[🔧 配置 {new_name}]", "#6DFD8A")
                        print_rgb("请选择配置方式:", "#6DA0FD")
                        print_rgb(" [A] 自动检索麦麦", "#6DFD8A")
                        print_rgb(" [B] 手动配置", "#F2FF5D")
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
                                print_rgb(f"✅ 已自动检测到麦麦本体：{mai_path}", "#6DFD8A")

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
                                    print_rgb(f"✅ 已自动检测到适配器：{adapter_path}", "#6DFD8A")

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
                                print_rgb("检测到旧版本，无需配置适配器", "#F2FF5D")
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
                        print_rgb("🎉 配置已保存！", "#6DFD8A")
                        time.sleep(1)
                    else:
                        print_rgb("❌ 配置集名称已存在", "#FF6B6B")
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
                            print_rgb(f"未找到用户序列号: {', '.join(not_found)}", "#FF6B6B")
                        print_rgb(f"已删除 {len(deleted)} 个配置集", "#6DFD8A")
                    else:
                        print_rgb("已取消删除操作", "#F2FF5D")
                    time.sleep(1)
                else:
                    print_rgb("❌ 无效选项", "#FF6B6B")
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
        print_rgb(f"❌ 启动失败!：{str(e)}", "#FF6B6B")
        return False

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
        print_rgb("❌ 发现配置错误!：", "#FF6B6B")
        for error in errors:
            print_rgb(f"• {error}", "#FF6B6B")
        input("按回车键返回主菜单...")
        return

    try:
        version = selected_cfg.get("version_path", "")
        
        if is_legacy_version(version):
            # 旧版本启动逻辑：直接运行run.bat
            print_rgb("检测到旧版本，使用兼容启动模式", "#F2FF5D")
            
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
                    print_rgb("🟢 旧版本麦麦启动成功！CMD窗口将保持打开", "#6DFD8A")
                except Exception as e:
                    print_rgb(f"❌ 旧版本麦麦启动失败：{str(e)}", "#FF6B6B")
                    success = False
                
                if not success:
                    print_rgb("🔔 旧版本麦麦启动可能失败，请检查弹出的窗口", "#F2FF5D")
            else:
                print_rgb("❌ 未找到run.bat文件！", "#FF6B6B")
        else:
            # 新版本启动逻辑：启动麦麦本体和适配器
            print_rgb("使用新版本启动模式", "#6DFD8A")
            
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
                    print_rgb("🟢 麦麦启动成功！两个PowerShell窗口将保持打开", "#6DFD8A")
                else:
                    print_rgb("🔔 部分组件启动失败，请检查弹出的窗口", "#F2FF5D")
            else:
                if success1:
                    print_rgb("🟢 麦麦本体启动成功！", "#6DFD8A")
                else:
                    print_rgb("🔔 麦麦本体启动失败，请检查弹出的窗口", "#F2FF5D")

    except Exception as e:
        print_rgb(f"❌ 启动失败：{str(e)}", "#FF6B6B")
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
        print_rgb("❌ 发现配置错误!：",  "#FF6B6B")
        for error in errors:
            print_rgb(f"• {error}", "#FF6B6B")
        input("按回车键返回主菜单...")
        return

    version = selected_cfg.get("version_path", "")
    
    # 检查NapCat（新旧版本都可能需要）
    napcat_running = check_process("NapCatWinBootMain.exe")
    if not napcat_running:
        if selected_cfg["napcat_path"]:
            try:
                subprocess.Popen(f'"{selected_cfg["napcat_path"]}"')
                print_rgb("🟢 NapCat启动成功！", "#6DFD8A")
            except Exception as e:
                print_rgb(f"❌ NapCat启动失败！{str(e)}", "#FF6B6B")
        else:
            print_rgb("🔔 NapCat路径未配置，跳过NapCat的启动", "#F2FF5D")

    # 检查MongoDB（仅新版本需要）
    if not is_legacy_version(version):
        if check_mongodb():
            print_rgb("🟢 MongoDB已启动！", "#6DFD8A")
        else:
            if version > "0.7.0":
                print_rgb("🔔 MongoDB服务未启动，请手动启动！若您使用的是高于0.7.0版本的麦麦，请忽略该警告", "#F2FF5D")
            else:
                print_rgb("🔔 MongoDB服务未启动，请手动启动！", "#F2FF5D")

    # 启动麦麦
    try:
        if is_legacy_version(version):
            # 旧版本启动逻辑：直接运行run.bat
            print_rgb("检测到旧版本，使用兼容启动模式", "#F2FF5D")
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
                    print_rgb("🟢 旧版本麦麦启动成功！CMD窗口将保持打开", "#6DFD8A")
                except Exception as e:
                    print_rgb(f"❌ 旧版本麦麦启动失败：{str(e)}", "#FF6B6B")
                    success = False
                
                if not success:
                    print_rgb("🔔 旧版本麦麦启动可能失败，请检查弹出的窗口", "#F2FF5D")
            else:
                print_rgb("❌ 未找到run.bat文件！", "#FF6B6B")
        else:
            # 新版本启动逻辑：启动麦麦本体和适配器
            print_rgb("使用新版本启动模式", "#6DFD8A")
            
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
                    print_rgb("🟢 麦麦启动成功！两个PowerShell窗口将保持打开", "#6DFD8A")
                else:
                    print_rgb("🔔 部分组件启动失败，请检查弹出的窗口", "#F2FF5D")
            else:
                if success1:
                    print_rgb("🟢 麦麦本体启动成功！PowerShell窗口将保持打开", "#6DFD8A")
                else:
                    print_header("🔔 麦麦本体启动失败，请检查弹出的窗口", "#F2FF5D")

    except Exception as e:
        print_rgb(f"❌ 启动失败：{str(e)}", "#FF6B6B")
    finally:
        input("按回车键返回主菜单...")



def check_config():
    """检查和重新配置任意配置集"""
    config = load_config()
    configs = config["configurations"]
    
    while True:
        clear_screen()
        print_rgb("[🔧 检查现有配置]", "#6DA0FD")
        
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
            print_rgb("❌ 未找到匹配的配置集！", "#FF6B6B")
            input("按回车键返回主菜单...")
            return
        
        # 显示选中的配置集信息
        print(f"当前配置名称: {selected_config_name}")
        print_rgb(f"用户序列号: {selected_cfg['serial_number'] or '未配置'}","#005CFA")
        print(f"绝对序列号: {selected_cfg['absolute_serial_number'] or '未配置'}")
        print_rgb(f"昵称: {selected_cfg['nickname_path'] or '未配置'}", "#005CFA")
        print(f"麦麦本体路径: {selected_cfg['mai_path'] or '未配置'}")
        print(f"适配器路径: {selected_cfg['adapter_path'] or '未配置'}")
        print(f"NapCat路径: {selected_cfg['napcat_path'] or '未配置'}")

        # 检查NapCat路径有效性
        if selected_cfg["napcat_path"]:
            valid, msg = validate_exe_path(selected_cfg["napcat_path"])
            if not valid:
                print_rgb(f"❌ NapCatQQ路径错误!：{msg}", "#FF6B6B")

        # 检查配置有效性
        errors = validate_config(selected_cfg)
        if errors:
            print_rgb("❌ 发现配置错误!：", "#FF6B6B")
            for error in errors:
                print_rgb(f"• {error}", "#FF6B6B")

        print("\n=================")
        print_rgb(" [A] 重新配置此配置集", "#6DFD8A")
        print_rgb(" [B] 返回配置菜单", "#7E1DE4")
        choice = input("请选择操作: ").upper()

        if choice == "B":
            break
        elif choice == "A":
            reconfigure_current_config(config, selected_config_name, selected_cfg)
            # 重新加载配置以确保更新
            config = load_config()
            configs = config["configurations"]
        else:
            print_rgb("❌ 无效选项", "#FF6B6B")
            time.sleep(1)

    input("\n按回车键返回配置菜单...")



def reconfigure_current_config(config, current_config_name, current_cfg):
    """重新配置当前配置集"""
    clear_screen()
    print_rgb(f"[🔧 重新配置 {current_config_name}]", "#6DFD8A")
    print("================")
    print_rgb("以下信息将保持不变:", "#6DA0FD")
    print(f"当前配置名称: {current_config_name}")
    print_rgb(f"用户序列号: {current_cfg['serial_number']}","#005CFA")
    print(f"绝对序列号: {current_cfg['absolute_serial_number']}")
    print("================")
    
    # 存储原始值作为备份
    original_cfg = current_cfg.copy()
    
    # 逐项询问是否配置
    print_rgb("\n开始配置流程...", "#6DFD8A")
    
    # 配置版本号
    print_rgb(f"\n当前版本号: {current_cfg['version_path'] or '未配置'}", "#6DA0FD")
    if input("是否重新配置版本号？(Y/N): ").upper() == 'Y':
        current_cfg['version_path'] = get_text_input("请输入新的版本号（如0.7.0或0.6.3-fix4）：", "green")
    
    # 配置昵称
    print_rgb(f"\n当前昵称: {current_cfg['nickname_path'] or '未配置'}", "#6DA0FD")
    if input("是否重新配置昵称？(Y/N): ").upper() == 'Y':
        current_cfg['nickname_path'] = get_text_input("请输入新的配置昵称：", "green")
    
    # 配置麦麦本体路径
    print_rgb(f"\n当前麦麦本体路径: {current_cfg['mai_path'] or '未配置'}", "#6DA0FD")
    if input("是否重新配置麦麦本体路径？(Y/N): ").upper() == 'Y':
        current_cfg['mai_path'] = get_input("请输入新的麦麦本体路径：", "green", check_file="bot.py")
    
    # 配置适配器路径
    print_rgb(f"\n当前适配器路径: {current_cfg['adapter_path'] or '未配置'}", "#6DA0FD")
    if input("是否重新配置适配器路径？(Y/N): ").upper() == 'Y':
        current_cfg['adapter_path'] = get_input("请输入新的适配器路径：", "green", check_file="main.py")
    
    # 配置NapCat路径
    print_rgb(f"\n当前NapCat路径: {current_cfg['napcat_path'] or '未配置'}", "#6DA0FD")
    if input("是否重新配置NapCat路径？(Y/N): ").upper() == 'Y':
        current_cfg['napcat_path'] = get_input("请输入新的NapCatQQ路径（可为空）：", "green", allow_empty=True, is_exe=True)
    
    # 保存配置
    config["configurations"][current_config_name] = current_cfg
    save_config(config)
    print_rgb("✅ 配置已更新！", "#6DFD8A")
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
    print_rgb("请选择您要启动的实例：", "#6DA0FD")
    for idx, (cfg_name, cfg) in enumerate(all_configs.items(), 1):
        print(f"实例{idx}")
        print_rgb(f"序列号\"{cfg['serial_number']}\"（绝对序列号：{cfg['absolute_serial_number']}）","#005CFA")  # 显示两个序列号
        print_rgb(f"昵称\"{cfg['nickname_path']}\"","#005CFA")
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
        print_rgb("❌ 未找到匹配的实例序列号！", "#FF6B6B")
        input("按回车键返回主菜单...")
        return

    # 原有配置验证逻辑（保持不变）
    errors = validate_config(selected_cfg)
    if errors:
        print_rgb("❌ 发现配置错误!：", "#FF6B6B")
        for error in errors:
            print_rgb(f"• {error}", "#FF6B6B")
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
            print_rgb("🟢 麦麦启动成功！两个PowerShell窗口将保持打开", "#6DFD8A")
        else:
            print_rgb("🔔 部分组件启动失败，请检查弹出的窗口", "#F2FF5D")

    except Exception as e:
        print_rgb(f"❌ 启动失败：{str(e)}", "#FF6B6B")
    finally:
        input("按回车键返回主菜单...")

# 剩余函数保持原有实现（check_process, check_mongodb, run_full, main）



def run_full():
    config = load_config()
    # 检查NapCat
    napcat_running = check_process("NapCatWinBootMain.exe")
    if not napcat_running:
        if config["napcat_path"]:
            try:
                subprocess.Popen(f'"{config["napcat_path"]}"')
                print_rgb("🟢 NapCat启动成功！", "#6DFD8A")
            except:
                print_rgb("❌ NapCat启动失败！", "#FF6B6B")
        else:
            print_rgb("🔔 NapCat路径未配置！", "#F2FF5D")

    # 检查MongoDB
    if check_mongodb():
        print_rgb("🟢 MongoDB已启动！", "#6DFD8A")
    else:
        print_rgb("🔔 MongoDB未启动！", "#F2FF5D")

    run_mai()

def select_config(configs):
    """显示配置集并让用户选择目标实例，返回选中的配置"""
    while True:
        clear_screen()
        print_rgb("请选择您要使用的实例：", "#6DA0FD")
        for idx, (cfg_name, cfg) in enumerate(configs.items(), 1):
            print(f"实例{idx}")
            print_rgb(f"序列号\"{cfg['serial_number']}\"（绝对序列号：{cfg['absolute_serial_number']}）","#005CFA")  # 显示两个序列号
            print_rgb(f"昵称\"{cfg['nickname_path']}\"", "#005CFA")
            print(f"版本\"{cfg['version_path']}\"")
            print(f"本体路径\"{cfg['mai_path']}\"")
            print(f"适配器路径\"{cfg['adapter_path']}\"")
            print(f"NapCat路径\"{cfg['napcat_path'] or '未配置'}\"")
            print("——————————")

        # 获取用户输入的序列号（支持用户自定义序列号或绝对序列号）
        print_rgb("请输入您要使用的实例序列号（输入Q返回）：", "#6DFD8A")
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
            print_rgb("❌ 未找到匹配的实例序列号！", "#FF6B6B")
            input("按回车键继续...")
            continue
        
        return selected_cfg

def run_lpmm_script(mai_path, script_name, description, warning_messages=None):
    """运行LPMM相关脚本的通用函数"""
    if not mai_path:
        print_rgb("❌ 麦麦知识库（本体）路径未配置！请重新配置！", "#FF6B6B")
        return False

    try:
        # 激活虚拟环境
        print_rgb(f"正在进行{description}...", "#00FFBB")
        print_rgb("正在激活虚拟环境...", "#00FFBB")
        
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
        print_rgb(f"操作已确认！正在启动{description}程序...", "#00FFBB")
        print_rgb("请在PowerShell窗口中确认执行程序！", "#00FFBB")
        
        try:
            # 构建PowerShell命令
            ps_command = f'cd "{mai_path}"; .\\venv\\Scripts\\activate.ps1; python .\\scripts\\{script_name}'
            
            # 使用start命令启动PowerShell
            start_command = f'start powershell -NoExit -ExecutionPolicy Bypass -Command "{ps_command}"'
            
            # 执行命令
            subprocess.run(start_command, shell=True, check=True)
            
            # 等待用户输入确认PowerShell操作已完成
            print_rgb("\n请在PowerShell窗口中完成操作后，在此处按回车键继续...", "#00FFBB")
            input()
            
            return True
            
        except subprocess.CalledProcessError as e:
            print_rgb(f"❌ 执行失败：{str(e)}", "#FF6B6B")
            return False
        
    except Exception as e:
        print_rgb(f"❌ 执行失败：{str(e)}", "#FF6B6B")
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
        print_rgb("\nLPMM知识库实体提取已结束！", "#00FFBB")
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
        print_rgb("\nLPMM知识库知识图谱导入已结束！", "#00FFBB")
    return success

def run_lpmm_pipeline(configs):
    """运行LPMM一条龙服务"""
    if run_lpmm_text_split(configs):
        print_rgb("\nLPMM知识库文本分割已结束！", "#00FFBB")
        print_color("是否继续进行实体提取操作？(Y/N)：", "yellow")
        if input().upper() == 'Y':
            if run_lpmm_entity_extract(configs):
                print_rgb("\nLPMM知识库实体提取已结束！", "#00FFBB")
                while True:
                    print_rgb("\n [A] 实体提取可能失败，重新提取？", "#FF6B6B")
                    print_rgb(" [B] 继续进行知识图谱导入操作", "#6DA0FD")
                    print_rgb(" [Q] 取消后续操作并返回主菜单", "#7E1DE4")
                    choice = input("请选择操作: ").upper()
                    
                    if choice == 'A':
                        if not run_lpmm_entity_extract(configs):
                            break
                    elif choice == 'B':
                        if run_lpmm_knowledge_import(configs):
                            print_rgb("\nLPMM知识库知识图谱导入已结束！LPMM知识库构建操作已结束！", "#00FFBB")
                        break
                    elif choice == 'Q':
                        break
    
    print_rgb("\n已关闭命令行窗口，即将返回主菜单！", "#F2FF5D")
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




def run_lpmm_script(mai_path, script_name, description, warning_messages=None):
    """运行LPMM相关脚本的通用函数"""
    if not mai_path:
        print_rgb("❌ 麦麦知识库（本体）路径未配置！请重新配置！", "#FF6B6B")
        return False

    try:
        # 激活虚拟环境
        print_rgb(f"正在进行{description}...", "#00FFBB")
        print_rgb("正在激活虚拟环境...", "#00FFBB")
        
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
        print_rgb(f"操作已确认！正在启动{description}程序...", "#00FFBB")
        print_rgb("请在PowerShell窗口中确认执行程序！", "#00FFBB")
        
        try:
            # 构建PowerShell命令
            ps_command = f'cd "{mai_path}"; .\\venv\\Scripts\\activate.ps1; python .\\scripts\\{script_name}'
            
            # 使用start命令启动PowerShell
            start_command = f'start powershell -NoExit -ExecutionPolicy Bypass -Command "{ps_command}"'
            
            # 执行命令
            subprocess.run(start_command, shell=True, check=True)
            
            # 等待用户输入确认PowerShell操作已完成
            print_rgb("\n请在PowerShell窗口中完成操作后，在此处按回车键继续...", "#00FFBB")
            input()
            
            return True
            
        except subprocess.CalledProcessError as e:
            print_rgb(f"❌ 执行失败：{str(e)}", "#FF6B6B")
            return False
        
    except Exception as e:
        print_rgb(f"❌ 执行失败：{str(e)}", "#FF6B6B")
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
        print_rgb(f"❌ 麦麦本体路径无效：{msg}", "#FF6B6B")
        input("按回车键返回菜单...")
        return False
    
    print_rgb("该进程将处理\\MaiBot\\data/lpmm_raw_data目录下的所有.txt文件。", "#6DA0FD")
    print_rgb("处理后的数据将全部合并为一个.JSON文件并储存在\\MaiBot\\data/imported_lpmm_data目录中。", "#6DA0FD")
    success = run_lpmm_script(
        mai_path,
        "raw_data_preprocessor.py",
        "LPMM知识库文本分割"
    )
    if success:
        print_rgb("\nLPMM知识库文本分割已结束！", "#00FFBB")
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
        print_rgb(f"❌ 麦麦本体路径无效：{msg}", "#FF6B6B")
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
        print_color("\nLPMM知识库实体提取已结束！", "#00FFBB")
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
        print_rgb(f"❌ 麦麦本体路径无效：{msg}", "#FF6B6B")
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
        print_rgb("\nLPMM知识库知识图谱导入已结束！", "#00FFBB")
    return success

def run_lpmm_pipeline(configs):
    """运行LPMM一条龙服务"""
    if run_lpmm_text_split(configs):
        print_rgb("\nLPMM知识库文本分割已结束！", "#00FFBB")
        print_rgb("是否继续进行实体提取操作？(Y/N)：", "#6DA0FD")
        if input().upper() == 'Y':
            if run_lpmm_entity_extract(configs):
                print_rgb("\nLPMM知识库实体提取已结束！", "#00FFBB")
                while True:
                    print_rgb("\n [A] 实体提取可能失败，重新提取？", "#FF6B6B")
                    print_rgb(" [B] 继续进行知识图谱导入操作", "#6DA0FD")
                    print_rgb(" [Q] 取消后续操作并返回主菜单", "#7E1DE4")
                    choice = input("请选择操作: ").upper()
                    
                    if choice == 'A':
                        if not run_lpmm_entity_extract(configs):
                            break
                    elif choice == 'B':
                        if run_lpmm_knowledge_import(configs):
                            print_rgb("\nLPMM知识库知识图谱导入已结束！LPMM知识库构建操作已结束！", "#00FFBB")
                        break
                    elif choice == 'Q':
                        break
    
    print_rgb("\n已关闭命令行窗口，即将返回主菜单！", "#6DFD8A")
    countdown_timer(3)

def run_legacy_knowledge_build(configs):
    """运行旧版知识库构建（仅适用于0.6.0-alpha及更早版本）"""
    # 筛选出旧版实例
    legacy_configs = {}
    for cfg_name, cfg in configs.items():
        if is_legacy_version(cfg.get("version_path", "")):
            legacy_configs[cfg_name] = cfg
    
    if not legacy_configs:
        print_rgb("❌ 未找到符合条件的旧版实例（版本号≤0.6.2或classical）", "#FF6B6B")
        input("按回车键返回...")
        return
    
    # 显示所有旧版实例
    clear_screen()
    print_rgb("[🔧 旧版知识库构建]", "#FF6B6B")
    print("================\n")
    print_rgb("请选择目标实例（仅显示旧版实例）：", "#F2FF5D")
    
    for idx, (cfg_name, cfg) in enumerate(legacy_configs.items(), 1):
        print(f"实例{idx}")
        print_rgb(f"序列号: {cfg['serial_number']}", "#005CFA")
        print_rgb(f"昵称: {cfg['nickname_path']}", "#005CFA")
        print(f"版本: {cfg['version_path']}")
        print(f"麦麦路径: {cfg['mai_path']}")
        print("——————————")
    
    # 获取用户选择的序列号
    serial_number = get_text_input("\n请输入目标实例的用户序列号（输入Q返回）:", "cyan")
    if serial_number.upper() == "Q":
        return
    
    selected_cfg = next(
        (cfg for cfg in legacy_configs.values() if cfg["serial_number"] == serial_number),
        None
    )
    
    if not selected_cfg:
        print_rgb("❌ 未找到匹配的实例！", "#FF6B6B")
        input("按回车键返回...")
        return
    
    mai_path = selected_cfg["mai_path"]
    raw_info_dir = os.path.join(mai_path, "data", "raw_info")
    
    # 显示警告和操作说明
    clear_screen()
    print_rgb("=== 旧版知识库构建 ===", "#FF6B6B")
    print("=======================")
    print_rgb("警告提示：", "#FF6B6B")
    print("1. 这是一个demo系统，不完善不稳定，仅用于体验")
    print("2. 不要塞入过长过大的文本，这会导致信息提取迟缓")
    print("=======================")
    print_rgb(f"请将要学习的文本文件放入以下目录：", "#F2FF5D")
    print_rgb(f"{raw_info_dir}", "#46AEF8")
    print("=======================")
    print_rgb("确保文件为UTF-8编码的txt文件", "#F2FF5D")
    print("=======================")
    
    confirm = input("确认文件已放置完毕？(Y/N): ").upper()
    if confirm != 'Y':
        print_rgb("操作已取消", "#F2FF5D")
        return
    
    # 选择Python环境
    print_rgb("\n请选择Python环境：", "#F2FF5D")
    print_rgb(" [1] venv (推荐)", "#F2FF5D")
    print_rgb(" [2] conda", "#F2FF5D")
    env_choice = input("请输入数字选择(1或2): ").strip()
    
    script_path = os.path.join(mai_path, "src", "plugins", "zhishi", "knowledge_library.py")
    
    if env_choice == '1':
        # 使用venv环境
        venv_path = os.path.join(mai_path, "venv", "Scripts", "python.exe")
        if not os.path.exists(venv_path):
            venv_path = os.path.join(mai_path, "maimbot", "Scripts", "python.exe")
        
        if not os.path.exists(venv_path):
            print_rgb("❌ 未找到venv环境，请使用conda或手动配置", "#FF6B6B")
            input("按回车键返回...")
            return
        
        command = f'start cmd /k "{venv_path}" "{script_path}"'
    elif env_choice == '2':
        # 使用conda环境
        env_name = input("请输入要激活的conda环境名称: ").strip()
        if not env_name:
            print_rgb("❌ 环境名称不能为空", "#FF6B6B")
            return
        
        command = f'start cmd /k conda activate {env_name} && python "{script_path}"'
    else:
        print_rgb("❌ 无效选择", "#FF6B6B")
        return
    
    # 执行命令
    try:
        subprocess.Popen(command, shell=True)
        print_rgb("✅ 已启动知识库构建脚本，请在新窗口中操作", "#6DFD8A")
    except Exception as e:
        print_rgb(f"❌ 启动失败: {str(e)}", "#FF6B6B")
    
    input("按回车键返回...")

def lpmm_menu():
    """知识库构建子菜单"""
    while True:
        clear_screen()
        print_rgb("[🔧 知识库构建]", "#00FFBB")
        print("================")
        print_rgb("->>>LPMM功能仅适用于支持LPMM知识库的版本，如“0.6.3-alpha”<<<-", "#FF6B6B")
        print_rgb(" [A] LPMM知识库一条龙构建", "#00FFBB")
        print_rgb(" [B] LPMM知识库文本分割", "#02A18F")
        print_rgb(" [C] LPMM知识库实体提取", "#02A18F")
        print_rgb(" [D] LPMM知识库知识图谱导入", "#02A18F")
        print_rgb(" [E] 旧版知识库构建（仅0.6.0-alpha及更早版本）", "#924444")  # 新增选项
        print_rgb(" [Q] 返回主菜单", "#7E1DE4")
        print_rgb("->>>仍使用旧版知识库的版本（如0.6.0-alpha）请选择选项 [E] <<<-", "#FF6B6B")
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
        elif choice == "E":  # 新增选项
            run_legacy_knowledge_build(configs)
        else:
            print_rgb("❌ 无效选项", "#FF6B6B")
            time.sleep(1)

def migrate_mongodb_to_sqlite():
    """MongoDB to SQLite database migration menu"""
    clear_screen()
    print_rgb("[🔧 知识库迁移 (MongoDB → SQLite)]", "#28DCF0")
    print("================")
    print_rgb("该功能系用于将较低版本的麦麦（如0.6.3-fix4）的知识库迁移至较高版本的麦麦（如0.7.0）的知识库", "#28DCF0")
    
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
        print_rgb(f"❌ 麦麦本体路径无效：{msg}", "#FF6B6B")
        input("按回车键返回主菜单...")
        return
    
    # Check if MongoDB service is running
    if not check_mongodb():
        print_rgb("❌ MongoDB服务未启动！请确保MongoDB服务已开启后再试。", "#FF6B6B")
        input("按回车键返回主菜单...")
        return
    
    # Confirm migration
    print_rgb("该操作将迁移原MongoDB数据库下名为MegBot的数据库至最新的SQLite数据库", "#28DCF0")
    print_rgb("迁移前请确保MongoDB服务已开启", "#28DCF0")
    print_rgb("是否继续？(Y/N)：", "#28DCF0")
    choice = input().upper()
    if choice != 'Y':
        print_color("操作已取消！", "yellow")
        input("按回车键返回主菜单...")
        return
    
    # Path to the migration batch file
    bat_file = os.path.join(mai_path, "mongodb_to_sqlite.bat")
    
    # Check if the batch file exists
    if not os.path.isfile(bat_file):
        print_rgb(f"❌ 迁移脚本文件 {bat_file} 不存在！", "#FF6B6B")
        input("按回车键返回主菜单...")
        return
    
    # Run the migration script
    try:
        print_rgb("操作已确认！正在启动MongoDB到SQLite迁移程序...", "#28DCF0")
        print_rgb("请在命令行窗口中确认执行程序！", "#28DCF0")
        
        # Execute the batch file
        subprocess.run(f'"{bat_file}"', shell=True, check=True)
        
        print_rgb("\nMongoDB到SQLite迁移已完成！", "#28DCF0")
    except subprocess.CalledProcessError as e:
        print_rgb(f"❌ 迁移失败：{str(e)}", "#FF6B6B")
    except Exception as e:
        print_rgb(f"❌ 迁移失败：{str(e)}", "#FF6B6B")
    
    input("按回车键返回主菜单...")

def get_powershell_path():
    """获取PowerShell可执行路径"""
    try:
        # 尝试通过注册表获取
        reg_key = winreg.OpenKey(
            winreg.HKEY_LOCAL_MACHINE,
            r"SOFTWARE\Microsoft\PowerShell\3\PowerShellEngine"
        )
        base_path = winreg.QueryValueEx(reg_key, "ApplicationBase")[0]
        powershell_path = os.path.join(base_path, "powershell.exe")
        winreg.CloseKey(reg_key)
        if os.path.exists(powershell_path):
            return powershell_path
    except:
        pass
    
    # 回退到默认路径
    default_paths = [
        os.path.expandvars(r"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"),
        os.path.expandvars(r"%SystemRoot%\SysNative\WindowsPowerShell\v1.0\powershell.exe"),
        os.path.expandvars(r"%ProgramFiles%\PowerShell\7\pwsh.exe")
    ]
    
    for path in default_paths:
        if os.path.exists(path):
            return path
    
    raise Exception("❌ 无法找到PowerShell可执行文件")

def run_commands_in_single_console(work_dir, commands, description):
    """
    在单个控制台窗口中按顺序执行多条命令
    """
    try:
        # 构建完整的PowerShell命令
        full_command = f'cd "{work_dir}"; '
        if isinstance(commands, list):
            full_command += '; '.join(commands)
        else:
            full_command += commands
        
        print_rgb(f"🟢 开始执行: {description}", "#6DFD8A")
        print_rgb(f"执行路径: {work_dir}", "#BADFFA")
        
        # 创建PowerShell进程
        powershell_path = get_powershell_path()
        process = subprocess.Popen(
            [
                powershell_path,
                '-NoExit',
                '-Command',
                full_command
            ],
            creationflags=subprocess.CREATE_NEW_CONSOLE
        )
        
        print_rgb("✅ 命令已在新的控制台窗口中启动", "#6DFD8A")
        print_rgb("请在新窗口中完成操作后返回此处继续", "#F2FF5D")
        return process
    except Exception as e:
        print_rgb(f"❌ 执行失败: {str(e)}", "#FF6B6B")
        return None

def install_mongodb():
    """
    安装 MongoDB
    """
    print_rgb("下载 MongoDB", "#0BA30D")
    resp = requests.get(
        "https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-latest.zip",
        stream=True,
    )
    total = int(resp.headers.get("content-length", 0))  # 计算文件大小
    with (
        open("mongodb.zip", "wb") as file,
        tqdm(  # 展示下载进度条，并解压文件
            desc="mongodb.zip",
            total=total,
            unit="iB",
            unit_scale=True,
            unit_divisor=1024,
        ) as bar,
    ):
        for data in resp.iter_content(chunk_size=1024):
            size = file.write(data)
            bar.update(size)
    
    with zipfile.ZipFile("mongodb.zip", 'r') as zip_ref:
        zip_ref.extractall("mongodb")
    
    print_rgb("MongoDB 下载完成", "#0BA30D")
    os.remove("mongodb.zip")
    
    choice = input("是否安装 MongoDB Compass？此软件可以以可视化的方式修改数据库，建议安装（Y/n）").upper()
    if choice == "Y" or choice == "":
        install_mongodb_compass()

def run_cmd(command: str, open_new_window: bool = True):
    """
    运行 cmd 命令

    Args:
        command (str): 指定要运行的命令
        open_new_window (bool): 指定是否新建一个 cmd 窗口运行
    """
    if open_new_window:
        command = "start " + command
    subprocess.Popen(command, shell=True)

def install_mongodb_compass():
    run_cmd(r"powershell Start-Process powershell -Verb runAs 'Set-ExecutionPolicy RemoteSigned'")
    input("请在弹出的用户账户控制中点击“是”后按任意键继续安装")
    run_cmd(r"powershell mongodb\bin\Install-Compass.ps1")

def is_python_installed(min_version=(3, 10)):
    try:
        # 检查Python是否安装
        result = subprocess.run(["python", "--version"], capture_output=True, text=True)
        if result.returncode != 0:
            return False
        
        # 解析版本号
        version_str = result.stdout.strip().split()[1]
        version_tuple = tuple(map(int, version_str.split('.')))
        
        # 检查版本是否足够新
        return version_tuple > min_version
    except Exception:
        return False

def download_file(url, filename):
    """
    下载文件并显示进度条
    """
    resp = requests.get(url, stream=True)
    total = int(resp.headers.get("content-length", 0))
    
    with open(filename, "wb") as file, tqdm(
        desc=filename,
        total=total,
        unit="iB",
        unit_scale=True,
        unit_divisor=1024,
    ) as bar:
        for data in resp.iter_content(chunk_size=1024):
            size = file.write(data)
            bar.update(size)

def check_mongodb_service():
    try:
        output = subprocess.check_output('sc query MongoDB', shell=True, stderr=subprocess.DEVNULL)
        return "RUNNING" in output.decode()
    except:
        return False

def check_mongodb_compass():
    """
    检查系统是否安装了 MongoDB Compass
    通过查询Windows注册表来检测
    """
    try:
        # 打开卸载注册表项
        reg_path = r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"
        reg_key = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, reg_path)
        
        # 获取子键数量
        key_count = winreg.QueryInfoKey(reg_key)[0]
        
        # 遍历所有已安装程序
        for i in range(key_count):
            try:
                # 打开每个程序的注册表项
                key_name = winreg.EnumKey(reg_key, i)
                sub_key = winreg.OpenKey(reg_key, key_name)
                
                # 获取显示名称
                display_name, _ = winreg.QueryValueEx(sub_key, "DisplayName")
                
                # 检查是否为 MongoDB Compass
                if "MongoDB Compass" in display_name:
                    return True
                    
            except FileNotFoundError:
                # 某些键可能没有DisplayName值，跳过
                continue
            except Exception as e:
                # 记录其他错误但继续检查
                print_rgb(f"注册表检查错误: {str(e)}", "#FF6B6B")
                continue
                
        return False
        
    except FileNotFoundError:
        # 注册表路径不存在
        return False
    except PermissionError:
        # 没有权限访问注册表
        print_rgb("❌ 没有权限访问注册表！", "#FF6B6B")
        return False
    except Exception as e:
        # 其他未知错误
        print_rgb(f"❌ 检查MongoDB Compass时出错: {str(e)}", "#FF6B6B")
        return False

def get_changelog(version):
    """根据版本返回更新日志"""
    changelogs = {
        "classical": """
🌟 核心功能增强
关系系统升级
新增关系系统构建与启用功能
优化关系管理系统
改进prompt构建器结构
新增手动修改记忆库的脚本功能
增加alter支持功能
启动器优化
新增MaiLauncher.bat 1.0版本
优化Python和Git环境检测逻辑
添加虚拟环境检查功能
改进工具箱菜单选项
新增分支重置功能
添加MongoDB支持
优化脚本逻辑
修复虚拟环境选项闪退和conda激活问题
修复环境检测菜单闪退问题
修复.env.prod文件复制路径错误
日志系统改进
新增GUI日志查看器
重构日志工厂处理机制
优化日志级别配置
支持环境变量配置日志级别
改进控制台日志输出
优化logger输出格式
💻 系统架构优化
配置系统升级
更新配置文件到0.0.10版本
优化配置文件可视化编辑
新增配置文件版本检测功能
改进配置文件保存机制
修复重复保存可能清空list内容的bug
修复人格设置和其他项配置保存问题
WebUI改进
优化WebUI界面和功能
支持安装后管理功能
修复部分文字表述错误
部署支持扩展
优化Docker构建流程
改进MongoDB服务启动逻辑
完善Windows脚本支持
优化Linux一键安装脚本
新增Debian 12专用运行脚本
🐛 问题修复
功能稳定性
修复bot无法识别at对象和reply对象的问题
修复每次从数据库读取额外加0.5的问题
修复新版本由于版本判断不能启动的问题
修复配置文件更新和学习知识库的确认逻辑
优化token统计功能
修复EULA和隐私政策处理时的编码兼容问题
修复文件读写编码问题，统一使用UTF-8
修复颜文字分割问题
修复willing模块cfg变量引用问题
📚 文档更新
更新CLAUDE.md为高信息密度项目文档
添加mermaid系统架构图和模块依赖图
添加核心文件索引和类功能表格
添加消息处理流程图
优化文档结构
更新EULA和隐私政策文档
🔧 其他改进
更新全球在线数量展示功能
优化statistics输出展示
新增手动修改内存脚本（支持添加、删除和查询节点和边）
主要改进方向
完善关系系统功能
优化启动器和部署流程
改进日志系统
提升配置系统稳定性
加强文档完整性
""",
        "0.6.0-alpha": """
MaiBot 0.6.0 重磅升级！ 核心重构为独立智能体MaiCore，
新增思维流对话系统，支持拟真思考过程。
记忆与关系系统2.0让交互更自然，动态日程引擎实现智能调整。
优化部署流程，修复30+稳定性问题，隐私政策同步更新！
""",
        "0.6.2-alpha": """
摘要
优化了心流的观察系统，优化提示词和表现，现在心流表现更好！
新增工具调用能力，可以更好地获取信息
本次更新主要围绕工具系统、心流系统、消息处理和代码优化展开，新增多个工具类，优化了心流系统的逻辑，改进了消息处理流程，并修复了多个问题。
🌟 核心功能增强
工具系统
新增了知识获取工具系统，支持通过心流调用获取多种知识
新增了工具系统使用指南，详细说明工具结构、自动注册机制和添加步骤
新增了多个实用工具类，包括心情调整工具ChangeMoodTool、关系查询工具RelationshipTool、数值比较工具CompareNumbersTool、日程获取工具GetCurrentTaskTool、上下文压缩工具CompressContextTool和知识获取工具GetKnowledgeTool
更新了ToolUser类，支持自动获取已注册工具定义并调用execute方法
需要配置支持工具调用的模型才能使用完整功能
心流系统
新增了上下文压缩缓存功能，可以有更持久的记忆
新增了心流系统的README.md文件，详细介绍了系统架构、主要功能和工作流程。
优化了心流系统的逻辑，包括子心流自动清理和合理配置更新间隔。
改进了心流观察系统，优化了提示词设计和系统表现，使心流运行更加稳定高效。
更新了Heartflow类的方法和属性，支持异步生成提示词并提升生成质量。
消息处理
改进了消息处理流程，包括回复检查、消息生成和发送逻辑。
新增了ReplyGenerator类，用于根据观察信息和对话信息生成回复。
优化了消息队列管理系统，支持按时间顺序处理消息。
现在可以启用更好的表情包发送系统
""",
        "0.6.3-alpha": """
摘要
MaiBot 0.6.3 版本发布！核心重构回复逻辑，统一为心流系统管理，智能切换交互模式。
引入全新的 LPMM 知识库系统，大幅提升信息获取能力。
新增昵称系统，改善群聊中的身份识别。
提供独立的桌宠适配器连接程序。
优化日志输出，修复若干问题。
🌟 核心功能增强
统一回复逻辑 (Unified Reply Logic)
核心重构: 移除了经典 (Reasoning) 与心流 (Heart Flow) 模式的区分，将回复逻辑完全整合到 SubHeartflow 中进行统一管理，由主心流统一调控。保留 Heart FC 模式的特色功能。
智能交互模式: SubHeartflow 现在可以根据情境智能选择不同的交互模式：
普通聊天 (Normal Chat): 类似于之前的 Reasoning 模式，进行常规回复（激活逻辑暂未改变）。
心流聊天 (Heart Flow Chat): 基于改进的 PFC 模式，能更好地理解上下文，减少重复和认错人的情况，并支持工具调用以获取额外信息。
离线模式 (Offline/Absent): 在特定情况下，麦麦可能会选择暂时不查看或回复群聊消息。
状态管理: 交互模式的切换由 SubHeartflow 内部逻辑和 SubHeartflowManager 根据整体状态 (MaiState) 和配置进行管理。
流程优化: 拆分了子心流的思考模块，使整体对话流程更加清晰。
状态判断改进: 将 CHAT 状态判断交给 LLM 处理，使对话更自然。
回复机制: 实现更为灵活的概率回复机制，使机器人能够自然地融入群聊环境。
重复性检查: 加入心流回复重复性检查机制，防止麦麦陷入固定回复模式。
全新知识库系统 (New Knowledge Base System - LPMM)
引入 LPMM: 新增了 LPMM (Large Psychology Model Maker) 知识库系统，具有强大的信息检索能力，能显著提升麦麦获取和利用知识的效率。
功能集成: 集成了 LPMM 知识库查询功能，进一步扩展信息检索能力。
推荐使用: 强烈建议使用新的 LPMM 系统以获得最佳体验。旧的知识库系统仍然可用作为备选。
昵称系统 (Nickname System)
自动取名: 麦麦现在会尝试给群友取昵称，减少对易变的群昵称的依赖，从而降低认错人的概率。
持续完善: 该系统目前仍处于早期阶段，会持续进行优化。
记忆与上下文增强 (Memory and Context Enhancement)
聊天记录压缩: 大幅优化聊天记录压缩系统，使机器人能够处理5倍于之前的上下文记忆量。
长消息截断: 新增了长消息自动截断与模糊化功能，随着时间推移降低超长消息的权重，避免被特定冗余信息干扰。
记忆提取: 优化记忆提取功能，提高对历史对话的理解和引用能力。
记忆整合: 为记忆系统加入了合并与整合机制，优化长期记忆的结构与效率。
中期记忆调用: 完善中期记忆调用机制，使机器人能够更自然地回忆和引用较早前的对话。
Prompt 优化: 进一步优化了关系系统和记忆系统相关的提示词（prompt）。
私聊 PFC 功能增强 (Private Chat PFC Enhancement)
功能修复与优化: 修复了私聊 PFC 载入聊天记录缺失的 bug，优化了 prompt 构建，增加了审核机制，调整了重试次数，并将机器人发言存入数据库。
实验性质: 请注意，PFC 仍然是一个实验性功能，可能在未来版本中被修改或移除，目前不接受相关 Bug 反馈。
情感与互动增强 (Emotion and Interaction Enhancement)
全新表情包系统: 新的表情包系统上线，表情含义更丰富，发送更快速。
表情包使用优化: 优化了表情包的选择逻辑，减少重复使用特定表情包的情况，使表达更生动。
提示词优化: 优化提示词（prompt）构建，增强对话质量和情感表达。
积极性配置: 优化"让麦麦更愿意说话"的相关配置，使机器人更积极参与对话。
颜文字保护: 保护颜文字处理机制，确保表情正确显示。
工具与集成 (Tools and Integration)
动态更新: 使用工具调用来更新关系和心情，取代原先的固定更新机制。
智能调用: 工具调用时会考虑上下文，使调用更加智能。
知识库依赖: 添加 LPMM 知识库依赖，扩展知识检索工具。
💻 系统架构优化
日志优化 (Logging Optimization)
输出更清晰: 优化了日志信息的格式和内容，使其更易于阅读和理解。
模型与消息整合 (Model and Message Integration)
模型合并: 合并工具调用模型和心流模型，提高整体一致性。
消息规范: 全面改用 maim_message，移除对 rest 的支持。
(临时) 简易 GUI (Temporary Simple GUI)
运行状态查看: 提供了一个非常基础的图形用户界面，用于查看麦麦的运行状态。
临时方案: 这是一个临时性的解决方案，功能简陋，将在 0.6.4 版本中被全新的 Web UI 所取代。此 GUI 不会包含在主程序包中，而是通过一键包提供，并且不接受 Bug 反馈。
🐛 问题修复
记忆检索优化: 提高了记忆检索的准确性和效率。
修复了一些其他小问题。
🔧 其他改进
桌宠适配器 (Bug Catcher Adapter)
独立适配器: 提供了一个"桌宠"独立适配器，用于连接麦麦和桌宠。
获取方式: 可在 MaiBot 的 GitHub 组织中找到该适配器，不包含在主程序内。
""",
        "0.6.3-fix3-alpha": """
What's Changed
Fix: 修复私聊构建失败 by @tcmofashi in #906
新增lpmm的Linux快捷脚本 by @infinitycat233 in #907
feat: 新增lpmm的Linux快捷脚本 by @infinitycat233 in #901
PFC 修复 by @Dax233 in #912
feat: 更新数据路径配置，增强数据处理功能并优化错误提示 by @DrSmoothl in #916
表情包修复 by @Dax233 in #918
fix: 将左半角括号改为全角括号，保持注释左右括号匹配 by @KeepingRunning in #933
Full Changelog: 0.6.3-alpha...0.6.3-fix3-alpha
""",
        "0.6.3-fix4-alpha": """
0.6.3 的最后一个修复版
fix1-fix4修复日志
聊天状态
大幅精简聊天状态切换，提高麦麦说话能力
移除OFFLINE和ABSENT状态
移除聊天数量限制
聊天默认normal_chat
默认关闭focus_chat
知识库LPMM
增加嵌入模型一致性校验功能
强化数据导入处理，增加非法文段检测功能
修正知识获取逻辑，调整相关性输出顺序
添加数据导入的用户确认删除功能
专注模式
默认提取记忆，优化记忆表现
添加心流查重
为复读增加硬限制
支持获取子心流循环信息和状态的API接口
优化工具调用的信息获取与缓存
表情包系统
优化表情包识别和处理
提升表情匹配逻辑
日志系统
优化日志样式配置
添加丰富的追踪信息以增强调试能力
API
添加GraphQL路由支持
新增强制停止MAI Bot的API接口
""",
        "0.7.0-alpha": """
更新细节：
重构专注聊天(HFC - focus_chat)
模块化设计，可以自定义不同的部件
观察器（获取信息）
信息处理器（处理信息）
重构：聊天思考（子心流）处理器
重构：聊天处理器
重构：聊天元信息处理器
重构：工具处理器
新增：工作记忆处理器
新增：自我认知处理器
新增：动作处理器
决策器（选择动作）
执行器（执行动作）
回复动作
不回复动作
退出HFC动作
插件：禁言动作
表达器：装饰语言风格
可通过插件添加和自定义HFC部件（目前只支持action定义）
为专注模式添加关系线索
在专注模式下，麦麦可以决定自行发送语音消息（需要搭配tts适配器）
优化reply，减少复读
可自定义连续回复次数
可自定义处理器超时时间
优化普通聊天(normal_chat)
添加可学习的表达方式
增加了talk_frequency参数来有效控制回复频率
优化了进入和离开normal_chat的方式
添加时间信息
新增表达方式学习
麦麦配置单独表达方式
自主学习群聊中的表达方式，更贴近群友
可自定义的学习频率和开关
根据人设生成额外的表达方式
聊天管理
移除不在线状态
优化自动模式下normal与focus聊天的切换机制
大幅精简聊天状态切换规则，减少复杂度
移除聊天限额数量
插件系统
示例插件：禁言插件
示例插件：豆包绘图插件
人格
简化了人格身份的配置
优化了在focus模式下人格的表现和稳定性
数据库重构
移除了默认使用MongoDB，采用轻量sqlite
无需额外安装数据库
提供迁移脚本
优化
移除日程系统，减少幻觉（将会在未来版本回归）
移除主心流思考和LLM进入聊天判定
支持qwen3模型，支持自定义是否思考和思考长度
优化提及和at的判定
添加配置项
添加临时配置文件读取器
""",
        "0.8.0-alpha": """
主要升级点：
1.插件系统正式加入，现已上线插件商店，同时支持normal和focus
2.大幅降低了token消耗，更省钱
3.加入人物印象系统，麦麦可以对群友有不同的印象
4.可以精细化控制不同时段和不同群聊的发言频率
其他升级
日志系统重构使用structlog
大量稳定性修复和性能优化。
MMC启动速度加快
🔌 插件系统正式推出
全面重构的插件生态系统，支持强大 的扩展能力
插件API重构: 全面重构插件系统，统一加载机制，区分内部插件和外部插件
插件仓库：现可以分享和下载插件
依赖管理: 新增插件依赖管理系统，支持自动注册和依赖检查
命令支持: 插件现已支持命令(command)功能，提供更丰富的交互方式
示例插件升级: 更新禁言插件、豆包绘图插件、TTS插件等示例插件
配置文件管理: 插件支持自动生成和管理配置文件，支持版本自动更新
文档完善: 补全插件API文档，提供详细的开发指南
👥 人物印象系统
麦麦现在能认得群友，记住每个人的特点
人物侧写功能: 加入了人物侧写！麦麦现在能认得群友，新增用户侧写功能，将印象拆分为多方面特点
⚡ Focus模式大幅优化 - 降低Token消耗与提升速度
Planner架构更新: 更新planner架构，大大加快速度和表现效果！
处理器重构:
移除冗余处理器
精简处理器上下文，减少不必要的处理
后置工具处理器，大大减少token消耗
统计系统: 提供focus统计功能，可查看详细的no_reply统计信息
⏰ 聊天频率精细控制
支持时段化的精细频率管理，让麦麦在合适的时间说合适的话
时段化控制: 添加时段talk_frequency控制，支持不同时间段不同群聊的精细频率管理
严格频率控制: 实现更加严格和可靠的频率控制机制
Normal模式优化: 大幅优化normal模式的频率控制逻辑，提升回复的智能性
🎭 表达方式系统大幅优化
智能学习群友聊天风格，让麦麦的表达更加多样化
智能学习机制: 优化表达方式学习算法，支持衰减机制，太久没学的会被自动抛弃
表达方式选择: 新增表达方式选择器，让表达使用更合理
跨群互通配置: 表达方式现在可以选择在不同群互通或独立
可视化工具: 提供表达方式可视化脚本和检查脚本
💾 记忆系统改进
更快的记忆处理和更好的短期记忆管理
海马体优化: 大大优化海马体同步速度，提升记忆处理效率
工作记忆升级: 精简升级工作记忆模块，提供更好的短期记忆管理
聊天记录构建: 优化聊天记录构建方式，提升记忆提取效率
📊 日志系统重构
使用structlog提供更好的结构化日志
structlog替换: 使用structlog替代loguru，提供更好的结构化日志
日志查看器: 新增日志查看脚本，支持更好的日志浏览
可配置日志: 提供可配置的日志级别和格式，支持不同环境的需求
🎯 其他改进
emoji系统: 移除emoji默认发送模式，优化表情包审查功能
控制台发送: 添加不完善的控制台发送功能
行为准则: 添加贡献者契约行为准则
图像清理: 自动清理images文件夹，优化存储空间使用。
        """,
        "dev": """
开发版本，可能包含未完成的功能或实验性特性，请谨慎使用。
        """,
        "main": """
主分支版本，包含最新的稳定功能和修复。
        """
    }
    return changelogs.get(version, "❌ 未找到该版本的更新日志")

def download_git_installer():
    """下载Git安装程序"""
    # 获取最新的Git for Windows下载URL
    git_url = "https://github.com/git-for-windows/git/releases/download/v2.45.1.windows.1/Git-2.45.1-64-bit.exe"
    
    # 创建临时目录
    temp_dir = tempfile.gettempdir()
    installer_path = os.path.join(temp_dir, "Git-Installer.exe")
    
    print(Fore.CYAN + "正在下载Git安装程序...")
    
    try:
        # 尝试使用requests下载（带进度条）
        response = requests.get(git_url, stream=True)
        total_size = int(response.headers.get('content-length', 0))
        block_size = 1024
        progress_bar_length = 50
        
        with open(installer_path, 'wb') as f:
            downloaded = 0
            for data in response.iter_content(block_size):
                f.write(data)
                downloaded += len(data)
                if total_size > 0:
                    percent = downloaded / total_size
                    filled_length = int(progress_bar_length * percent)
                    bar = '#' * filled_length + '-' * (progress_bar_length - filled_length)
                    sys.stdout.write(f'\r{Fore.YELLOW}下载进度: |{bar}| {percent:.1%}')
                    sys.stdout.flush()
        sys.stdout.write('\n')
        return installer_path
    except Exception as e:
        print(Fore.RED + f"使用requests下载失败: {e}, 尝试使用urllib...")
        try:
            # 使用urllib作为备选方案
            with urlopen(git_url) as response, open(installer_path, 'wb') as f:
                total_size = response.length
                block_size = 1024 * 8
                downloaded = 0
                while True:
                    buffer = response.read(block_size)
                    if not buffer:
                        break
                    f.write(buffer)
                    downloaded += len(buffer)
                    if total_size > 0:
                        percent = downloaded / total_size
                        filled_length = int(50 * percent)
                        bar = '#' * filled_length + '-' * (50 - filled_length)
                        sys.stdout.write(f'\r{Fore.YELLOW}下载进度: |{bar}| {percent:.1%}')
                        sys.stdout.flush()
            sys.stdout.write('\n')
            return installer_path
        except Exception as e2:
            print(Fore.RED + f"下载失败: {e2}")
            return None
        
def install_git_silently(installer_path):
    """静默安装Git"""
    try:
        # 以静默方式安装Git
        command = [
            installer_path,
            '/VERYSILENT',  # 非常安静模式
            '/NORESTART',   # 不重启
            '/NOCANCEL',    # 不显示取消按钮
            '/SP-',         # 禁用安装程序启动页面
            '/CLOSEAPPLICATIONS',  # 关闭可能冲突的应用程序
            '/RESTARTAPPLICATIONS',  # 安装完成后重启应用程序
            '/COMPONENTS=""'  # 安装所有组件
        ]
        
        process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        stdout, stderr = process.communicate()
        
        if process.returncode == 0:
            print(Fore.GREEN + "✅ Git安装成功")
            # 将Git添加到系统环境变量
            os.environ['PATH'] = os.environ['PATH'] + ';C:\\Program Files\\Git\\bin'
            return True
        else:
            print(Fore.RED + f"❌ Git安装失败，错误代码: {process.returncode}")
            if stderr:
                print(Fore.RED + stderr.decode('utf-8', errors='ignore'))
            return False
    except Exception as e:
        print(Fore.RED + f"❌ 安装过程中出错: {e}")
        return False

def install_git():
    """下载并安装Git"""
    # 检查是否以管理员权限运行
    if not is_admin():
        print(Fore.YELLOW + "请求管理员权限以安装Git...")
        run_as_admin()
        return True  # 当前进程退出，等待管理员权限进程执行
    
    # 下载安装程序
    installer_path = download_git_installer()
    if not installer_path:
        return False
    
    # 安装Git
    if install_git_silently(installer_path):
        # 验证安装
        try:
            # 直接检查Git安装路径
            git_path = r"C:\Program Files\Git\bin\git.exe"
            if os.path.exists(git_path):
                version_output = subprocess.check_output([git_path, "--version"], stderr=subprocess.STDOUT, text=True)
                print(Fore.GREEN + f"✅ Git验证成功: {version_output.strip()}")
                return True
            else:
                print(Fore.YELLOW + "⚠️ Git安装完成，但未在默认路径找到，请手动检查")
                return True
        except Exception as e:
            print(Fore.YELLOW + f"⚠️ Git验证失败: {e}")
            return True
    return False

def deployment_assistant():
    """部署辅助系统主函数"""
    clear_screen()
    print_rgb("[🔧 部署辅助系统]", "#FF6B6B")
    print("================\n")
    print_rgb("当前可部署的实例版本有:", "#FFF3C2")
    versions = [
        "classical",
        "0.6.0-alpha",
        "0.6.2-alpha",
        "0.6.3-alpha",
        "0.6.3-fix3-alpha",
        "0.6.3-fix4-alpha",
        "0.7.0-alpha",
        "0.8.0-alpha",
        "dev",
        "main",
    ]
    print_rgb("以稳定性为指标推荐部署的版本有“classical”、“0.6.2-alpha”、“0.6.3-fix4-alpha”、“0.7.0-alpha”,“0.7.0-alpha”为目前的最新版本，“dev”为调试版，“main”为主要版本，请您根据实际情况选择", "#FFF3C2")
    
    for version in versions:
        print_rgb(f" {version}", "#F2FF5D")
    
    while True:
        selected_version = get_text_input("\n请输入版本号以选择您要部署的实例（输入Q返回）:", "cyan")
        if selected_version.upper() == "Q":
            return
        
        if selected_version in versions:
            break
        print_rgb("❌ 无效的版本号，请重新输入", "#FF6B6B")
    
    # 显示更新日志
    show_changelog = input("是否显示当前实例的更新日志？(Y/N) ").upper()
    if show_changelog == "Y":
        changelog = get_changelog(selected_version)
        print_rgb("\n更新日志:", "#FFF3C2")
        print(changelog)
        input("\n按回车键继续...")
    
    # 检查Python环境
    print_rgb("正在检测Python...", "#FFF3C2")
    if not is_python_installed():
        print_rgb("❌ 未检测到Python，或当前Python版本过低，无法继续部署！", "#FF6B6B")
        download_python = input("是否下载Python安装包？（Y/N）").upper()
        
        if download_python == "Y":
            print_rgb("正在下载Python安装包...", "#BADFFA")
            python_url = "https://www.python.org/ftp/python/3.12.8/python-3.12.8-amd64.exe"
            download_file(python_url, "python-3.12.8-amd64.exe")
            
            print_rgb("Python安装包下载完成！", "#6DFD8A")
            print_rgb("请双击安装包以启动安装程序，", "#FFF3C2")
            print_rgb("一定要勾选下方的Add python.exe to PATH选项！", "#FF6B6B")
            print_rgb("然后选择第一个标题为Install Now的安装选项安装", "#FFF3C2")
            print_rgb("安装完成后请手动添加Python的bin文件夹到系统环境变量中或重启计算机以自动添加", "#FFF3C2")
            
            input("\n安装完成后按回车键继续...")
            
            # 再次检查Python
            print_rgb("再次检测Python环境...", "#BADFFA")
            if not is_python_installed():
                print_rgb("❌ Python安装未完成或环境变量未配置，部署中断！", "#FF6B6B")
                return
        else:
            confirm_cancel = input("该操作将中断部署流程，是否确认？（Y/N）").upper()
            if confirm_cancel == "Y":
                return
    
    # 检查MongoDB（classical或小于0.7.0-alpha的版本需要）
    if selected_version == "classical" or selected_version < "0.7.0-alpha":
        print_rgb("正在检测Mongo DB...", "#BADFFA")
        mongodb_installed = check_mongodb_service()
        
        if mongodb_installed:
            print_rgb("已检测到Mongo DB服务，跳过Mongo DB安装", "#BADFFA")
        else:
            print_rgb("未检测到Mongo DB服务", "#FF6B6B")
            install_mongodb = input("是否安装Mongo DB？(Y/N) ").upper()
            if install_mongodb == "Y":
                install_mongodb()
            else:
                print_rgb("❌ MongoDB是必需组件，部署中断！", "#FF6B6B")
                return
        
        # 检查MongoDB Compass
        mongodb_compass_installed = check_mongodb_compass()
        if mongodb_compass_installed:
            print_rgb("已检测到MongoDB Compass，跳过安装", "#BADFFA")
        else:
            print_rgb("未检测到MongoDB Compass", "#F2FF5D")
    else:
        print_rgb("因为您将部署的实例无需用到Mongo DB，跳过Mongo DB检测", "#BADFFA")
    
    # 安装NapCat
    install_napcat = input("是否下载并安装NapCat？(Y/N) ").upper()
    if install_napcat == "Y":

        try:
            # 自动下载安装
            version, download_url = get_latest_napcat_version()
            temp_dir = tempfile.gettempdir()
            installer_path = os.path.join(temp_dir, "NapCatInstaller.exe")
            
            print_rgb(f"正在下载NapCat {version}...", "#BADFFA")
            download_napcat(download_url, installer_path)
            
            print_rgb("正在安装NapCat...", "#BADFFA")
            install_napcat(installer_path)
            
            # 自动查找路径
            napcat_path = find_napcat_exe()
            if napcat_path:
                print_rgb(f"✅ NapCat安装成功: {napcat_path}", "#6DFD8A")
                # 自动保存到配置
                selected_cfg["napcat_path"] = napcat_path
            else:
                print_rgb("⚠️ 无法自动找到NapCat路径，请手动指定", "#F2FF5D")
                napcat_path = get_input("请输入NapCat路径:", "green", is_exe=True)
                
        except Exception as e:
            print_rgb(f"❌ 自动安装失败: {str(e)}", "#FF6B6B")
            # 回退到手动安装说明
            print_rgb("请手动下载安装NapCat...", "#F2FF5D")

        print_rgb("请在浏览器中下载NapCatQQ:", "#FFF3C2")
        print_rgb("1. 打开 https://github.com/NapNeko/NapCatQQ/releases", "#A8B1FF")
        print_rgb('2. 下拉找到蓝色的"NapCat.Framework.Windows.OneKey.zip"', "#A8B1FF")
        print_rgb("3. 点击下载", "#FFF3C2")
        print_rgb("4. 下载完成后解压压缩包", "#FFF3C2")
        print_rgb("5. 运行其中的NapCatInstaller.exe文件以安装NapCat", "#FFF3C2")
        print_rgb("6. 安装完成后进入新生成的NapCat.XXXXX.Framework文件夹（如NapCat.34740.Framework）", "#FFF3C2")
        print_rgb('7. 找到"NapCatWinBootMain.exe"文件并运行', "#FFF3C2")
        print_rgb("8. 登录您的QQ账号", "#A8B1FF")
        
        open_webui = input("\n是否打开NapCat的WebUI？(Y/N) ").upper()
        if open_webui == "Y":
            print_rgb("在浏览器中打开 https://127.0.0.1:6099", "#46AEF8")
            print_rgb("在网络配置中新建Websocket客户端:", "#46AEF8")
            
            if selected_version == "classical":
                print_rgb('URL处请填写: ws://127.0.0.1:8080/onebot/v11/ws', "#A8B1FF")
            else:
                print_rgb('URL处请填写: ws://localhost:8095/', "#A8B1FF")
            
            print_rgb("记得启用配置！", "#F2FF5D")
    
    # 检查Git环境
    print(Fore.CYAN + "正在检测Git环境...")
    try:
        # 尝试直接调用git命令
        subprocess.run(["git", "--version"], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print(Fore.GREEN + "✅ 已检测到Git环境！")
    except:
        print(Fore.RED + "❌ 检测到您的计算机中未安装Git，无法使用实例部署功能！")
        choice = input(Fore.YELLOW + "是否立即安装Git？(Y/N): ").upper()
        if choice == 'Y':
            if install_git():
                print(Fore.GREEN + "✅ Git安装成功，请关闭所有窗口，然后重新启动启动器")
                print(Fore.YELLOW + "注意：安装完成后需要重启终端才能识别git命令")
                time.sleep(5)
                sys.exit(0)
            else:
                print(Fore.RED + "❌ Git安装失败，请手动安装Git")
        else:
            print(Fore.YELLOW + "请手动安装Git后重试。")
        return
    
    # 创建临时配置
    print_rgb("即将就该实例创建临时配置集！", "#BADFFA")
    temp_config = {}
    
    # 获取用户序列号（确保不重复）
    config = load_config()
    existing_serials = {cfg["serial_number"] for cfg in config["configurations"].values()}
    
    while True:
        serial_number = get_text_input("请输入该实例的用户序列号（不能为空）:", "cyan")
        if not serial_number:
            print_rgb("❌ 用户序列号不能为空！", "#FF6B6B")
            continue
        if serial_number in existing_serials:
            print_rgb("❌ 该用户序列号已存在，请使用其他序列号！", "#FF6B6B")
            continue
        break
    
    # 获取安装目录
    while True:
        install_dir = get_input("请输入该实例的安装目录路径（不能为空）:", "cyan")
        if not install_dir:
            print_rgb("❌ 安装目录不能为空！", "#FF6B6B")
            continue
        if os.path.exists(os.path.join(install_dir, "MaiM-with-u")):
            print_rgb("❌ 当前文件夹中已有重名项目文件夹，请更换目录！", "#FF6B6B")
            continue
        break
    
    # 获取昵称
    nickname = get_text_input("请输入该实例的昵称（不能为空）:", "cyan")
    while not nickname:
        print_rgb("❌ 昵称不能为空！", "#FF6B6B")
        nickname = get_text_input("请输入该实例的昵称（不能为空）:", "cyan")
    
    # 保存临时配置
    temp_config = {
        "serial_number": serial_number,
        "install_dir": install_dir,
        "nickname": nickname,
        "version": selected_version
    }
    
    with open("Install_config.toml", "w", encoding="utf-8") as f:
        toml.dump(temp_config, f)
    
    # 确认部署
    confirm = input("\n准备就绪！是否开始部署？(Y/N) ").upper()
    if confirm != "Y":
        confirm_cancel = input("确认取消部署？该操作将删除已配置完成的部署模板！（Y/N）").upper()
        if confirm_cancel == "Y":
            if os.path.exists("Install_config.toml"):
                os.remove("Install_config.toml")
            return
    
    # 开始部署
    print_rgb("正在创建项目文件夹...", "#BADFFA")
    os.makedirs(os.path.join(install_dir, "MaiM-with-u"), exist_ok=True)
    print_rgb("项目文件夹创建成功！", "#FFF3C2")
    
    if selected_version == "classical":
        deploy_classical(install_dir)
    else:
        deploy_non_classical(install_dir, selected_version)
    
    # 创建配置集
    print_rgb("正在就该实例创建配置模版...", "#BADFFA")
    config_name = get_text_input("请输入配置集名称:", "cyan")
    
    # 创建配置
    new_config = {
        "serial_number": serial_number,
        "absolute_serial_number": generate_unique_absolute_serial(config["configurations"]),
        "version_path": selected_version,
        "nickname_path": nickname,
        "mai_path": os.path.join(install_dir, "MaiM-with-u", "MaiBot"),
        "adapter_path": os.path.join(install_dir, "MaiM-with-u", "MaiBot-Napcat-Adapter") if selected_version != "classical" else "当前配置集的对象实例版本较低，无适配器",
        "napcat_path": get_input("请输入NapCat路径（可为空）:", "cyan", allow_empty=True, is_exe=True)
    }
    
    # 保存配置
    config["configurations"][config_name] = new_config
    save_config(config)
    
    # 清理临时文件
    if os.path.exists("Install_config.toml"):
        os.remove("Install_config.toml")
    
    print_rgb("配置集保存完成，您可以通过主菜单中的 [A] 选项对该实例进行二次启动！", "#FFF3C2")
    input("\n按回车键返回菜单...")

def get_latest_napcat_version():
    """获取最新的NapCat版本和下载链接"""
    api_url = "https://api.github.com/repos/NapNeko/NapCatQQ/releases/latest"
    response = requests.get(api_url)
    data = response.json()
    return data["tag_name"], data["assets"][0]["browser_download_url"]

def download_napcat(download_url, save_path):
    """下载NapCat安装程序"""
    with requests.get(download_url, stream=True) as r:
        r.raise_for_status()
        with open(save_path, 'wb') as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)

def install_napcat(installer_path):
    """安装NapCat"""
    # 静默安装参数
    subprocess.run([installer_path, "/S"], check=True)

def deploy_classical(install_dir):
    """部署classical版本"""
    project_dir = os.path.join(install_dir, "MaiM-with-u")
    os.makedirs(project_dir, exist_ok=True)
    mai_dir = os.path.join(project_dir, "MaiBot")
    
    # 组合所有命令在一个窗口中执行
    commands = [
        'Write-Host "=== 开始部署classical版本 ===" -ForegroundColor Cyan',
        f'git clone -b classical --single-branch --depth 1 https://github.com/MaiM-with-u/MaiBot.git "{mai_dir}"',
        f'cd "{mai_dir}"',
        'python -m venv maimbot',
        '.\\maimbot\\Scripts\\activate.ps1',
        'python -m pip install --upgrade pip',
        'pip install -i https://pypi.tuna.tsinghua.edu.cn/simple/ -r requirements.txt --use-pep517',
        'Write-Host "✅ 依赖安装完成" -ForegroundColor Green',
        'Write-Host "请返回启动器继续后续操作" -ForegroundColor Yellow'
    ]
    
    process = run_commands_in_single_console(
        project_dir, 
        commands,
        "克隆仓库、创建虚拟环境和安装依赖"
    )
    
    if not process:
        return
    
    input("请在新窗口中完成操作后按回车键继续...")
    
    # 首次启动
    print_rgb("准备首次启动麦麦以初始化bot...", "#BADFFA")
    print_rgb("首次启动后请输入同意并回车以同意隐私条款（若需要）", "#FFF3C2")
    print_rgb("首次启动请保持终端窗口打开20秒以上，以确保完成初始化", "#FFF3C2")
    
    commands = [
        f'cd "{mai_dir}"',
        '.\\maimbot\\Scripts\\activate.ps1',
        'nb run',
        'Write-Host "请返回启动器继续后续操作" -ForegroundColor Yellow'
    ]
    
    process = run_commands_in_single_console(
        mai_dir, 
        commands,
        "首次启动麦麦进行初始化"
    )
    
    input("完成后请按回车键继续...")
    
    # 配置启动脚本
    run_bat_path = os.path.join(mai_dir, "run.bat")
    if not os.path.exists(run_bat_path):
        with open(run_bat_path, 'w') as f:
            f.write("@echo off\n")
            f.write("call maimbot\\Scripts\\activate\n")
            f.write("python bot.py\n")
            f.write("pause\n")
    
    print_rgb("麦麦部署完成！", "#6DFD8A")

def deploy_non_classical(install_dir, version):
    """部署非classical版本"""
    project_dir = os.path.join(install_dir, "MaiM-with-u")
    os.makedirs(project_dir, exist_ok=True)
    mai_dir = os.path.join(project_dir, "MaiBot")
    adapter_dir = os.path.join(project_dir, "MaiBot-Napcat-Adapter")
    
    # 组合所有命令在一个窗口中执行
    commands = [
        f'Write-Host "=== 开始部署{version}版本 ===" -ForegroundColor Cyan',
        f'git clone --branch {version} --single-branch --depth 1 https://github.com/MaiM-with-u/MaiBot.git "{mai_dir}"',
        f'git clone https://github.com/MaiM-with-u/MaiBot-Napcat-Adapter.git "{adapter_dir}"',
        f'cd "{mai_dir}"',
        'python -m venv venv',
        '.\\venv\\Scripts\\activate.ps1',
        'python -m pip install --upgrade pip',
        'pip install -i https://mirrors.aliyun.com/pypi/simple -r requirements.txt --upgrade',
        f'cd "{adapter_dir}"',
        '.\\..\\MaiBot\\venv\\Scripts\\activate.ps1',
        'pip install -i https://mirrors.aliyun.com/pypi/simple -r requirements.txt --upgrade',
        'Write-Host "✅ 依赖安装完成" -ForegroundColor Green',
        'Write-Host "请返回启动器继续后续操作" -ForegroundColor Yellow'
    ]
    
    process = run_commands_in_single_console(
        project_dir, 
        commands,
        "克隆仓库、创建虚拟环境和安装依赖"
    )
    
    if not process:
        return
    
    input("请在新窗口中完成操作后按回车键继续...")
    
    # 配置文件处理
 # 处理适配器配置文件
    print_rgb("正在复制并重命名适配器的配置文件...", "#BADFFA")
    template_path = os.path.join(adapter_dir, "template", "template_config.toml")
    config_path = os.path.join(adapter_dir, "config.toml")
    
    if os.path.exists(template_path):
        with open(template_path, "r", encoding="utf-8") as src, open(config_path, "w", encoding="utf-8") as dst:
            dst.write(src.read())
        print_rgb("适配器配置文件已处理完成！", "#6DFD8A")
    else:
        print_rgb("❌ 未找到适配器模板文件！", "#FF6B6B")
    
    print_rgb("请您打开适配器根目录下的config.toml文件并配置白名单", "#A8B1FF")
    input("完成后请回车以继续...")
    
    # 创建麦麦配置文件夹
    print_rgb("正在创建麦麦的配置文件存放文件夹...", "#BADFFA")
    config_dir = os.path.join(mai_dir, "config")
    os.makedirs(config_dir, exist_ok=True)
    print_rgb("配置文件存放文件夹创建成功！", "#FFF3C2")
    
    # 处理麦麦配置文件
    print_rgb("正在复制并重命名麦麦的配置文件...", "#BADFFA")
    mai_templates = [
        ("bot_config_template.toml", "bot_config.toml"),
        ("lpmm_config_template.toml", "lpmm_config.toml")
    ]
    
    for src_name, dst_name in mai_templates:
        src_path = os.path.join(mai_dir, "template", src_name)
        dst_path = os.path.join(config_dir, dst_name)
        
        if os.path.exists(src_path):
            with open(src_path, "r", encoding="utf-8") as src, open(dst_path, "w", encoding="utf-8") as dst:
                dst.write(src.read())
            print_rgb(f"{dst_name} 文件已处理完成！", "#6DFD8A")
        else:
            print_rgb(f"❌ 未找到 {src_name} 文件！若您部署的版本未支持LPMM（0.6.0-alpha、0.6.2-alpha）且仅lpmm_config_template.toml文件未找到，请忽略该警告", "#FF6B6B")
    
    # 处理.env文件
    env_src = os.path.join(mai_dir, "template", "template.env")
    env_dst = os.path.join(mai_dir, ".env")
    
    if os.path.exists(env_src):
        with open(env_src, "r", encoding="utf-8") as src, open(env_dst, "w", encoding="utf-8") as dst:
            dst.write(src.read())
        print_rgb(".env 文件已处理完成！", "#6DFD8A")
    else:
        print_rgb("❌ 未找到 .env 模板文件！", "#FF6B6B")
    
    print_rgb("所有配置文件已处理完成！", "#FFF3C2")
    print_rgb("请打开根目录的.env文件配置你的API Key", "#A8B1FF")
    print_rgb("然后打开位于子目录config的lpmm_config.toml文件（若有）填写您的API Key", "#A8B1FF")
    print_rgb("然后打开位于子目录config的bot_config.toml文件照注释对您的麦麦进行自定义", "#A8B1FF")
    input("按回车键继续...")
    
    print_rgb("所有配置文件已处理完成！", "#FFF3C2")
    print_rgb("麦麦部署完成！", "#6DFD8A")

def delete_instance():
    """删除实例"""
    config = load_config()
    configs = config["configurations"]
    
    if not configs:
        print_rgb("❌ 当前没有配置任何实例！", "#FF6B6B")
        input("按回车键返回...")
        return
    
    clear_screen()
    print_color("[🔧 删除实例]", "red")
    print("================\n")
    
    # 列出所有配置集
    for cfg_name, cfg in configs.items():
        print(f"配置集: {cfg_name}")
        print_rgb(f"序列号: {cfg['serial_number']}", "#005CFA")
        print_rgb(f"昵称: {cfg['nickname_path']}", "#005CFA")
        print(f"版本: {cfg['version_path']}")
        print(f"麦麦路径: {cfg['mai_path']}")
        print(f"适配器路径: {cfg['adapter_path']}")
        print("——————————")
    
    print("\n==================")
    print_color(" [A] 释放实例", "red")
    print_color(" [Q] 返回上级菜单", "blue")
    print("==================")
    
    choice = input("请选择操作: ").upper()
    if choice != "A":
        return
    
    # 选择要释放的实例
    serial_number = get_text_input("请输入要释放的实例的用户序列号:", "red")
    target_cfg = next((cfg for cfg in configs.values() if cfg["serial_number"] == serial_number), None)
    
    if not target_cfg:
        print_rgb("❌ 未找到匹配的实例！", "#FF6B6B")
        input("按回车键返回...")
        return
    
    # 确认删除
    print_color("\n==================", "red")
    print_color("-+-+-危险操作-+-+-", "red")
    print_color("==================", "red")
    print_color("该操作将彻底删除您选中的实例以达到释放实例的目的", "red")
    print_color("该操作将不可撤销", "red")
    print_rgb("我们强烈建议您备份.env、bot_config.toml、lpmm_config.toml等重要文件", "#A8B1FF")
    
    if target_cfg["version_path"] == "0.7.0-alpha":
        print_rgb("如果您使用的是0.7.0-alpha版本的实例，我们非常强烈建议您备份MaiBot.db文件", "#A8B1FF")
        print_color("它是该实例的数据库文件，位于根目录中的data文件夹中", "yellow")
    
    print_color("若您的实例使用的是Mongo DB数据库，我们不会清空它，那需要您手动清理", "yellow")
    print_color("但我们并不推荐您这样做，因为它无法便捷的备份", "yellow")
    print_color("我们推荐您采用更改数据库名的方式变相备份它", "yellow")
    print_color("您可以备份完成后再推进实例释放流程", "yellow")
    
    confirm = input("\n确认继续推进实例释放流程？(Y/N) ").upper()
    if confirm != "Y":
        return
    
    # 最终确认
    print_color("\n==================", "red")
    print_color("-+-+-危险操作-+-+-", "red")
    print_color("==================", "red")
    print_color("这是最后一次要求您确认释放实例操作", "red")
    print_color("一旦您确认，我们将立即释放实例", "red")
    print_color("该操作您无法撤销！", "red")
    print_rgb(f"若您仍旧希望释放该实例，请再次输入您选定的实例的用户序列号 [{serial_number}]","#A8B1FF")
    print_color("若您未输入实例的用户序列号直接回车，我们将视为放弃实例释放操作", "red")
    print("==================")
    
    reenter_serial = input("> ").strip()
    if reenter_serial != serial_number:
        print_rgb("❌ 序列号不匹配，操作已取消！", "#FF6B6B")
        return
    
    # 删除实例
import shutil  # 需要导入shutil模块进行目录删除

# ... 其他代码保持不变 ...

def delete_instance():
    """删除实例"""
    config = load_config()
    configs = config["configurations"]
    
    if not configs:
        print_rgb("❌ 当前没有配置任何实例！", "#FF6B6B")
        input("按回车键返回...")
        return
    
    clear_screen()
    print_color("[🔧 删除实例]", "red")
    print("================\n")
    
    # 列出所有配置集
    for cfg_name, cfg in configs.items():
        print(f"配置集: {cfg_name}")
        print_rgb(f"序列号: {cfg['serial_number']}", "#005CFA")
        print_rgb(f"昵称: {cfg['nickname_path']}", "#005CFA")
        print(f"版本: {cfg['version_path']}")
        print(f"麦麦路径: {cfg['mai_path']}")
        print(f"适配器路径: {cfg['adapter_path']}")
        print("——————————")
    
    print("\n==================")
    print_color(" [A] 释放实例", "red")
    print_rgb(" [Q] 返回上级菜单", "#7E1DE4")
    print("==================")
    
    choice = input("请选择操作: ").upper()
    if choice != "A":
        return
    
    # 选择要释放的实例
    serial_number = get_text_input("请输入要释放的实例的用户序列号:", "red")
    target_cfg = next((cfg for cfg in configs.values() if cfg["serial_number"] == serial_number), None)
    
    if not target_cfg:
        print_rgb("❌ 未找到匹配的实例！", "#FF6B6B")
        input("按回车键返回...")
        return
    
    # 确认删除
    print_color("\n==================", "red")
    print_color("-+-+-危险操作-+-+-", "red")
    print_color("==================", "red")
    print_color("该操作将彻底删除您选中的实例以达到释放实例的目的", "red")
    print_color("该操作将不可撤销", "red")
    print_rgb("我们强烈建议您备份.env、bot_config.toml、lpmm_config.toml等重要文件", "#A8B1FF")
    
    if target_cfg["version_path"] == "0.7.0-alpha":
        print_rgb("如果您使用的是0.7.0-alpha版本的实例，我们非常强烈建议您备份MaiBot.db文件", "#A8B1FF")
        print_color("它是该实例的数据库文件，位于根目录中的data文件夹中", "yellow")
    
    print_color("若您的实例使用的是Mongo DB数据库，我们不会清空它，那需要您手动清理", "yellow")
    print_color("但我们并不推荐您这样做，因为它无法便捷的备份", "yellow")
    print_color("我们推荐您采用更改数据库名的方式变相备份它", "yellow")
    print_color("您可以备份完成后再推进实例释放流程", "yellow")
    
    confirm = input("\n确认继续推进实例释放流程？(Y/N) ").upper()
    if confirm != "Y":
        return
    
    # 最终确认
    print_color("\n==================", "red")
    print_color("-+-+-危险操作-+-+-", "red")
    print_color("==================", "red")
    print_color("这是最后一次要求您确认释放实例操作", "red")
    print_color("一旦您确认，我们将立即释放实例", "red")
    print_color("该操作您无法撤销！", "red")
    print(f"若您仍旧希望释放该实例，请再次输入您选定的实例的用户序列号 [{serial_number}]")
    print_color("若您未输入实例的用户序列号直接回车，我们将视为放弃实例释放操作", "red")
    print("==================")
    
    reenter_serial = input("> ").strip()
    if reenter_serial != serial_number:
        print_rgb("❌ 序列号不匹配，操作已取消！", "#FF6B6B")
        return
    
    # 删除实例 - 实际执行删除操作
    version = target_cfg["version_path"]
    deleted = False
    
    try:
        if is_legacy_version(version):
            print_rgb("正在释放当前实例的麦麦本体...", "#BADFFA")
            mai_path = target_cfg["mai_path"]
            if os.path.exists(mai_path):
                # 实际删除目录
                shutil.rmtree(mai_path)
                print_rgb(f"✅ 已删除麦麦本体目录: {mai_path}", "#FFF3C2")
                deleted = True
            else:
                print_rgb("⚠️ 麦麦本体路径不存在，跳过删除", "#A8B1FF")
        else:
            print_rgb("正在释放当前实例的麦麦本体...", "#BADFFA")
            mai_path = target_cfg["mai_path"]
            if os.path.exists(mai_path):
                # 实际删除目录
                shutil.rmtree(mai_path)
                print_rgb(f"✅ 已删除麦麦本体目录: {mai_path}", "#FFF3C2")
                deleted = True
            else:
                print_rgb("⚠️ 麦麦本体路径不存在，跳过删除", "#A8B1FF")
            
            print_rgb("正在释放当前实例的适配器...", "#BADFFA")
            adapter_path = target_cfg["adapter_path"]
            # 检查适配器路径是否有效（非占位符）
            if adapter_path and adapter_path != "当前配置集的对象实例版本较低，无适配器" and os.path.exists(adapter_path):
                # 实际删除目录
                shutil.rmtree(adapter_path)
                print_rgb(f"✅ 已删除适配器目录: {adapter_path}", "#FFF3C2")
                deleted = True
            else:
                print_rgb("⚠️ 适配器路径不存在或无效，跳过删除", "#A8B1FF")
        
        # 删除配置集
        config_name = next((name for name, cfg in configs.items() if cfg == target_cfg), None)
        if config_name:
            del configs[config_name]
            config["configurations"] = configs
            save_config(config)
            print_rgb("✅ 指向配置集已删除！", "#FFF3C2")
            deleted = True
        
        if deleted:
            print_rgb("✅ 实例释放操作已完成！", "#A8B1FF")
            print_rgb("说声再见吧~~", "#96FD6D")
        else:
            print_rgb("⚠️ 未执行任何删除操作", "#A8B1FF")
    except Exception as e:
        print_rgb(f"❌ 删除过程中发生错误: {str(e)}", "#FF6B6B")
        print_rgb("⚠️ 部分文件可能未被完全删除", "#F2FF5D")
    
    input("\n按回车键返回...")
    
    # 删除配置集
    config_name = next((name for name, cfg in configs.items() if cfg == target_cfg), None)
    if config_name:
        del configs[config_name]
        config["configurations"] = configs
        save_config(config)
        print_rgb("指向配置集已删除！", "#FFF3C2")
    
    print_rgb("实例释放操作已完成！", "#A8B1FF")
    print_rgb("说声再见吧~~", "#96FD6D")
    input("\n按回车键返回...")

def update_instance():
    """更新实例"""
    config = load_config()
    configs = config["configurations"]
    
    # 过滤出可更新的配置集（仅限classical/dev/main）
    updatable_configs = {}
    for cfg_name, cfg in configs.items():
        version = cfg.get("version_path", "")
        if version.lower() in ["classical", "dev", "main"]:
            updatable_configs[cfg_name] = cfg
    
    if not updatable_configs:
        print_rgb("❌ 当前没有可更新的实例配置！", "#FF6B6B")
        print_rgb("仅支持版本号为classical/dev/main的实例", "#F2FF5D")
        input("按回车键返回...")
        return
    
    clear_screen()
    print_rgb("[🔧 实例更新]", "#FF6B6B")
    print("================\n")
    print_rgb("可更新的实例列表：", "#FFF3C2")
    
    # 列出可更新的实例
    for cfg_name, cfg in updatable_configs.items():
        print(f"配置集: {cfg_name}")
        print_rgb(f"序列号: {cfg['serial_number']}", "#005CFA")
        print_rgb(f"昵称: {cfg['nickname_path']}", "#005CFA")
        print(f"版本: {cfg['version_path']}")
        print(f"麦麦路径: {cfg['mai_path']}")
        print("——————————")
    
    # 获取用户选择的序列号
    serial_number = get_text_input("\n请输入要更新的实例的用户序列号:", "cyan")
    selected_cfg = next(
        (cfg for cfg in updatable_configs.values() if cfg["serial_number"] == serial_number),
        None
    )
    
    if not selected_cfg:
        print_rgb("❌ 未找到匹配的实例！", "#FF6B6B")
        input("按回车键返回...")
        return
    
    # 显示警告信息
    version = selected_cfg["version_path"]
    nickname = selected_cfg["nickname_path"]
    print_rgb(f"\n当前操作将对实例[{version}][{nickname}]执行git pull指令", "#FF6B6B")
    print_rgb("在此之前建议您备份以下重要文件：", "#FFF3C2")
    print_rgb("- .env", "#F2FF5D")
    print_rgb("- bot_config.toml", "#F2FF5D")
    print_rgb("- lpmm_config.toml", "#F2FF5D")
    if version == "0.7.0-alpha":
        print_rgb("- MaiBot.db (位于data文件夹)", "#F2FF5D")
    print_rgb("\n相较于'实例更新'功能，我们更推荐您部署一例新的实例", "#FFF3C2")
    
    confirm = input("您确定要继续吗？（Y/N）").upper()
    if confirm != "Y":
        print_rgb("更新操作已取消！", "#F2FF5D")
        return
    
    # 获取拉取深度
    while True:
        try:
            depth = int(input("您准备拉取当前分支的多少次提交记录？（1~2147483647）: "))
            if 1 <= depth <= 2147483647:
                break
            print_rgb("❌ 输入必须在1~2147483647之间！", "#FF6B6B")
        except ValueError:
            print_rgb("❌ 请输入有效的整数！", "#FF6B6B")
    
    # 最终确认
    print_rgb(f"\n将拉取 {depth} 次提交记录", "#FFF3C2")
    final_confirm = input("您确定要继续吗？（Y/N）").upper()
    if final_confirm != "Y":
        print_rgb("更新操作已取消！", "#F2FF5D")
        return
    
    # 执行更新
    mai_path = selected_cfg["mai_path"]
    branch = version.lower()
    
    # 验证路径是否存在
    if not os.path.exists(mai_path):
        print_rgb(f"❌ 路径不存在: {mai_path}", "#FF6B6B")
        input("按回车键返回...")
        return
    
    # 检查是否git仓库
    git_dir = os.path.join(mai_path, ".git")
    if not os.path.exists(git_dir):
        print_rgb("❌ 目标路径不是Git仓库！", "#FF6B6B")
        input("按回车键返回...")
        return
    
    # 构建PowerShell命令
    commands = [
        f'cd "{mai_path}"',
        f'git fetch --depth={depth} origin {branch}',
        f'git merge FETCH_HEAD --no-commit --no-ff',
        '$conflictFiles = git diff --name-only --diff-filter=M --relative HEAD FETCH_HEAD',
        'if ($conflictFiles) { git checkout --ours $conflictFiles }',
        f'git commit -m "Merge remote-tracking branch \'origin/{branch}\' into current branch with local changes preserved"'
    ]
    
    # 执行命令
    process = run_commands_in_single_console(
        mai_path, 
        commands,
        f"更新 {nickname} 实例"
    )
    
    if process:
        print_rgb("✅ 更新命令已启动！", "#6DFD8A")
        print_rgb("请在PowerShell窗口中查看更新进度", "#F2FF5D")
    else:
        print_rgb("❌ 更新命令启动失败！", "#FF6B6B")
    
    input("\n按回车键返回...")

def deployment_menu():
    """部署子菜单"""
    while True:
        clear_screen()
        print_rgb("[🔧 部署辅助系统]", "#FF6B6B")
        print("================")
        print_rgb("======（当前仅支持安装Git环境的部署）======", "#FFF3C2")
        print_rgb("\n [A] 辅助部署", "#A8B1FF")
        print_rgb(" [B] 更新实例", "#6DFD8A")  # 新增选项
        print_rgb(" [C] 删除实例", "#FF6B6B")
        print_rgb(" [D] 跳转到配置菜单","#F2FF5D")
        print_rgb(" [E] 跳转到知识库构建","#00FFBB")
        print_rgb(" [F] 跳转到数据库迁移","#28DCF0")
        print_rgb(" [Q] 返回主菜单","#7E1DE4")
        print("================")

        choice = input("请选择操作: ").upper()

        if choice == "Q":
            break
        elif choice == "A":
            deployment_assistant()
        elif choice == "B":
            update_instance()
        elif choice == "C":
            delete_instance()
        elif choice == "D":
            config_menu()
        elif choice == "E":
            lpmm_menu()
        elif choice == "F":
            migrate_mongodb_to_sqlite()
        else:
            print_rgb("❌ 无效选项", "#FF6B6B")
            time.sleep(1)

def about_menu():
    """关于本程序菜单"""
    while True:
        clear_screen()
        print_rgb("===关于本程序===", "#BADFFA")
        print_rgb("当前启动器版本 V3.4.1", "#BADFFA")
        print("=================")
        print_rgb(" [A] 程序概述", "#4AF933")
        print_rgb(" [B] 使用说明", "#F2FF5D")
        print_rgb(" [C] 更新日志", "#FF6B6B")
        print_rgb(" [D] 开源许可", "#00FFBB")
        print_rgb(" [E] 其他信息", "#46AEF8")   
        print_rgb(" [Q] 返回主菜单", "#7E1DE4")
        print("=================")
        
        choice = input("请选择操作: ").upper()
        
        if choice == "Q":
            break
            
        clear_screen()
        print_rgb("===关于本程序===", "#BADFFA")
        
        if choice == "A":
            print_rgb("程序概述：", "#4AF933")
            print("麦麦启动器是简化MaiBot框架管理的工具，提供：")
            print("1. 多实例管理：支持创建/切换不同版本实例")
            print("2. 智能启动：自动适配新旧版本启动方式")
            print("3. 配置管理：可视化编辑路径和参数")
            print("4. 知识库构建：LPMM全流程支持")
            print("5. 部署辅助：一键部署实例+环境检测")
            print("6. 数据迁移：MongoDB→SQLite转换工具")
            print("通过彩色交互界面简化操作流程，支持Windows系统环境。")
            
        elif choice == "B":
            print_rgb("🌈 麦麦启动器使用说明", "#F2FF5D")
            print("\n核心功能：")
            print(" 1.启动类：")
            print("   A：运行麦麦本体")
            print("   B：运行麦麦+NapCatQQ+MongoDB")
            print(" 2.配置类：")
            print("   C：管理多实例配置（创建/修改/检查）")
            print(" 3.功能类：")
            print("   D：LPMM知识库构建（文本分割/实体提取）")
            print("   E：知识库迁移（MongoDB→SQLite）")
            print(" 4.部署类：")
            print("   F：实例管理（部署/更新/删除实例）")
            print("   支持版本：classical/0.6.0~0.7.0/dev/main")
            print(" 5.关于类：")
            print("   G：查看程序信息/更新日志")
            print(" 6.退出类：")
            print("   退出程序")
            print("--------------------")
            print_rgb("🚀 快速上手：","#F2FF5D")
            print("\n 1.首次使用：")
            print("   通过F部署新实例")
            print("   通过C配置路径")
            print(" 2.日常使用：")
            print("   选择A或B启动麦麦")
            print("   使用D构建知识库")
            print(" 3.维护操作：")
            print("   F→C：更新实例（需Git环境）")
            print("   F→B：删除不再需要的实例")
            print("   E：数据库迁移（旧版→新版）")
            print("--------------------")
            print_rgb("⚠️ 重要提示：","#FF0000")
            print_rgb("\n 1.路径要求：","#FF6B6B")
            print_rgb("   所有路径不能包含中文", "#C4A4FF")
            print_rgb("   建议使用英文路径", "#C4A4FF")
            print_rgb(" 2.更新建议：", "#FF6B6B")
            print_rgb("   更新前最好备份:", "#C4A4FF")
            print_rgb("    - .env文件", "#C4A4FF")
            print_rgb("    - bot_config.toml", "#C4A4FF")
            print_rgb("    - MaiBot.db（0.7.0-alpha版本）", "#C4A4FF")
            print_rgb("   推荐部署新实例而非更新", "#C4A4FF")
            print_rgb(" 3.Git要求：", "#FF6B6B")
            print_rgb("   实例更新及实例部署功能需要安装Git", "#C4A4FF")
            print_rgb("   下载：https://git-scm.com/downloads", "#46AEF8")
            print("--------------------")
            print_rgb("ℹ️ 更多信息：","#F2FF5D")
            print_rgb("\n GitHub仓库：", "#C4A4FF")
            print_rgb(" https://github.com/xiaoCZX/MaiMbot-initiate","#46AEF8")
            
        elif choice == "C":
            print_rgb("更新日志：V3.4.2", "#FF6B6B")
            print("\n新增功能")
            print("- 实例更新功能：支持一键更新实例")
            print("- 添加“关于本程序”菜单,你可以了解到本程序的更多信息")
            print("--------------------")
            print_rgb("V3.4.1", "#46AEF8")
            print("新增功能：")
            print("- 部署辅助系统：支持一键部署多版本实例")
            print("- 实例删除功能：彻底释放资源")
            print("- 彩色输出界面：RGB控制台显示")
            print("\n功能优化：")
            print("- 菜单分类重组（启动/配置/功能/部署/退出）")
            print("- 多配置集支持+序列号标识")
            print("- 旧版本兼容run.bat启动")
            print("- 路径中文检测+文件验证")
            print("\n问题修复：")
            print("- 配置加载异常处理")
            print("- 旧版本run.bat缺失提示")
            print("- 适配器路径验证逻辑")
            print("--------------------")
            print_rgb("V3.4", "#46AEF8")
            print("\n核心功能：")
            print("- 配置文件迁移JSON→TOML格式")
            print("- 多实例管理支持")
            print("- 多版本启动机制（新旧版本区分）")
            print("- 知识库迁移工具（MongoDB→SQLite）")
            print("- 部署辅助系统框架")
            print("\n优化改进：")
            print("- 配置集管理系统")
            print("- LPMM知识库构建流程")
            print("- 路径验证逻辑")
            print("- 错误处理机制")
            print("--------------------")
            print_rgb("V3.3", "#46AEF8")
            print("\n架构重构：")
            print("- PowerShell→Python迁移")
            print("- INI→JSON配置格式")
            print("- 模块化函数设计")
            print("\n功能增强：")
            print("- 自动路径检索")
            print("- 多层路径验证")
            print("- 彩色终端输出")
            print("- 进程检测优化")
            print("--------------------")
            print_rgb("V3.2", "#46AEF8")
            print("\nLPMM知识库：")
            print("- 新增专属构建菜单")
            print("- 一条龙构建流程")
            print("- 文本分割/实体提取/知识图谱导入")
            print("- 操作确认机制")
            print("\n界面优化：")
            print("- 多层子菜单系统")
            print("- 改进颜色方案")
            print("- 详细进度反馈")
            print("--------------------")
            print_rgb("V3.1", "#46AEF8")
            print("\n核心改进：")
            print("- 批处理→PowerShell迁移")
            print("- 独立config.ini配置")
            print("- 智能路径验证")
            print("- 容错机制增强")
            print("\n用户体验：")
            print("- 支持拖拽输入路径")
            print("- UTF-8编码强制设置")
            print("-清晰步骤提示")
            print("- 虚拟环境路径处理")
            print("--------------------")
            print_rgb("V3.0", "#46AEF8")
            print("\n功能扩展：")
            print("- 新增“运行麦麦+NapCatQQ+MongoDB”选项")
            print("- 退出程序功能")
            print("- NapCatQQ路径灵活处理")
            print("\n交互优化：")
            print("- 字母选项菜单")
            print("- 横线/等号分隔界面")
            print("- 拖拽路径输入支持")
            print("--------------------")
            print_rgb("\nV2.1", "#46AEF8")
            print("- 修复含空格/特殊字符路径问题")
            print("- 新增拖拽文件输入功能")
            print("--------------------")
            print_rgb("V2.0", "#46AEF8")
            print("\n核心改进：")
            print("- 独立config.ini配置管理")
            print("- 智能路径验证")
            print("- 容错机制增强")
            print("- UTF-8编码支持")
            print("\n用户体验：")
            print("- 保留命令窗口查看状态")
            print("- 清晰步骤提示")
            print("- 虚拟环境路径兼容")
            print("--------------------")
            print_rgb("\nV1.1", "#46AEF8")
            print("- 修复路径检索问题")
            print("- 优化一键启动逻辑")
            print("- 简化配置流程")
            print("--------------------")
            print_rgb("V1.0", "#46AEF8")
            print("\n初始版本：")
            print("- 基础启动功能")
            print("- 路径配置支持")
            print("- 批处理脚本实现")
            print("- 解决中文路径问题")
            print("--------------------")
            
        elif choice == "D":  # 开源许可选项
            print_rgb("开源许可：Apache License 2.0", "#00FFBB")
            print("="*50)
            print("Copyright 2025 xiaoCZX\n")
            print("Licensed under the Apache License, Version 2.0 (the \"License\");")
            print("you may not use this file except in compliance with the License.")
            print("You may obtain a copy of the License at\n")
            print("    http://www.apache.org/licenses/LICENSE-2.0\n")
            print("Unless required by applicable law or agreed to in writing, software")
            print("distributed under the License is distributed on an \"AS IS\" BASIS,")
            print("WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.")
            print("See the License for the specific language governing permissions and")
            print("limitations under the License.\n")
            print("="*50)
            print_rgb("关键条款摘要：", "#00FFBB")
            print("1. 允许商业使用、修改、分发")
            print("2. 必须保留版权声明和许可声明")
            print("3. 明确声明无担保责任")
            print("4. 使用本软件造成的损害不承担责任")
            print("5. 贡献者需授权专利使用权")
            print("\n完整许可证文本请访问：")
            print_rgb("https://github.com/xiaoCZX/MaiMbot-initiate?tab=License-1-ov-file", "#46AEF8")
            
        elif choice == "E":  # 其他信息选项
            print_rgb("其他信息：", "#46AEF8")
            print("更多详情请访问GitHub仓库：")
            print_rgb("https://github.com/xiaoCZX/MaiMbot-initiate", "#46AEF8")
            print("\n开源许可：Apache License 2.0")
            print("作者：xiaoCZX")
            print("最后更新：2025年6月17日")

        else:
            print_rgb("❌ 无效选项", "#FF6B6B")
            time.sleep(1)
            continue
            
        input("\n按回车键返回...")

# ====================== 主函数 ======================
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
            migrate_mongodb_to_sqlite()
        elif choice == "F":
            deployment_menu()
        elif choice == "G":
            about_menu()
        else:
            print_rgb("❌ 无效选项", "#FF6B6B")
            time.sleep(1)

if __name__ == "__main__":
    # 设置控制台编码
    if os.name == 'nt':
        ctypes.windll.kernel32.SetConsoleOutputCP(65001)
    main()