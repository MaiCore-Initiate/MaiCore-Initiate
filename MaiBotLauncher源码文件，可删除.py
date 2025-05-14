import os
import json
import subprocess
import re
import ctypes
from colorama import Fore, Style, init

# 初始化颜色支持
init(autoreset=True)

CONFIG_FILE = "config.json"
CONFIG_TEMPLATE = {
    "mai_path": "",
    "adapter_path": "",
    "napcat_path": ""
}

# 颜色定义
COLORS = {
    "blue": Fore.CYAN,
    "green": Fore.GREEN,
    "yellow": Fore.YELLOW,
    "red": Fore.RED,
    "gray": Fore.LIGHTBLACK_EX
}


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
    print_color(" [C] 配置内容（覆盖先前配置或新建配置）", "blue")
    print_color(" [D] 检查现有配置", "blue")
    print_color(" [Q] 👋退出程序", "blue")
    print("================\n")


def load_config():
    try:
        with open(CONFIG_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except:
        return CONFIG_TEMPLATE.copy()


def save_config(config):
    with open(CONFIG_FILE, 'w', encoding='utf-8') as f:
        json.dump(config, f, indent=2)


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


def config_menu():
    clear_screen()
    print_color("[🔧 配置模式]", "green")
    print("================")
    print_color(" [A] 自动检索麦麦", "green")
    print_color(" [B] 手动配置", "green")
    print_color(" [Q] 返回上级", "blue")
    print("================")

    choice = input("请选择操作: ").upper()
    config = load_config()

    if choice == "A":
        # 自动检测麦麦
        mai_path = auto_detect_mai()
        if not mai_path:
            mai_path = get_input("请输入麦麦本体路径：", "green", check_file="bot.py")
        else:
            print_color(f"✅ 已自动检测到麦麦本体：{mai_path}", "green")

        # 自动检测适配器
        adapter_path = auto_detect_adapter()
        if not adapter_path:
            adapter_path = get_input("请输入适配器路径：", "green", check_file="main.py")
        else:
            print_color(f"✅ 已自动检测到适配器：{adapter_path}", "green")

        napcat_path = get_input("请输入NapCatQQ路径（可为空）：", "green",
                                allow_empty=True, is_exe=True)

        config.update({
            "mai_path": mai_path,
            "adapter_path": adapter_path,
            "napcat_path": napcat_path
        })
        save_config(config)
        print_color("🎉 配置已保存！", "green")

    elif choice == "B":
        config["mai_path"] = get_input("请输入麦麦本体路径：", "green", check_file="bot.py")
        config["adapter_path"] = get_input("请输入适配器路径：", "green", check_file="main.py")
        config["napcat_path"] = get_input("请输入NapCatQQ路径（可为空）：", "green",
                                          allow_empty=True, is_exe=True)
        save_config(config)
        print_color("🎉 配置已保存！", "green")

    input("\n按回车键返回主菜单...")


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
    config = load_config()
    clear_screen()
    print_color("[🔧 当前配置]", "green")
    for k, v in config.items():
        print(f"{k}: {v if v else '未配置'}")

    # 检查NapCat路径
    if config["napcat_path"]:
        valid, msg = validate_exe_path(config["napcat_path"])
        if not valid:
            print_color(f"❌ NapCatQQ路径错误!：{msg}", "red")

    print("\n=================")
    print_color(" [A] 🔧 继续配置", "green")
    print_color(" [B] 返回首页", "yellow")
    choice = input("请选择操作: ").upper()

    if choice == "A":
        new_path = get_input("请输入新的NapCatQQ路径：", "green",
                             allow_empty=True, is_exe=True)
        config["napcat_path"] = new_path
        save_config(config)
        print_color("✅ 配置已更新！", "green")
        input("按回车键返回主菜单...")


def validate_config(config):
    """完整的配置验证"""
    errors = []

    # 检查麦麦本体
    valid, msg = validate_path(config["mai_path"], check_file="bot.py")
    if not valid:
        errors.append(f"麦麦本体路径：{msg}")

    # 检查适配器
    valid, msg = validate_path(config["adapter_path"], check_file="main.py")
    if not valid:
        errors.append(f"适配器路径：{msg}")

    # 检查NapCat路径
    if config["napcat_path"]:
        valid, msg = validate_exe_path(config["napcat_path"])
        if not valid:
            errors.append(f"NapCatQQ路径：{msg}")

    return errors

def run_mai():
    config = load_config()

    # 完整验证配置
    errors = validate_config(config)
    if errors:
        print_color("❌ 发现配置错误!：", "red")
        for error in errors:
            print_color(f"• {error}", "red")
        input("按回车键返回主菜单...")
        return

    try:
        # 启动麦麦本体（直接运行Python）
        success1 = run_script(
            work_dir=config["mai_path"],
            commands="python bot.py"
        )

        # 启动适配器（包含虚拟环境激活）
        venv_activate = os.path.normpath(
            os.path.join(
                config["mai_path"],
                "venv",
                "Scripts",
                "activate"
            )
        )
        success2 = run_script(
            work_dir=config["adapter_path"],
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
            check_config()


if __name__ == "__main__":
    # 设置控制台编码
    if os.name == 'nt':
        ctypes.windll.kernel32.SetConsoleOutputCP(65001)
    main()