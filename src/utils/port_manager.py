"""
端口管理工具类
负责检测端口冲突、分配可用端口、管理实例端口配置
"""
import os
import socket
import re
import toml
import structlog
from typing import Dict, List, Optional, Tuple, Set
from pathlib import Path

logger = structlog.get_logger(__name__)


class PortManager:
    """端口管理器"""
    
    # 常用端口范围定义
    COMMON_PORTS = {
        "mai_main": (8000, 8100),      # MaiBot主程序端口范围
        "mai_webui": (8001, 8101),     # MaiBot WebUI端口范围  
        "mofox_main": (8000, 8100),    # MoFox_bot主程序端口范围
        "napcat": (8090, 8190),        # NapCat端口范围
        "webui": (7990, 8090),         # 控制面板端口范围
    }
    
    # 多开实例专用端口池 (4000-6000)
    MULTI_INSTANCE_PORTS = {
        "mai_main": (4000, 5000),      # MaiBot主程序
        "mai_webui": (5001, 5500),    # MaiBot WebUI
        "mofox_main": (4000, 5000),    # MoFox_bot主程序
        "napcat": (5001, 5500),        # NapCat端口
        "webui": (5501, 6000),         # 控制面板
    }
    
    # 特殊端口（避免使用）
    RESERVED_PORTS = {
        1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 77, 79, 87, 95, 101, 102, 103, 104,
        109, 110, 111, 113, 115, 117, 119, 123, 135, 139, 143, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530,
        531, 532, 540, 548, 556, 563, 587, 601, 636, 993, 995, 2049, 3659, 4045, 6000, 6665, 6666, 6667, 6668,
        6669, 6697, 10080, 32768, 32769, 32770, 32771, 32772, 32773, 32774, 32775, 32776, 32777, 32778, 32779,
        32780, 32781, 32782, 32783, 32784, 32785, 33354, 65535
    }
    
    def __init__(self):
        self.used_ports: Set[int] = set()
        self._scan_existing_ports()
    
    def _scan_existing_ports(self):
        """扫描当前系统中已使用的端口"""
        try:
            import psutil
            for conn in psutil.net_connections():
                if conn.status == 'LISTEN' and conn.laddr:
                    port = conn.laddr.port
                    if 1024 <= port <= 65535:  # 只记录用户端口范围
                        self.used_ports.add(port)
        except Exception as e:
            logger.warning("扫描系统端口失败", error=str(e))
    
    def is_port_available(self, port: int) -> bool:
        """检查端口是否可用"""
        if port in self.RESERVED_PORTS:
            return False
        
        if port in self.used_ports:
            return False
        
        # 使用socket检查端口是否被占用
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                sock.settimeout(1)
                result = sock.connect_ex(('localhost', port))
                return result != 0
        except Exception:
            return False
    
    def find_available_port(self, port_type: str, base_port: Optional[int] = None) -> int:
        """
        查找可用端口
        
        Args:
            port_type: 端口类型 ("mai_main", "mai_webui", "mofox_main", "napcat", "webui")
            base_port: 基础端口，如果为None则使用类型默认值
            
        Returns:
            可用端口号
        """
        if port_type not in self.COMMON_PORTS:
            raise ValueError(f"未知的端口类型: {port_type}")
        
        start_port, _ = self.COMMON_PORTS[port_type]
        search_port = base_port or start_port
        
        # 尝试从基础端口开始查找
        for offset in range(100):  # 最多尝试100个端口
            test_port = search_port + offset
            if self.is_port_available(test_port):
                return test_port
        
        # 如果范围内没有找到，扩展搜索范围
        for port in range(1024, 65535):
            if self.is_port_available(port):
                return port
        
        raise RuntimeError("无法找到可用端口")
    
    def get_next_instance_port(self, instance_type: str, base_config: Dict, 
                               use_multi_pool: bool = False) -> Tuple[int, int]:
        """
        为新实例获取下一个可用端口组合，支持多实例混用和多开专用端口池
        
        Args:
            instance_type: 实例类型 ("MaiBot" 或 "MoFox_bot")
            base_config: 基础配置，用于获取当前端口
            use_multi_pool: 是否使用多开专用端口池 (4000-6000)
            
        Returns:
            (主程序端口, 适配器端口/NapCat端口)
        """
        # 选择端口范围
        if use_multi_pool:
            ports_config = self.MULTI_INSTANCE_PORTS
            logger.info("使用多开实例专用端口池 (4000-6000)")
        else:
            ports_config = self.COMMON_PORTS
        
        if instance_type == "MaiBot":
            # MaiBot需要主程序端口和WebUI端口
            mai_main_range = ports_config["mai_main"]
            mai_webui_range = ports_config["mai_webui"]
            
            # 优先使用mai_main范围，但如果冲突则扩展到其他范围
            try:
                main_port = self._find_available_port_in_range(mai_main_range)
            except RuntimeError:
                main_port = self._find_available_port_in_range(ports_config["mofox_main"])  # 扩展搜索
            
            try:
                webui_port = self._find_available_port_in_range(mai_webui_range, main_port + 1)
            except RuntimeError:
                webui_port = self._find_available_port_in_range(ports_config["webui"], main_port + 1)  # 扩展搜索
                
            return main_port, webui_port
            
        elif instance_type == "MoFox_bot":
            # MoFox_bot需要主程序端口和NapCat端口
            mofox_main_range = ports_config["mofox_main"]
            napcat_range = ports_config["napcat"]
            
            # 优先使用mofox_main范围，但如果冲突则扩展
            try:
                main_port = self._find_available_port_in_range(mofox_main_range)
            except RuntimeError:
                main_port = self._find_available_port_in_range(ports_config["mai_main"])  # 扩展搜索
            
            try:
                napcat_port = self._find_available_port_in_range(napcat_range, main_port + 1)
            except RuntimeError:
                # 如果napcat范围也冲突，扩展搜索
                napcat_port = self._find_available_port_in_range(ports_config["mai_webui"], main_port + 1)
                
            return main_port, napcat_port
            
        else:
            raise ValueError(f"不支持的实例类型: {instance_type}")
    
    def _find_available_port_in_range(self, port_range: Tuple[int, int], start_from: Optional[int] = None) -> int:
        """
        在指定范围内查找可用端口
        
        Args:
            port_range: (起始端口, 结束端口)
            start_from: 从指定端口开始搜索
            
        Returns:
            可用端口号
        
        Raises:
            RuntimeError: 范围内无可用端口
        """
        start_port, end_port = port_range
        search_start = max(start_from or start_port, start_port)
        
        # 在指定范围内搜索
        for port in range(search_start, end_port + 1):
            if self.is_port_available(port):
                return port
        
        # 如果指定范围内没有，搜索整个范围
        for port in range(start_port, end_port + 1):
            if self.is_port_available(port):
                return port
        
        raise RuntimeError(f"端口范围 {start_port}-{end_port} 内无可用端口")
    
    def update_env_file(self, env_path: str, main_port: int, webui_port: Optional[int] = None) -> bool:
        """
        更新.env文件中的端口配置
        
        Args:
            env_path: .env文件路径
            main_port: 主程序端口
            webui_port: WebUI端口（仅MaiBot需要）
            
        Returns:
            是否更新成功
        """
        try:
            if not os.path.exists(env_path):
                logger.error(".env文件不存在", path=env_path)
                return False
            
            with open(env_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # 更新HOST和PORT
            content = re.sub(r'HOST=.*', 'HOST=127.0.0.1', content)
            content = re.sub(r'PORT=\d+', f'PORT={main_port}', content)
            
            # 如果提供了WebUI端口，更新WebUI相关配置
            if webui_port is not None:
                # 更新WEBUI_PORT
                content = re.sub(r'WEBUI_PORT=\d+', f'WEBUI_PORT={webui_port}', content)
                # 确保WEBUI_ENABLED=true
                if 'WEBUI_ENABLED=' not in content:
                    content += '\nWEBUI_ENABLED=true\n'
                else:
                    content = re.sub(r'WEBUI_ENABLED=.*', 'WEBUI_ENABLED=true', content)
            
            # 如果没有这些配置，添加它们
            if 'HOST=' not in content:
                content += f'\nHOST=127.0.0.1\n'
            if 'PORT=' not in content:
                content += f'\nPORT={main_port}\n'
            
            with open(env_path, 'w', encoding='utf-8') as f:
                f.write(content)
            
            logger.info("成功更新.env文件端口配置", path=env_path, main_port=main_port, webui_port=webui_port)
            return True
            
        except Exception as e:
            logger.error("更新.env文件失败", path=env_path, error=str(e))
            return False
    
    def update_maibot_adapter_config(self, config_path: str, mai_port: int, napcat_port: int) -> bool:
        """
        更新MaiBot适配器配置文件中的端口
        
        Args:
            config_path: 配置文件路径
            mai_port: 麦麦主程序端口
            napcat_port: NapCat端口
            
        Returns:
            是否更新成功
        """
        try:
            if not os.path.exists(config_path):
                logger.error("适配器配置文件不存在", path=config_path)
                return False
            
            with open(config_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # 更新napcat_server端口
            content = re.sub(r'port\s*=\s*\d+', f'port = {napcat_port}', content)
            
            # 更新maibot_server端口
            content = re.sub(r'port\s*=\s*\d+.*# 麦麦在\.env文件中设置的端口', 
                           f'port = {mai_port}        # 麦麦在.env文件中设置的端口', content)
            
            with open(config_path, 'w', encoding='utf-8') as f:
                f.write(content)
            
            logger.info("成功更新MaiBot适配器配置端口", path=config_path, mai_port=mai_port, napcat_port=napcat_port)
            return True
            
        except Exception as e:
            logger.error("更新MaiBot适配器配置失败", path=config_path, error=str(e))
            return False
    
    def update_mofox_adapter_config(self, config_path: str, napcat_port: int) -> bool:
        """
        更新MoFox_bot适配器配置文件中的端口
        
        Args:
            config_path: 配置文件路径
            napcat_port: NapCat端口
            
        Returns:
            是否更新成功
        """
        try:
            if not os.path.exists(config_path):
                logger.error("MoFox适配器配置文件不存在", path=config_path)
                return False
            
            with open(config_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # 更新napcat_server端口
            content = re.sub(r'port\s*=\s*\d+', f'port = {napcat_port}', content)
            
            with open(config_path, 'w', encoding='utf-8') as f:
                f.write(content)
            
            logger.info("成功更新MoFox适配器配置端口", path=config_path, napcat_port=napcat_port)
            return True
            
        except Exception as e:
            logger.error("更新MoFox适配器配置失败", path=config_path, error=str(e))
            return False
    
    def configure_instance_ports(self, config: Dict, instance_type: str) -> Dict:
        """
        为实例配置端口
        
        Args:
            config: 实例配置
            instance_type: 实例类型
            
        Returns:
            更新后的配置
        """
        try:
            # 获取实例路径
            if instance_type == "MaiBot":
                instance_path = config.get("mai_path", "")
            elif instance_type == "MoFox_bot":
                instance_path = config.get("mofox_path", "")
            else:
                raise ValueError(f"不支持的实例类型: {instance_type}")
            
            if not instance_path or not os.path.exists(instance_path):
                raise ValueError(f"实例路径不存在: {instance_path}")
            
            # 获取可用端口
            main_port, secondary_port = self.get_next_instance_port(instance_type, config)
            
            # 更新.env文件
            env_path = os.path.join(instance_path, ".env")
            if instance_type == "MaiBot":
                self.update_env_file(env_path, main_port, secondary_port)
            else:  # MoFox_bot
                self.update_env_file(env_path, main_port)
            
            # 更新适配器配置
            if config.get("adapter_path") and os.path.exists(config["adapter_path"]):
                if instance_type == "MaiBot":
                    adapter_config_path = os.path.join(config["adapter_path"], "config.toml")
                    self.update_maibot_adapter_config(adapter_config_path, main_port, secondary_port)
                else:  # MoFox_bot
                    adapter_config_path = os.path.join(config["adapter_path"], "config.toml")
                    self.update_mofox_adapter_config(adapter_config_path, secondary_port)
            
            # 更新配置中的端口信息
            updated_config = config.copy()
            updated_config["_generated_ports"] = {
                "main_port": main_port,
                "secondary_port": secondary_port
            }
            
            logger.info("实例端口配置完成", instance_type=instance_type, main_port=main_port, secondary_port=secondary_port)
            return updated_config
            
        except Exception as e:
            logger.error("配置实例端口失败", instance_type=instance_type, error=str(e))
            raise


# 全局端口管理器实例
port_manager = PortManager()
