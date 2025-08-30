import os
import sys
import subprocess
import ctypes
import platform
import time

def is_admin():
    """检查是否具有管理员权限"""
    try:
        return ctypes.windll.shell32.IsUserAnAdmin()
    except:
        return False

def run_as_admin():
    """以管理员权限重新运行当前脚本"""
    script = os.path.abspath(sys.argv[0])
    # 保存当前工作目录
    current_dir = os.getcwd()
    # 将当前目录作为参数传递
    params = ' '.join([script, f'--working-dir="{current_dir}"'] + sys.argv[1:])
    
    # 请求UAC提升
    ctypes.windll.shell32.ShellExecuteW(None, "runas", sys.executable, params, None, 1)
    sys.exit(0)

def find_system_python():
    """查找系统Python安装"""
    python_paths = []
    
    # 使用where命令查找python.exe
    try:
        result = subprocess.run(['where', 'python.exe'], capture_output=True, text=True, check=True, timeout=10)
        python_paths.extend(result.stdout.strip().split('\n'))
    except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
        pass
    
    # 检查常见路径
    common_paths = [
        os.path.join(os.environ.get('SYSTEMDRIVE', 'C:'), 'Python', 'Python*', 'python.exe'),
        os.path.join(os.environ.get('ProgramFiles', 'C:\\Program Files'), 'Python', 'Python*', 'python.exe'),
        os.path.join(os.environ.get('ProgramFiles(x86)', 'C:\\Program Files (x86)'), 'Python', 'Python*', 'python.exe'),
        os.path.join(os.environ.get('LOCALAPPDATA', os.path.expanduser('~\\AppData\\Local')), 'Programs', 'Python', 'Python*', 'python.exe'),
    ]
    
    import glob
    for path_pattern in common_paths:
        for path in glob.glob(path_pattern):
            if os.path.isfile(path):
                python_paths.append(path)
    
    # 去重并排序（最新的Python版本优先）
    python_paths = sorted(set(python_paths), reverse=True)
    
    return python_paths

def check_python_version(python_exe):
    """检查Python版本是否大于等于3.8.0"""
    try:
        result = subprocess.run([python_exe, '--version'], capture_output=True, text=True, check=True, timeout=10)
        version_str = result.stdout.strip().split()[1]
        
        # 解析版本号
        parts = version_str.split('.')
        major, minor = int(parts[0]), int(parts[1])
        
        # 检查版本是否 >= 3.8.0
        if major > 3 or (major == 3 and minor >= 8):
            return True, version_str
        else:
            return False, version_str
    except (subprocess.CalledProcessError, FileNotFoundError, ValueError, IndexError, subprocess.TimeoutExpired):
        return False, "未知"

def create_virtualenv(python_exe, target_dir):
    """创建虚拟环境"""
    try:
        print(f"使用Python: {python_exe}")
        print(f"目标目录: {target_dir}")
        
        # 确保目标目录不存在
        if os.path.exists(target_dir):
            print(f"目录已存在，先删除: {target_dir}")
            import shutil
            shutil.rmtree(target_dir, ignore_errors=True)
            time.sleep(1)  # 等待目录删除完成
        
        # 方法1: 使用venv模块
        print("尝试方法1: 使用venv模块...")
        result = subprocess.run([python_exe, "-m", "venv", target_dir], 
                               capture_output=True, text=True, timeout=120)
        
        if result.returncode == 0:
            print("虚拟环境创建成功!")
            print(f"虚拟环境位置: {target_dir}")
            print("\n激活虚拟环境:")
            print(f"Windows: {target_dir}\\Scripts\\activate")
            return True
        else:
            print(f"方法1失败，返回码: {result.returncode}")
            if result.stderr:
                print(f"错误输出: {result.stderr}")
            
            # 方法2: 使用virtualenv (如果安装)
            print("尝试方法2: 使用virtualenv...")
            try:
                result = subprocess.run([python_exe, "-m", "virtualenv", target_dir], 
                                       capture_output=True, text=True, timeout=120)
                if result.returncode == 0:
                    print("虚拟环境创建成功!")
                    return True
                else:
                    print(f"方法2失败，返回码: {result.returncode}")
            except (subprocess.CalledProcessError, FileNotFoundError):
                print("virtualenv未安装")
            
            # 方法3: 直接调用venv模块的main函数
            print("尝试方法3: 直接调用venv...")
            try:
                import venv
                builder = venv.EnvBuilder(with_pip=True)
                builder.create(target_dir)
                print("虚拟环境创建成功!")
                return True
            except Exception as e:
                print(f"方法3失败: {e}")
                
        return False
        
    except subprocess.TimeoutExpired:
        print("创建虚拟环境超时")
        return False
    except Exception as e:
        print(f"创建虚拟环境时发生未知错误: {e}")
        return False

def main():
    # 检查是否有传递工作目录参数
    working_dir = os.getcwd()  # 默认为当前目录
    for i, arg in enumerate(sys.argv):
        if arg.startswith('--working-dir='):
            working_dir = arg.split('=', 1)[1].strip('"')
            # 切换工作目录
            os.chdir(working_dir)
            break
    
    print(f"工作目录: {working_dir}")
    print(f"当前目录: {os.getcwd()}")
    
    # 检查管理员权限
    if not is_admin():
        print("需要管理员权限来创建虚拟环境")
        print("正在请求管理员权限...")
        run_as_admin()
        return
    
    print("已获取管理员权限")
    print(f"管理员模式下的当前目录: {os.getcwd()}")
    
    # 查找系统Python
    print("正在查找系统Python安装...")
    python_paths = find_system_python()
    
    if not python_paths:
        print("未找到Python安装，请确保Python已安装")
        input("按回车键退出...")
        sys.exit(1)
    
    print(f"找到以下Python安装: {python_paths}")
    
    # 检查Python版本
    suitable_python = None
    for python_exe in python_paths:
        is_suitable, version = check_python_version(python_exe)
        if is_suitable:
            print(f"找到合适的Python版本: {python_exe} (版本 {version})")
            suitable_python = python_exe
            break
        else:
            print(f"Python版本不符合要求: {python_exe} (版本 {version})")
    
    if not suitable_python:
        print("未找到符合要求的Python版本 (需要 >= 3.8.0)")
        input("按回车键退出...")
        sys.exit(1)
    
    # 创建虚拟环境
    venv_dir = os.path.join(working_dir, "venv")
    print(f"正在在 {venv_dir} 创建虚拟环境...")
    
    # 确保我们有写入权限
    try:
        test_file = os.path.join(working_dir, "test_write.txt")
        with open(test_file, "w") as f:
            f.write("test")
        os.remove(test_file)
        print("写入权限检查通过")
    except Exception as e:
        print(f"写入权限检查失败: {e}")
        print("可能需要手动设置目录权限")
    
    if create_virtualenv(suitable_python, venv_dir):
        print("操作完成!")
    else:
        print("操作失败!")
    
    input("按回车键退出...")

if __name__ == "__main__":
    # 添加当前目录到PATH，以便能够找到Python
    os.environ['PATH'] = os.environ['PATH'] + os.pathsep + os.path.dirname(sys.executable)
    
    main()