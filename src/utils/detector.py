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
    
    def detect_mai_path(self) -> Optional[str]:
        """
        自动检测麦麦本体路径
        
        Returns:
            检测到的路径或None
        """
        logger.info("开始自动检测麦麦本体路径")
        
        # 搜索路径列表
        search_paths = self.common_paths + [
            os.path.join(path, "MaiBot") for path in self.common_paths
        ]
        
        for base_path in search_paths:
            if not os.path.exists(base_path):
                continue
                
            # 检查是否包含 bot.py
            bot_py_path = os.path.join(base_path, "bot.py")
            if os.path.exists(bot_py_path):
                logger.info("检测到麦麦本体", path=base_path)
                return os.path.abspath(base_path)
                
            # 递归搜索子目录
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
