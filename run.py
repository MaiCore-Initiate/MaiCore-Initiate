import os
import sys
import subprocess
import venv
from pathlib import Path

REQUIREMENTS = 'requirements.txt'
MAIN_SCRIPT = 'main_refactored.py'
VENV_DIRS = ['venv', '.venv', 'env', '.env']


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
    return venv_path

def get_venv_python(venv_path):
    return venv_path / 'Scripts' / 'python.exe'

def run_in_venv(python_exe, args):
    cmd = [str(python_exe)] + args
    print(f"[INFO] 执行命令: {' '.join(cmd)}")
    result = subprocess.run(cmd)
    if result.returncode != 0:
        print(f"[ERROR] 命令执行失败: {' '.join(cmd)}")
        sys.exit(result.returncode)

def main():
    venv_path = find_existing_venv()
    if venv_path is None:
        venv_path = Path('venv')
        create_venv(venv_path)
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

if __name__ == '__main__':
    main()
