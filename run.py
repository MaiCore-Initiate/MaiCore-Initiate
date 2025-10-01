def get_venv_exe_path():
    import sys
    from pathlib import Path
    # 1. 程序实际目录（兼容打包和源码）
    if getattr(sys, 'frozen', False):
        base_dir = Path(sys.executable).parent
    else:
        base_dir = Path(__file__).parent
    candidate = base_dir / 'create_venv.exe'
    if candidate.exists():
        return candidate
    # 2. 当前工作目录
    candidate = Path.cwd() / 'create_venv.exe'
    if candidate.exists():
        return candidate
    # 3. 项目根目录（假设 run.py 在根目录或 src 下）
    candidate = base_dir.parent / 'create_venv.exe'
    if candidate.exists():
        return candidate
    # 4. 兜底：直接返回 base_dir / 'create_venv.exe'
    return base_dir / 'create_venv.exe'
import os
import sys
import subprocess
import venv
from pathlib import Path
import winreg

REQUIREMENTS = 'requirements.txt'
MAIN_SCRIPT = 'main_refactored.py'
VENV_DIRS = ['venv', '.venv', 'env', '.env']
PYTHON_INSTALLER = Path('install/python-3.12.8-amd64.exe')
PYTHON_DOWNLOAD_URL = 'https://www.python.org/ftp/python/3.12.8/python-3.12.8-amd64.exe'

def find_existing_venv():
    cwd = Path.cwd()
    for name in VENV_DIRS:
        venv_path = cwd / name
        if (venv_path / 'Scripts' / 'python.exe').exists():
            return venv_path
    return None

def create_venv(venv_path):
    print(f"[INFO] 正在创建虚拟环境: {venv_path}")
    venv.create(venv_path, with_pip=True)

    # import winreg
    return venv_path

def get_venv_python(venv_path):
    return venv_path / 'Scripts' / 'python.exe'
    # PYTHON_INSTALLER = Path('install/python-3.12.8-amd64.exe')
    # PYTHON_DOWNLOAD_URL = 'https://www.python.org/ftp/python/3.12.8/python-3.12.8-amd64.exe'

def run_in_venv(python_exe, args):
    cmd = [str(python_exe)] + args
    print(f"[INFO] 执行命令: {' '.join(cmd)}")
    result = subprocess.run(cmd)
    if result.returncode != 0:
        print(f"[ERROR] 命令执行失败: {' '.join(cmd)}")
        sys.exit(result.returncode)

def main():
    def find_installed_python():
        # 检查注册表，返回可用python.exe路径和版本
        for hive in [winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER]:
            try:
                with winreg.OpenKey(hive, r"SOFTWARE\Python\PythonCore") as pycore:
                    for i in range(0, winreg.QueryInfoKey(pycore)[0]):
                        try:
                            version = winreg.EnumKey(pycore, i)
                            if tuple(map(int, version.split('.'))) >= (3, 8):
                                with winreg.OpenKey(pycore, version + r"\InstallPath") as ipath:
                                    path, _ = winreg.QueryValueEx(ipath, "")
                                    exe = Path(path) / 'python.exe'
                                    if exe.exists():
                                        return str(exe), version
                        except Exception:
                            continue
            except Exception:
                continue
        return None, None

    def prompt_install_python():
        print("[ERROR] 未检测到可用 Python 环境 (>=3.8)。")
        choice = input("是否安装 Python 3.12.8？(Y/N): ").strip().lower()
        if choice == 'y':
            if PYTHON_INSTALLER.exists():
                print(f"[INFO] 正在运行安装包: {PYTHON_INSTALLER}")
                subprocess.run([str(PYTHON_INSTALLER)], shell=True)
            else:
                print(f"[ERROR] 未找到 Python 安装包！您可以前往以下网址下载安装包：\n{PYTHON_DOWNLOAD_URL}")
            input("请安装完成后按回车键继续...")
        else:
            print("[INFO] 用户取消安装。程序退出。")
            sys.exit(1)

    venv_path = find_existing_venv()
    if venv_path is None:
            print("[INFO] 未检测到可用虚拟环境，强制调用 create_venv.exe 创建虚拟环境...")
            venv_exe = get_venv_exe_path()
            if not venv_exe.exists():
                print(f"[ERROR] 未找到 create_venv.exe，尝试路径: {venv_exe}")
                input("按回车键退出...")
                sys.exit(1)
            if venv_exe.exists():
                try:
                    # 阻塞等待 create_venv.exe 运行完成
                    result = subprocess.run([str(venv_exe)], creationflags=subprocess.CREATE_NEW_CONSOLE)
                    if result.returncode == 0:
                        print("[INFO] create_venv.exe创建虚拟环境成功。")
                    else:
                        print(f"[ERROR] create_venv.exe创建虚拟环境失败，返回码: {result.returncode}")
                        input("按回车键退出...")
                        sys.exit(1)
                except Exception as e:
                    print(f"[ERROR] 启动 create_venv.exe 失败: {e}")
                    input("按回车键退出...")
                    sys.exit(1)
            else:
                print("[ERROR] 未找到 create_venv.exe，无法自动创建虚拟环境。请手动创建！")
                input("按回车键退出...")
                sys.exit(1)
            # 提示用户等待 create_venv.exe 完成后再继续
            input("请确认 create_venv.exe 已运行完成并成功创建虚拟环境后，按回车键继续...")
            # 再次检测虚拟环境
            venv_path = find_existing_venv()
            if venv_path is None:
                print("[ERROR] create_venv.exe创建虚拟环境后仍未检测到虚拟环境，程序退出。")
                input("按回车键退出...")
                sys.exit(1)
    python_exe = get_venv_python(venv_path)
    # 检查并安装依赖
    if not Path(REQUIREMENTS).exists():
        print(f"[ERROR] 未找到 {REQUIREMENTS} 文件！")
        sys.exit(1)
    print("[INFO] 正在检查并安装依赖...")
    run_in_venv(python_exe, ['-m', 'pip', 'install', '-r', REQUIREMENTS, '-i', 'https://pypi.tuna.tsinghua.edu.cn/simple'])
    # 启动主程序
    if not Path(MAIN_SCRIPT).exists():
        print(f"[ERROR] 未找到 {MAIN_SCRIPT} 文件！")
        sys.exit(1)
    print("[INFO] 依赖安装完成，正在启动主程序...")
    run_in_venv(python_exe, [MAIN_SCRIPT])

# 注册表检测和安装引导函数移到主作用域
def find_installed_python():
    for hive in [winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER]:
        try:
            with winreg.OpenKey(hive, r"SOFTWARE\Python\PythonCore") as pycore:
                for i in range(0, winreg.QueryInfoKey(pycore)[0]):
                    try:
                        version = winreg.EnumKey(pycore, i)
                        if tuple(map(int, version.split('.'))) >= (3, 8):
                            with winreg.OpenKey(pycore, version + r"\InstallPath") as ipath:
                                path, _ = winreg.QueryValueEx(ipath, "")
                                exe = Path(path) / 'python.exe'
                                if exe.exists():
                                    return str(exe), version
                    except Exception:
                        continue
        except Exception:
            continue
    return None, None

def prompt_install_python():
    print("[ERROR] 未检测到可用 Python 环境 (>=3.8)。")
    choice = input("是否安装 Python 3.12.8？(Y/N): ").strip().lower()
    if choice == 'y':
        if PYTHON_INSTALLER.exists():
            print(f"[INFO] 正在运行安装包: {PYTHON_INSTALLER}")
            subprocess.run([str(PYTHON_INSTALLER)], shell=True)
        else:
            print(f"[ERROR] 未找到 Python 安装包！您可以前往以下网址下载安装包：\n{PYTHON_DOWNLOAD_URL}")
        input("请安装完成后按回车键继续...")
    else:
        print("[INFO] 用户取消安装。程序退出。")
        sys.exit(1)
if __name__ == '__main__':
    import sys
    import os

    if getattr(sys, 'frozen', False):
        # 打包后
        base_dir = os.path.dirname(sys.executable)
    else:
        # 源码运行
        base_dir = os.path.dirname(os.path.abspath(__file__))

    venv_exe = os.path.join(base_dir, 'create_venv.exe')
    main()
