import os
import json
import subprocess
import re
import ctypes
from colorama import Fore, Style, init
import time

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
    print_color(" [C] 配置内容（覆盖先前配置或新建配置）", "blue")
    print_color(" [D] 检查现有配置", "blue")
    print_color(" [E] LPMM知识库构建", "cyan")
    print_color(" [Q] 👋退出程序", "purple")
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

def run_lpmm_text_split(config):
    """运行LPMM文本分割"""
    print_color("该进程将处理\\MaiBot\\data/lpmm_raw_data目录下的所有.txt文件。", "cyan")
    print_color("处理后的数据将全部合并为一个.JSON文件并储存在\\MaiBot\\data/imported_lpmm_data目录中。", "cyan")
    success = run_lpmm_script(
        config["mai_path"],
        "raw_data_preprocessor.py",
        "LPMM知识库文本分割"
    )
    if success:
        print_color("\nLPMM知识库文本分割已结束！", "green")
    return success

def run_lpmm_entity_extract(config):
    """运行LPMM实体提取"""
    warnings = [
        "实体提取操作将会花费较多api余额和时间，建议在空闲时段执行。举例：600万字全剧情，提取选用deepseek v3 0324，消耗约40元，约3小时。",
        "建议使用硅基流动的非Pro模型，或者使用可以用赠金抵扣的Pro模型",
        "请确保账户余额充足，并且在执行前确认无误。"
    ]
    success = run_lpmm_script(
        config["mai_path"],
        "info_extraction.py",
        "LPMM知识库实体提取",
        warnings
    )
    if success:
        print_color("\nLPMM知识库实体提取已结束！", "green")
    return success

def run_lpmm_knowledge_import(config):
    """运行LPMM知识图谱导入"""
    warnings = [
        "OpenIE导入时会大量发送请求，可能会撞到请求速度上限，请注意选用的模型",
        "同之前样例：在本地模型下，在70分钟内我们发送了约8万条请求，在网络允许下，速度会更快",
        "推荐使用硅基流动的Pro/BAAI/bge-m3",
        "每百万Token费用为0.7元",
        "知识导入时，会消耗大量系统资源，建议在较好配置电脑上运行",
        "同上样例，导入时10700K几乎跑满，14900HX占用80%，峰值内存占用约3G"
    ]
    success = run_lpmm_script(
        config["mai_path"],
        "import_openie.py",
        "LPMM知识库知识图谱导入",
        warnings
    )
    if success:
        print_color("\nLPMM知识库知识图谱导入已结束！", "green")
    return success

def run_lpmm_pipeline(config):
    """运行LPMM一条龙服务"""
    if run_lpmm_text_split(config):
        print_color("\nLPMM知识库文本分割已结束！", "green")
        print_color("是否继续进行实体提取操作？(Y/N)：", "yellow")
        if input().upper() == 'Y':
            if run_lpmm_entity_extract(config):
                print_color("\nLPMM知识库实体提取已结束！", "green")
                while True:
                    print_color("\n [A] 实体提取可能失败，重新提取？", "red")
                    print_color(" [B] 继续进行知识图谱导入操作", "green")
                    print_color(" [C] 取消后续操作并返回主菜单", "yellow")
                    choice = input("请选择操作: ").upper()
                    
                    if choice == 'A':
                        if not run_lpmm_entity_extract(config):
                            break
                    elif choice == 'B':
                        if run_lpmm_knowledge_import(config):
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

        if choice == "Q":
            break
        elif choice == "A":
            run_lpmm_pipeline(config)
        elif choice == "B":
            run_lpmm_text_split(config)
        elif choice == "C":
            run_lpmm_entity_extract(config)
        elif choice == "D":
            run_lpmm_knowledge_import(config)

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
        elif choice == "E":
            lpmm_menu()


if __name__ == "__main__":
    # 设置控制台编码
    if os.name == 'nt':
        ctypes.windll.kernel32.SetConsoleOutputCP(65001)
    main()