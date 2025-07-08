"""
MongoDB安装模块
负责MongoDB和MongoDB Compass的安装
当部署版本小于0.7时自动安装MongoDB
"""
import os
import subprocess
import zipfile
import requests
import structlog
import re
from typing import Optional, Tuple
from pathlib import Path
from tqdm import tqdm
from ..ui.interface import ui

logger = structlog.get_logger(__name__)


class MongoDBInstaller:
    """MongoDB安装器类"""
    
    def __init__(self):
        # MongoDB下载URLs
        self.mongodb_url = "https://fastdl.mongodb.org/windows/mongodb-windows-x86_64-latest.zip"
        self.mongodb_filename = "mongodb.zip"
        self.mongodb_extract_dir = "mongodb"
        
    def compare_version(self, version1: str, version2: str) -> int:
        """
        比较两个版本号
        
        Args:
            version1: 第一个版本号 (例如: "0.6.0")
            version2: 第二个版本号 (例如: "0.7.0")
            
        Returns:
            -1 如果version1 < version2
             0 如果version1 == version2  
             1 如果version1 > version2
        """
        def normalize_version(v: str) -> list:
            """标准化版本号，提取数字部分"""
            # 移除v前缀并提取数字部分
            v = v.lower().replace('v', '')
            # 使用正则表达式提取版本号中的数字
            parts = re.findall(r'\d+', v)
            return [int(x) for x in parts] if parts else [0]
        
        v1_parts = normalize_version(version1)
        v2_parts = normalize_version(version2)
        
        # 补齐长度
        max_len = max(len(v1_parts), len(v2_parts))
        v1_parts.extend([0] * (max_len - len(v1_parts)))
        v2_parts.extend([0] * (max_len - len(v2_parts)))
        
        for i in range(max_len):
            if v1_parts[i] < v2_parts[i]:
                return -1
            elif v1_parts[i] > v2_parts[i]:
                return 1
        
        return 0
    
    def should_install_mongodb(self, deployment_version: str) -> bool:
        """
        检查是否需要安装MongoDB
        当部署版本小于0.7时返回True
        
        Args:
            deployment_version: 部署版本号
            
        Returns:
            是否需要安装MongoDB
        """
        if not deployment_version:
            return False
        
        # 特殊处理classical版本
        if deployment_version.lower() == 'classical':
            return True
        
        # 比较版本号
        result = self.compare_version(deployment_version, "0.7.0")
        should_install = result < 0  # 版本小于0.7
        
        logger.info("版本检查结果", 
                   deployment_version=deployment_version,
                   should_install=should_install)
        
        return should_install
    
    def download_file(self, url: str, filename: str) -> bool:
        """
        下载文件并显示进度条
        
        Args:
            url: 下载链接
            filename: 保存的文件名
            
        Returns:
            是否下载成功
        """
        try:
            ui.print_info(f"正在下载 {filename}...")
            logger.info("开始下载文件", url=url, filename=filename)
            
            resp = requests.get(url, stream=True)
            resp.raise_for_status()
            
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
            
            ui.print_success(f"{filename} 下载完成")
            logger.info("文件下载完成", filename=filename)
            return True
            
        except Exception as e:
            ui.print_error(f"下载失败: {str(e)}")
            logger.error("文件下载失败", error=str(e), url=url)
            return False
    
    def extract_mongodb(self) -> bool:
        """
        解压MongoDB文件
        
        Returns:
            是否解压成功
        """
        try:
            ui.print_info("正在解压MongoDB...")
            logger.info("开始解压MongoDB", filename=self.mongodb_filename)
            
            with zipfile.ZipFile(self.mongodb_filename, 'r') as zip_ref:
                zip_ref.extractall(self.mongodb_extract_dir)
            
            # 清理下载的zip文件
            os.remove(self.mongodb_filename)
            
            ui.print_success("MongoDB解压完成")
            logger.info("MongoDB解压完成")
            return True
            
        except Exception as e:
            ui.print_error(f"MongoDB解压失败: {str(e)}")
            logger.error("MongoDB解压失败", error=str(e))
            return False
    
    def extract_mongodb_to_path(self, zip_filename: str, extract_dir: str) -> bool:
        """
        解压MongoDB文件到指定路径
        
        Args:
            zip_filename: zip文件路径
            extract_dir: 解压目标目录
        
        Returns:
            是否解压成功
        """
        try:
            ui.print_info("正在解压MongoDB...")
            logger.info("开始解压MongoDB", filename=zip_filename, extract_dir=extract_dir)
            
            # 确保目标目录存在
            os.makedirs(os.path.dirname(extract_dir), exist_ok=True)
            
            with zipfile.ZipFile(zip_filename, 'r') as zip_ref:
                zip_ref.extractall(extract_dir)
            
            # 清理下载的zip文件
            if os.path.exists(zip_filename):
                os.remove(zip_filename)
            
            ui.print_success("MongoDB解压完成")
            logger.info("MongoDB解压完成", extract_dir=extract_dir)
            return True
            
        except Exception as e:
            ui.print_error(f"MongoDB解压失败: {str(e)}")
            logger.error("MongoDB解压失败", error=str(e))
            return False

    def install_mongodb(self, install_base_path: str = "") -> Tuple[bool, str]:
        """
        安装MongoDB
        
        Args:
            install_base_path: 安装基础路径，如果为空则安装到当前目录
        
        Returns:
            (是否安装成功, MongoDB安装路径)
        """
        try:
            ui.print_info("开始安装MongoDB...")
            logger.info("开始安装MongoDB", install_base_path=install_base_path)
            
            # 确定安装目录
            if install_base_path:
                # 获取安装目录的父目录（通常是项目根目录）
                project_root = os.path.dirname(install_base_path)
                mongodb_extract_dir = os.path.join(project_root, "mongodb")
                mongodb_filename = os.path.join(project_root, "mongodb.zip")
            else:
                mongodb_extract_dir = self.mongodb_extract_dir
                mongodb_filename = self.mongodb_filename
            
            # 下载MongoDB
            if not self.download_file(self.mongodb_url, mongodb_filename):
                return False, ""
            
            # 解压MongoDB
            if not self.extract_mongodb_to_path(mongodb_filename, mongodb_extract_dir):
                return False, ""
            
            # 获取MongoDB实际路径
            mongodb_path = os.path.abspath(mongodb_extract_dir)
            
            ui.print_success("MongoDB安装完成")
            logger.info("MongoDB安装完成", path=mongodb_path)
            return True, mongodb_path
            
        except Exception as e:
            ui.print_error(f"MongoDB安装失败: {str(e)}")
            logger.error("MongoDB安装失败", error=str(e))
            return False, ""
    
    def run_powershell_command(self, command: str, elevated: bool = True) -> bool:
        """
        运行PowerShell命令
        
        Args:
            command: 要执行的命令
            elevated: 是否需要管理员权限
            
        Returns:
            是否执行成功
        """
        try:
            if elevated:
                # 需要管理员权限的命令
                full_command = f"powershell Start-Process powershell -Verb runAs '{command}'"
            else:
                full_command = f"powershell {command}"
            
            logger.info("执行PowerShell命令", command=full_command)
            subprocess.Popen(full_command, shell=True)
            return True
            
        except Exception as e:
            ui.print_error(f"PowerShell命令执行失败: {str(e)}")
            logger.error("PowerShell命令执行失败", error=str(e), command=command)
            return False
    
    def install_mongodb_compass(self, mongodb_path: str = "") -> bool:
        """
        安装MongoDB Compass
        
        Args:
            mongodb_path: MongoDB安装路径，如果为空则使用默认路径
        
        Returns:
            是否安装成功
        """
        try:
            ui.print_info("开始安装MongoDB Compass...")
            logger.info("开始安装MongoDB Compass", mongodb_path=mongodb_path)
            
            # 确定MongoDB路径
            if mongodb_path and os.path.exists(mongodb_path):
                mongodb_base_dir = mongodb_path
            else:
                mongodb_base_dir = self.mongodb_extract_dir
            
            # 检查是否存在安装脚本
            compass_script = os.path.join(mongodb_base_dir, "bin", "Install-Compass.ps1")
            if not os.path.exists(compass_script):
                # 尝试在子目录中查找
                for item in os.listdir(mongodb_base_dir):
                    item_path = os.path.join(mongodb_base_dir, item)
                    if os.path.isdir(item_path):
                        potential_script = os.path.join(item_path, "bin", "Install-Compass.ps1")
                        if os.path.exists(potential_script):
                            compass_script = potential_script
                            break
                else:
                    ui.print_error("MongoDB Compass安装脚本未找到")
                    logger.error("MongoDB Compass安装脚本未找到", script_path=compass_script)
                    return False
            
            # 设置执行策略
            ui.print_warning("正在设置PowerShell执行策略...")
            ui.print_warning("请在弹出的用户账户控制中点击\"是\"")
            
            if not self.run_powershell_command("Set-ExecutionPolicy RemoteSigned", elevated=True):
                return False
            
            # 等待用户确认
            ui.pause("请确认已在用户账户控制中点击\"是\"后按任意键继续...")
            
            # 运行Compass安装脚本
            ui.print_info("正在安装MongoDB Compass...")
            
            if not self.run_powershell_command(compass_script, elevated=False):
                return False
            
            ui.print_success("MongoDB Compass安装启动成功")
            ui.print_info("请按照安装向导完成MongoDB Compass的安装")
            logger.info("MongoDB Compass安装启动成功", script_path=compass_script)
            return True
            
        except Exception as e:
            ui.print_error(f"MongoDB Compass安装失败: {str(e)}")
            logger.error("MongoDB Compass安装失败", error=str(e))
            return False
    
    def check_and_install_mongodb(self, deployment_version: str, maibot_path: str = "", force_install: bool = False) -> Tuple[bool, str]:
        """
        检查版本并安装MongoDB（如果需要的话）
        
        Args:
            deployment_version: 部署版本号
            maibot_path: 麦麦安装路径，MongoDB将安装到此路径的父目录下
            force_install: 是否强制安装
            
        Returns:
            (是否成功完成检查和安装流程, MongoDB路径)
        """
        try:
            logger.info("开始MongoDB安装检查", 
                       deployment_version=deployment_version,
                       maibot_path=maibot_path,
                       force_install=force_install)
            
            # 检查是否需要安装
            need_install = force_install or self.should_install_mongodb(deployment_version)
            
            if not need_install:
                ui.print_info(f"当前版本 {deployment_version} >= 0.7.0，无需安装MongoDB")
                logger.info("版本检查通过，无需安装MongoDB", version=deployment_version)
                return True, ""
            
            ui.print_warning(f"检测到版本 {deployment_version} < 0.7.0，需要安装MongoDB")
            
            # 询问是否继续安装
            if not force_install:
                if not ui.get_confirmation("是否继续安装MongoDB？"):
                    ui.print_info("用户取消MongoDB安装")
                    return True, ""
            
            # 安装MongoDB，传递麦麦路径
            success, mongodb_path = self.install_mongodb(maibot_path)
            if not success:
                return False, ""
            
            # 询问是否安装Compass
            install_compass = ui.get_confirmation(
                "是否安装MongoDB Compass？此软件可以以可视化的方式修改数据库，建议安装"
            )
            
            if install_compass:
                if not self.install_mongodb_compass(mongodb_path):
                    ui.print_warning("MongoDB Compass安装失败，但MongoDB主程序已安装成功")
            
            ui.print_success("MongoDB安装流程完成")
            logger.info("MongoDB安装流程完成", path=mongodb_path)
            return True, mongodb_path
            
        except Exception as e:
            ui.print_error(f"MongoDB安装流程失败: {str(e)}")
            logger.error("MongoDB安装流程失败", error=str(e))
            return False, ""


# 创建全局实例
mongodb_installer = MongoDBInstaller()
