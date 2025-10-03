"""
自动检测模块
负责自动检测麦麦和适配器路径
"""
import os
import structlog
from typing import Optional

logger = structlog.get_logger(__name__)


class AutoDetector:
    """自动检测器类"""
    
    def __init__(self):
        self.common_paths = [
            ".",
            "./MaiM-with-u",
            "./MaiBot",
            "../MaiBot",
            "C:/MaiBot",
            "D:/MaiBot"
        ]
    
    def detect_bot_path(self, base_dir: str) -> Optional[str]:
        """
        在指定基目录下递归搜索Bot路径（bot.py所在目录）。
        搜索深度最多为3级，并会忽略虚拟环境目录。
        """
        from ..ui.interface import ui # 延迟导入
        logger.info("开始在指定目录中搜索Bot...", base_dir=base_dir)
        
        ignore_dirs = {'venv', '.venv', 'env', '.env', '__pycache__'}

        for root, dirs, files in os.walk(base_dir, topdown=True):
            # 过滤掉需要忽略的目录
            dirs[:] = [d for d in dirs if d not in ignore_dirs]
            
            # 计算当前深度
            depth = root.replace(base_dir, '').count(os.sep)
            
            if depth >= 2: # 即将搜索第三级目录
                if not ui.confirm(f"是否继续搜索 '{root}' 的子目录（第三级）？"):
                    # 如果用户选择否，则不再继续深入此分支
                    dirs[:] = []

            if "bot.py" in files:
                bot_path = os.path.abspath(root)
                logger.info("成功检测到Bot", path=bot_path)
                return bot_path

        logger.warning("在指定目录中未能检测到Bot路径")
        return None

    def detect_mai_path(self) -> Optional[str]:
        """
        自动检测麦麦本体路径 (旧版逻辑，保留以备不时之需)
        """
        logger.info("开始自动检测麦麦本体路径")
        
        search_paths = self.common_paths + [os.path.join(path, "MaiBot") for path in self.common_paths]
        
        for base_path in search_paths:
            if not os.path.exists(base_path):
                continue
                
            bot_py_path = os.path.join(base_path, "bot.py")
            if os.path.exists(bot_py_path):
                logger.info("检测到麦麦本体", path=base_path)
                return os.path.abspath(base_path)
                
            try:
                for root, dirs, files in os.walk(base_path):
                    if "bot.py" in files:
                        logger.info("检测到麦麦本体", path=root)
                        return os.path.abspath(root)
            except Exception as e:
                logger.debug("搜索路径失败", path=base_path, error=str(e))
                continue
        
        logger.warning("未能自动检测到麦麦本体路径")
        return None
    
    def detect_adapter_path(self, mai_path: Optional[str] = None) -> Optional[str]:
        """
        自动检测适配器路径
        
        Args:
            mai_path: 麦麦本体路径，用于相对定位
            
        Returns:
            检测到的路径或None
        """
        logger.info("开始自动检测适配器路径")
        
        search_paths = self.common_paths.copy()
        
        # 如果有麦麦路径，添加相关路径
        if mai_path:
            mai_parent = os.path.dirname(mai_path)
            search_paths.extend([
                os.path.join(mai_parent, "MaiBot-Napcat-Adapter"),
                os.path.join(mai_parent, "adapter"),
                os.path.join(mai_parent, "Adapter")
            ])
        
        # 添加常见适配器路径
        search_paths.extend([
            "./MaiBot-Napcat-Adapter",
            "../MaiBot-Napcat-Adapter",
            "./adapter",
            "../adapter"
        ])
        
        for base_path in search_paths:
            if not os.path.exists(base_path):
                continue
                
            # 检查是否包含 main.py
            main_py_path = os.path.join(base_path, "main.py")
            if os.path.exists(main_py_path):
                logger.info("检测到适配器", path=base_path)
                return os.path.abspath(base_path)
                
            # 递归搜索子目录
            try:
                for root, dirs, files in os.walk(base_path):
                    if "main.py" in files and "adapter" in root.lower():
                        logger.info("检测到适配器", path=root)
                        return os.path.abspath(root)
            except Exception as e:
                logger.debug("搜索路径失败", path=base_path, error=str(e))
                continue
        
        logger.warning("未能自动检测到适配器路径")
        return None
    
    def detect_napcat_path(self) -> Optional[str]:
        """
        自动检测NapCat路径
        
        Returns:
            检测到的路径或None
        """
        logger.info("开始自动检测NapCat路径")
        
        # 常见NapCat安装路径
        common_napcat_paths = [
            "C:/Program Files/NapCat",
            "C:/Program Files (x86)/NapCat",
            "D:/NapCat",
            "E:/NapCat",
            "./NapCat",
            "../NapCat"
        ]
        
        for base_path in common_napcat_paths:
            if not os.path.exists(base_path):
                continue
                
            # 查找NapCat可执行文件
            napcat_exe = os.path.join(base_path, "NapCatWinBootMain.exe")
            if os.path.exists(napcat_exe):
                logger.info("检测到NapCat", path=napcat_exe)
                return napcat_exe
                
            # 递归搜索
            try:
                for root, dirs, files in os.walk(base_path):
                    if "NapCatWinBootMain.exe" in files:
                        napcat_path = os.path.join(root, "NapCatWinBootMain.exe")
                        logger.info("检测到NapCat", path=napcat_path)
                        return napcat_path
            except Exception as e:
                logger.debug("搜索NapCat路径失败", path=base_path, error=str(e))
                continue
        
        logger.warning("未能自动检测到NapCat路径")
        return None


# 全局自动检测器实例
auto_detector = AutoDetector()
