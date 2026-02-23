"""
知识库构建模块
负责LPMM知识库的构建、迁移等操作
"""
import os
import subprocess
import structlog
from typing import Dict, Any, Optional
from ..ui.interface import ui
from pathlib import Path

logger = structlog.get_logger(__name__)


class KnowledgeBuilder:
    """知识库构建器类"""
    
    def __init__(self):
        pass
    
    def _get_bot_path(self, config: Dict[str, Any]) -> Optional[str]:
        """根据bot类型获取正确的本体路径"""
        bot_type = config.get("bot_type", "MaiBot")  # 默认为MaiBot以兼容旧配置
        
        if bot_type == "MoFox_bot":
            bot_path = config.get("mofox_path", "")
            if not bot_path:
                ui.print_error("墨狐（MoFox_bot）路径未配置")
                return None
            return bot_path
        else:  # "MaiBot" or other unknown types
            bot_path = config.get("mai_path", "")
            if not bot_path:
                ui.print_error("麦麦（MaiBot）路径未配置")
                return None
            return bot_path
    
    def _check_lpmm_version(self, config: Dict[str, Any]) -> bool:
        """
        检查LPMM功能版本要求
        
        Args:
            config: 配置字典
            
        Returns:
            版本是否符合要求
        """
        version = config.get("version_path", "")
        if not version:
            ui.print_error("版本信息未配置")
            return False
        
        # 解析版本号
        try:
            if version.lower() in ('main', 'dev','master'):
                # main和dev分支通常是最新版本，直接返回True
                return True
            # 提取版本号中的数字部分，如 "0.6.3-alpha" -> "0.6.3"
            version_number = version.split('-')[0]
            version_parts = version_number.split('.')
            
            # 转换为数字进行比较
            major = int(version_parts[0])
            minor = int(version_parts[1])
            patch = int(version_parts[2]) if len(version_parts) > 2 else 0
            
            # 检查版本是否高于0.6.3
            if major > 0 or (major == 0 and minor > 6) or (major == 0 and minor == 6 and patch > 3):
                return True
            else:
                ui.print_error("LPMM功能版本要求")
                ui.console.print("="*60, style=ui.colors["error"])
                ui.console.print("❌ 版本不符合要求", style=ui.colors["error"])
                ui.console.print(f"当前版本：{version}", style=ui.colors["warning"])
                ui.console.print("要求版本：高于 0.6.3", style=ui.colors["info"])
                ui.console.print("="*60, style=ui.colors["error"])
                ui.console.print("LPMM（Large-scale Pre-trained Model for MaiMai）功能需要较新的版本支持。", style="white")
                ui.console.print("该功能包括：", style="white")
                ui.console.print("  • 先进的文本分割和预处理", style="white")
                ui.console.print("  • 基于大模型的实体提取", style="white")
                ui.console.print("  • 知识图谱构建和导入", style="white")
                ui.console.print("  • 多模态数据处理支持", style="white")
                ui.console.print("", style="white")
                ui.console.print("请升级到0.6.3以上版本以使用完整的LPMM功能。", style=ui.colors["warning"])
                ui.console.print("如果您使用的是旧版本，请使用 [E] 旧版知识库构建功能。", style=ui.colors["info"])
                ui.console.print("="*60, style=ui.colors["error"])
                return False
                
        except (ValueError, IndexError) as e:
            ui.print_error(f"版本号解析失败：{version}")
            logger.error("版本号解析失败", version=version, error=str(e))
            return False
    
    def _is_version_0100_or_higher(self, version: str) -> bool:
        """检查版本是否为0.10.0或更高"""
        try:
            if version.lower() in ('main', 'dev', 'master'):
                return True
            parts = version.split('-')[0].split('.')
            major, minor = int(parts[0]), int(parts[1])
            return major > 0 or (major == 0 and minor >= 10)
        except (ValueError, IndexError):
            logger.warning("版本号解析失败", version=version)
            return False

    def _is_version_080_or_higher(self, version: str) -> bool:
        """
        检查版本是否为0.8.0或更高
        
        Args:
            version: 版本号字符串
            
        Returns:
            是否为0.8.0或更高版本
        """
        try:
            if version.lower() in ('main', 'dev', 'master'):
                return True
            
            # 解析版本号
            version_number = version.split('-')[0]  # 去掉后缀如 -alpha
            version_parts = version_number.split('.')
            
            major = int(version_parts[0])
            minor = int(version_parts[1])
            patch = int(version_parts[2]) if len(version_parts) > 2 else 0
            
            # 检查是否 >= 0.8.0
            if major > 0:
                return True
            elif major == 0 and minor > 8:
                return True
            elif major == 0 and minor == 8 and patch >= 0:
                return True
            else:
                return False
                
        except (ValueError, IndexError):
            logger.warning("版本号解析失败", version=version)
            return False
    
    def _get_venv_python_path(self, config: Dict[str, Any]) -> Optional[str]:
        """
        获取虚拟环境的Python路径
        
        Args:
            config: 配置字典
            
        Returns:
            虚拟环境Python路径，如果不存在则返回None
        """
        bot_path = self._get_bot_path(config)
        if not bot_path:
            return None
        
        # 检查配置中的venv_path
        venv_path = config.get("venv_path", "")
        if venv_path and os.path.exists(venv_path):
            py_exe = os.path.join(venv_path, "Scripts" if os.name == 'nt' else "bin", 
                                 "python.exe" if os.name == 'nt' else "python")
            if os.path.exists(py_exe):
                return py_exe
        
        # 检查bot_path下的常见虚拟环境目录
        for venv_dir in ["venv", ".venv", "env"]:
            venv_path = os.path.join(bot_path, venv_dir)
            py_exe = os.path.join(venv_path, "Scripts" if os.name == 'nt' else "bin", 
                                 "python.exe" if os.name == 'nt' else "python")
            if os.path.exists(py_exe):
                return py_exe
        
        return None
    
    def run_lpmm_script(self, bot_path: str, script_name: str, description: str,
                       warning_messages: Optional[list] = None) -> bool:
        """
        运行LPMM相关脚本的通用函数
        
        Args:
            bot_path: Bot本体路径
            script_name: 脚本名称
            description: 操作描述
            warning_messages: 警告信息列表
            
        Returns:
            执行是否成功
        """
        try:
            # 显示警告信息
            if warning_messages:
                ui.print_warning("执行前请注意：")
                for msg in warning_messages:
                    ui.console.print(f"  • {msg}", style=ui.colors["warning"])
            
            # 确认执行
            if not ui.confirm(f"确定要执行 {description} 吗？"):
                ui.print_info("操作已取消")
                return False

            script_path = os.path.join(bot_path, "scripts", script_name)
            if not os.path.exists(script_path):
                ui.print_error(f"脚本文件不存在：{script_name}")
                logger.error("LPMM脚本不存在", script=script_name, path=script_path)
                return False
            
            ui.print_info(f"正在新窗口执行 {description}...")
            ui.console.print(f"将在新的cmd窗口中执行脚本，请查看弹出的命令行窗口", style=ui.colors["info"])
            logger.info("开始执行LPMM脚本", script=script_name, description=description)
            
            # 构建在新cmd窗口中执行的命令
            # 使用 start cmd /k 打开新的cmd窗口并保持窗口打开
            cmd_command = f'start cmd /k "cd /d "{bot_path}" && python scripts\\{script_name} && pause"'
            
            # 执行命令
            process = subprocess.run(
                cmd_command,
                shell=True,
                capture_output=False,
                text=True
            )
            
            # 由于脚本在新窗口中运行，我们无法直接获取返回值
            # 提示用户查看新窗口的执行结果
            ui.print_info(f"{description} 已在新窗口中启动")
            ui.console.print("请查看新打开的命令行窗口以确认执行结果", style=ui.colors["warning"])
            ui.console.print("执行完成后，新窗口将显示 '请按任意键继续...' 提示", style=ui.colors["info"])
            
            logger.info("LPMM脚本已在新窗口启动", script=script_name)
            return True
                
        except Exception as e:
            ui.print_error(f"执行脚本时发生错误：{str(e)}")
            logger.error("执行LPMM脚本异常", script=script_name, error=str(e))
            return False
    
    def text_split(self, config: Dict[str, Any]) -> bool:
        """
        执行文本分割
        
        Args:
            config: 配置字典
            
        Returns:
            执行是否成功
        """
        bot_path = self._get_bot_path(config)
        if not bot_path:
            return False
        
        # 检查版本要求
        if not self._check_lpmm_version(config):
            return False
        
        warnings = [
            "该进程将处理 Bot 本体路径下 data/lpmm_raw_data 目录下的所有.txt文件。\n",
            "处理后的数据将全部合并为一个.JSON文件并储存在 data/imported_lpmm_data 目录中。"
        ]


        return self.run_lpmm_script(
            bot_path,
            "raw_data_preprocessor.py",
            "LPMM知识库文本分割",
            warnings
        )
    
    def entity_extract(self, config: Dict[str, Any]) -> bool:
        """
        执行实体提取
        
        Args:
            config: 配置字典
            
        Returns:
            执行是否成功
        """
        bot_path = self._get_bot_path(config)
        if not bot_path:
            return False
        
        # 检查版本要求
        if not self._check_lpmm_version(config):
            return False
        
        version = config.get("version_path", "")
        
        # 检查是否为0.8.0及以上版本
        if self._is_version_080_or_higher(version):
            ui.print_info(f"检测到版本 {version}（>= 0.8.0），使用新版知识库构建方法")
            return self._entity_extract_v080(config)
        else:
            ui.print_info(f"检测到版本 {version}（< 0.8.0），使用旧版知识库构建方法")
            return self._entity_extract_legacy(config)
    
    def _entity_extract_v080(self, config: Dict[str, Any]) -> bool:
        """
        执行实体提取（0.8.0及以上版本）
        使用虚拟环境运行 python ./scripts/info_extraction.py
        
        Args:
            config: 配置字典
            
        Returns:
            执行是否成功
        """
        bot_path = self._get_bot_path(config)
        if not bot_path:
            return False
        
        warnings = [
            "实体提取操作将会花费较多api余额和时间，建议在空闲时段执行。",
            "举例：600万字全剧情，提取选用deepseek v3 0324，消耗约40元，约3小时。",
            "建议使用硅基流动的非Pro模型，或者使用可以用赠金抵扣的Pro模型",
            "请确保账户余额充足，并且在执行前确认无误",
        ]
        
        try:
            # 显示警告信息
            ui.print_warning("执行前请注意：")
            for msg in warnings:
                ui.console.print(f"  • {msg}", style=ui.colors["warning"])
            
            # 确认执行
            if not ui.confirm("确定要执行实体提取吗？"):
                ui.print_info("操作已取消")
                return False

            script_path = os.path.join(bot_path, "scripts", "info_extraction.py")
            if not os.path.exists(script_path):
                ui.print_error("脚本文件不存在：info_extraction.py")
                logger.error("实体提取脚本不存在", path=script_path)
                return False
            
            # 获取虚拟环境Python路径
            python_exe = self._get_venv_python_path(config)
            if not python_exe:
                ui.print_warning("未找到虚拟环境，将使用系统Python")
                python_cmd = "python"
            else:
                ui.print_success(f"使用虚拟环境：{python_exe}")
                python_cmd = f'"{python_exe}"'
            
            ui.print_info("正在新窗口执行实体提取...")
            ui.console.print("将在新的cmd窗口中执行脚本，请查看弹出的命令行窗口", style=ui.colors["info"])
            logger.info("开始执行实体提取脚本（v0.8.0+）", script="info_extraction.py", python=python_cmd)
            
            # 构建在新cmd窗口中执行的命令
            cmd_command = f'start cmd /k "cd /d "{bot_path}" && {python_cmd} .\\scripts\\info_extraction.py && pause"'
            
            # 执行命令
            process = subprocess.run(
                cmd_command,
                shell=True,
                capture_output=False,
                text=True
            )
            
            ui.print_info("实体提取已在新窗口中启动")
            ui.console.print("请查看新打开的命令行窗口以确认执行结果", style=ui.colors["warning"])
            ui.console.print("执行完成后，新窗口将显示 '请按任意键继续...' 提示", style=ui.colors["info"])
            
            logger.info("实体提取脚本已在新窗口启动")
            return True
                
        except Exception as e:
            ui.print_error(f"执行脚本时发生错误：{str(e)}")
            logger.error("执行实体提取脚本异常", error=str(e))
            return False
    
    def _entity_extract_legacy(self, config: Dict[str, Any]) -> bool:
        """
        执行实体提取（0.8.0以下版本）
        直接运行脚本不激活虚拟环境
        
        Args:
            config: 配置字典
            
        Returns:
            执行是否成功
        """
        bot_path = self._get_bot_path(config)
        if not bot_path:
            return False
        
        warnings = [
            "实体提取操作将会花费较多api余额和时间，建议在空闲时段执行。",
            "举例：600万字全剧情，提取选用deepseek v3 0324，消耗约40元，约3小时。",
            "建议使用硅基流动的非Pro模型，或者使用可以用赠金抵扣的Pro模型",
            "请确保账户余额充足，并且在执行前确认无误",
        ]
        
        return self.run_lpmm_script(
            bot_path,
            "info_extraction.py",
            "LPMM知识库实体提取",
            warnings
        )
    
    def knowledge_import(self, config: Dict[str, Any]) -> bool:
        """
        执行知识图谱导入
        
        Args:
            config: 配置字典
            
        Returns:
            执行是否成功
        """
        bot_path = self._get_bot_path(config)
        if not bot_path:
            return False
        
        # 检查版本要求
        if not self._check_lpmm_version(config):
            return False
        
        version = config.get("version_path", "")
        
        # 检查是否为0.8.0及以上版本
        if self._is_version_080_or_higher(version):
            ui.print_info(f"检测到版本 {version}（>= 0.8.0），使用新版知识库构建方法")
            return self._knowledge_import_v080(config)
        else:
            ui.print_info(f"检测到版本 {version}（< 0.8.0），使用旧版知识库构建方法")
            return self._knowledge_import_legacy(config)
    
    def _knowledge_import_v080(self, config: Dict[str, Any]) -> bool:
        """
        执行知识图谱导入（0.8.0及以上版本）
        使用虚拟环境运行 python ./scripts/import_openie.py
        
        Args:
            config: 配置字典
            
        Returns:
            执行是否成功
        """
        bot_path = self._get_bot_path(config)
        if not bot_path:
            return False
        
        warnings = [
            "OpenIE导入时会大量发送请求，可能会撞到请求速度上限，请注意选用的模型",
            "同之前样例：在本地模型下，在70分钟内我们发送了约8万条请求，在网络允许下，速度会更快",
            "推荐使用硅基流动的DeepSeek-V3.2-Exp",
            "每百万Token费用为3元",
            "知识导入时，会消耗大量系统资源，建议在较好配置电脑上运行",
            "同上样例，导入时10700K几乎跑满，14900HX占用80%，峰值内存占用约3GB",
            "请确保账户余额充足，并且在执行前确认无误"
        ]
        
        try:
            # 显示警告信息
            ui.print_warning("执行前请注意：")
            for msg in warnings:
                ui.console.print(f"  • {msg}", style=ui.colors["warning"])
            
            # 确认执行
            if not ui.confirm("确定要执行知识图谱导入吗？"):
                ui.print_info("操作已取消")
                return False

            script_path = os.path.join(bot_path, "scripts", "import_openie.py")
            if not os.path.exists(script_path):
                ui.print_error("脚本文件不存在：import_openie.py")
                logger.error("知识图谱导入脚本不存在", path=script_path)
                return False
            
            # 获取虚拟环境Python路径
            python_exe = self._get_venv_python_path(config)
            if not python_exe:
                ui.print_warning("未找到虚拟环境，将使用系统Python")
                python_cmd = "python"
            else:
                ui.print_success(f"使用虚拟环境：{python_exe}")
                python_cmd = f'"{python_exe}"'
            
            ui.print_info("正在新窗口执行知识图谱导入...")
            ui.console.print("将在新的cmd窗口中执行脚本，请查看弹出的命令行窗口", style=ui.colors["info"])
            logger.info("开始执行知识图谱导入脚本（v0.8.0+）", script="import_openie.py", python=python_cmd)
            
            # 构建在新cmd窗口中执行的命令
            cmd_command = f'start cmd /k "cd /d "{bot_path}" && {python_cmd} .\\scripts\\import_openie.py && pause"'
            
            # 执行命令
            process = subprocess.run(
                cmd_command,
                shell=True,
                capture_output=False,
                text=True
            )
            
            ui.print_info("知识图谱导入已在新窗口中启动")
            ui.console.print("请查看新打开的命令行窗口以确认执行结果", style=ui.colors["warning"])
            ui.console.print("执行完成后，新窗口将显示 '请按任意键继续...' 提示", style=ui.colors["info"])
            
            logger.info("知识图谱导入脚本已在新窗口启动")
            return True
                
        except Exception as e:
            ui.print_error(f"执行脚本时发生错误：{str(e)}")
            logger.error("执行知识图谱导入脚本异常", error=str(e))
            return False
    
    def _knowledge_import_legacy(self, config: Dict[str, Any]) -> bool:
        """
        执行知识图谱导入（0.8.0以下版本）
        直接运行脚本不激活虚拟环境
        
        Args:
            config: 配置字典
            
        Returns:
            执行是否成功
        """
        bot_path = self._get_bot_path(config)
        if not bot_path:
            return False
        
        warnings = [
            "OpenIE导入时会大量发送请求，可能会撞到请求速度上限，请注意选用的模型",
            "同之前样例：在本地模型下，在70分钟内我们发送了约8万条请求，在网络允许下，速度会更快",
            "推荐使用硅基流动的DeepSeek-V3.2-Exp",
            "每百万Token费用为3元",
            "知识导入时，会消耗大量系统资源，建议在较好配置电脑上运行",
            "同上样例，导入时10700K几乎跑满，14900HX占用80%，峰值内存占用约3GB",
            "请确保账户余额充足，并且在执行前确认无误"
        ]
        
        return self.run_lpmm_script(
            bot_path,
            "import_openie.py",
            "LPMM知识库知识图谱导入",
            warnings
        )
    
    def pipeline(self, config: Dict[str, Any]) -> bool:
        """
        执行完整的LPMM一条龙服务
        对于0.8.0+版本：文本分割与实体提取合并 → 知识图谱导入
        对于旧版本：文本分割 → 实体提取 → 知识图谱导入
        
        Args:
            config: 配置字典
            
        Returns:
            执行是否成功
        """
        bot_path = self._get_bot_path(config)
        if not bot_path:
            return False
        
        # 检查版本要求
        if not self._check_lpmm_version(config):
            return False
        
        version = config.get("version_path", "")
        
        # 检查是否为0.8.0及以上版本
        if self._is_version_080_or_higher(version):
            ui.print_info(f"检测到版本 {version}（>= 0.8.0），使用新版一条龙流程")
            return self._pipeline_v080(config)
        else:
            ui.print_info(f"检测到版本 {version}（< 0.8.0），使用旧版一条龙流程")
            return self._pipeline_legacy(config)
    
    def _pipeline_v080(self, config: Dict[str, Any]) -> bool:
        """
        执行完整的LPMM一条龙服务（0.8.0及以上版本）
        包括：文本分割与实体提取（info_extraction.py） → 知识图谱导入（import_openie.py）
        
        Args:
            config: 配置字典
            
        Returns:
            执行是否成功
        """
        bot_path = self._get_bot_path(config)
        if not bot_path:
            return False
        
        # 显示完整的警告信息
        warnings = [
            "此操作将执行完整的知识库构建流程（0.8.0+版本）",
            "包括：文本分割与实体提取（合并） → 知识图谱导入",
            "确保所有依赖已正确安装",
            "此操作可能需要很长时间和大量资源",
            "请确保账户余额充足（实体提取和知识导入会消耗API费用）",
            "建议在空闲时段执行",
            "执行前请确保麦麦路径下的相关脚本文件存在"
        ]
        
        ui.print_warning("执行前请注意：")
        for msg in warnings:
            ui.console.print(f"  • {msg}", style=ui.colors["warning"])
        
        if not ui.confirm("确定要执行完整的LPMM一条龙服务吗？"):
            ui.print_info("操作已取消")
            return False
        
        ui.console.print("\n[🚀 开始执行LPMM一条龙服务（v0.8.0+）]", style=ui.colors["primary"])
        ui.console.print("="*50)
        
        total_steps = 2
        current_step = 0
        
        try:
            # 步骤1：文本分割与实体提取（合并）
            current_step += 1
            ui.console.print(f"\n📝 步骤{current_step}/{total_steps}: 文本分割与实体提取", style=ui.colors["info"])
            ui.console.print("-" * 30)
            ui.console.print("⚠️  注意：此步骤包含文本分割和实体提取，可能需要较长时间和API费用", style=ui.colors["warning"])
            
            if not self._entity_extract_v080_pipeline(config):
                ui.print_error("文本分割与实体提取失败，终止一条龙服务")
                return False
            
            ui.print_success("✅ 文本分割与实体提取完成")
            
            # 步骤2：知识图谱导入
            current_step += 1
            ui.console.print(f"\n📊 步骤{current_step}/{total_steps}: 知识图谱导入", style=ui.colors["info"])
            ui.console.print("-" * 30)
            ui.console.print("⚠️  注意：知识图谱导入将消耗大量系统资源", style=ui.colors["warning"])
            
            if not self._knowledge_import_v080_pipeline(config):
                ui.print_error("知识图谱导入失败，终止一条龙服务")
                return False
            
            ui.print_success("✅ 知识图谱导入完成")
            
        except Exception as e:
            ui.print_error(f"一条龙服务执行过程中发生错误：{str(e)}")
            logger.error("LPMM一条龙服务异常（v0.8.0+）", error=str(e), step=current_step)
            return False
        
        # 完成
        ui.console.print("\n[🎉 LPMM一条龙服务完成]", style=ui.colors["success"])
        ui.console.print("="*50)
        ui.print_success("所有步骤已成功完成！")
        ui.console.print("您的LPMM知识库现已准备就绪", style=ui.colors["info"])
        
        logger.info("LPMM一条龙服务完成（v0.8.0+）", bot_path=bot_path)
        return True
    
    def _pipeline_legacy(self, config: Dict[str, Any]) -> bool:
        """
        执行完整的LPMM一条龙服务（0.8.0以下版本）
        包括：文本分割 → 实体提取 → 知识图谱导入
        
        Args:
            config: 配置字典
            
        Returns:
            执行是否成功
        """
        bot_path = self._get_bot_path(config)
        if not bot_path:
            return False
        
        # 显示完整的警告信息
        warnings = [
            "此操作将执行完整的知识库构建流程",
            "包括：文本分割 → 实体提取 → 知识图谱导入",
            "确保所有依赖已正确安装",
            "此操作可能需要很长时间和大量资源",
            "请确保账户余额充足（实体提取和知识导入会消耗API费用）",
            "建议在空闲时段执行",
            "执行前请确保麦麦路径下的相关脚本文件存在"
        ]
        
        ui.print_warning("执行前请注意：")
        for msg in warnings:
            ui.console.print(f"  • {msg}", style=ui.colors["warning"])
        
        if not ui.confirm("确定要执行完整的LPMM一条龙服务吗？"):
            ui.print_info("操作已取消")
            return False
        
        ui.console.print("\n[🚀 开始执行LPMM一条龙服务]", style=ui.colors["primary"])
        ui.console.print("="*50)
        
        total_steps = 3
        current_step = 0
        
        try:
            # 步骤1：文本分割
            current_step += 1
            ui.console.print(f"\n📝 步骤{current_step}/{total_steps}: 文本分割", style=ui.colors["info"])
            ui.console.print("-" * 30)
            
            if not self._text_split_internal(config):
                ui.print_error("文本分割失败，终止一条龙服务")
                return False
            
            ui.print_success("✅ 文本分割完成")
            
            # 步骤2：实体提取
            current_step += 1
            ui.console.print(f"\n🔍 步骤{current_step}/{total_steps}: 实体提取", style=ui.colors["info"])
            ui.console.print("-" * 30)
            ui.console.print("⚠️  注意：实体提取可能需要较长时间和API费用", style=ui.colors["warning"])
            
            if not self._entity_extract_internal(config):
                ui.print_error("实体提取失败，终止一条龙服务")
                return False
            
            ui.print_success("✅ 实体提取完成")
            
            # 步骤3：知识图谱导入
            current_step += 1
            ui.console.print(f"\n📊 步骤{current_step}/{total_steps}: 知识图谱导入", style=ui.colors["info"])
            ui.console.print("-" * 30)
            ui.console.print("⚠️  注意：知识图谱导入将消耗大量系统资源", style=ui.colors["warning"])
            
            if not self._knowledge_import_internal(config):
                ui.print_error("知识图谱导入失败，终止一条龙服务")
                return False
            
            ui.print_success("✅ 知识图谱导入完成")
            
        except Exception as e:
            ui.print_error(f"一条龙服务执行过程中发生错误：{str(e)}")
            logger.error("LPMM一条龙服务异常", error=str(e), step=current_step)
            return False
        
        # 完成
        ui.console.print("\n[🎉 LPMM一条龙服务完成]", style=ui.colors["success"])
        ui.console.print("="*50)
        ui.print_success("所有步骤已成功完成！")
        ui.console.print("您的LPMM知识库现已准备就绪", style=ui.colors["info"])
        
        logger.info("LPMM一条龙服务完成", bot_path=bot_path)
        return True
    
    def _entity_extract_v080_pipeline(self, config: Dict[str, Any]) -> bool:
        """
        执行文本分割与实体提取（内部方法，用于0.8.0+一条龙服务）
        
        Args:
            config: 配置字典
            
        Returns:
            执行是否成功
        """
        bot_path = self._get_bot_path(config)
        if not bot_path:
            return False
        
        script_path = os.path.join(bot_path, "scripts", "info_extraction.py")
        if not os.path.exists(script_path):
            ui.print_error("脚本文件不存在：info_extraction.py")
            logger.error("实体提取脚本不存在", path=script_path)
            return False
        
        # 获取虚拟环境Python路径
        python_exe = self._get_venv_python_path(config)
        if not python_exe:
            ui.print_warning("未找到虚拟环境，将使用系统Python")
            python_cmd = "python"
        else:
            ui.print_success(f"使用虚拟环境：{python_exe}")
            python_cmd = f'"{python_exe}"'
        
        ui.print_info("正在新窗口执行文本分割与实体提取...")
        ui.console.print("将在新的cmd窗口中执行脚本，请查看弹出的命令行窗口", style=ui.colors["info"])
        logger.info("开始执行文本分割与实体提取脚本（v0.8.0+ pipeline）", script="info_extraction.py", python=python_cmd)
        
        # 构建在新cmd窗口中执行的命令
        cmd_command = f'start cmd /k "cd /d "{bot_path}" && {python_cmd} .\\scripts\\info_extraction.py && echo. && echo 脚本执行完成！ && pause"'
        
        # 执行命令
        subprocess.run(cmd_command, shell=True, capture_output=False, text=True)
        
        ui.print_info("文本分割与实体提取已在新窗口中启动")
        ui.console.print("请查看新打开的命令行窗口以确认执行结果", style=ui.colors["warning"])
        ui.console.print("执行完成后，新窗口将显示 '请按任意键继续...' 提示", style=ui.colors["info"])
        
        # 在一条龙服务中，等待用户确认后再继续
        ui.console.print("请等待脚本执行完成后再继续...", style=ui.colors["warning"])
        ui.get_input("脚本执行完成后，请按回车键继续下一步...")
        
        logger.info("文本分割与实体提取脚本已在新窗口启动")
        return True
    
    def _knowledge_import_v080_pipeline(self, config: Dict[str, Any]) -> bool:
        """
        执行知识图谱导入（内部方法，用于0.8.0+一条龙服务）
        
        Args:
            config: 配置字典
            
        Returns:
            执行是否成功
        """
        bot_path = self._get_bot_path(config)
        if not bot_path:
            return False
        
        script_path = os.path.join(bot_path, "scripts", "import_openie.py")
        if not os.path.exists(script_path):
            ui.print_error("脚本文件不存在：import_openie.py")
            logger.error("知识图谱导入脚本不存在", path=script_path)
            return False
        
        # 获取虚拟环境Python路径
        python_exe = self._get_venv_python_path(config)
        if not python_exe:
            ui.print_warning("未找到虚拟环境，将使用系统Python")
            python_cmd = "python"
        else:
            ui.print_success(f"使用虚拟环境：{python_exe}")
            python_cmd = f'"{python_exe}"'
        
        ui.print_info("正在新窗口执行知识图谱导入...")
        ui.console.print("将在新的cmd窗口中执行脚本，请查看弹出的命令行窗口", style=ui.colors["info"])
        logger.info("开始执行知识图谱导入脚本（v0.8.0+ pipeline）", script="import_openie.py", python=python_cmd)
        
        # 构建在新cmd窗口中执行的命令
        cmd_command = f'start cmd /k "cd /d "{bot_path}" && {python_cmd} .\\scripts\\import_openie.py && echo. && echo 脚本执行完成！ && pause"'
        
        # 执行命令
        subprocess.run(cmd_command, shell=True, capture_output=False, text=True)
        
        ui.print_info("知识图谱导入已在新窗口中启动")
        ui.console.print("请查看新打开的命令行窗口以确认执行结果", style=ui.colors["warning"])
        ui.console.print("执行完成后，新窗口将显示 '请按任意键继续...' 提示", style=ui.colors["info"])
        
        # 在一条龙服务中，等待用户确认后再继续
        ui.console.print("请等待脚本执行完成后再继续...", style=ui.colors["warning"])
        ui.get_input("脚本执行完成后，请按回车键继续...")
        
        logger.info("知识图谱导入脚本已在新窗口启动")
        return True
    
    def legacy_knowledge_build(self, config: Dict[str, Any]) -> bool:
        """
        执行旧版知识库构建（仅0.6.0-alpha及更早版本）
        
        Args:
            config: 配置字典
            
        Returns:
            执行是否成功
        """
        mai_path = config.get("mai_path", "")
        zhishi_path = os.path.join(mai_path, "src", "plugins", "zhishi")
        raw_info_dir = os.path.join(zhishi_path, "data", "raw_info")
        version = config.get("version_path", "")
        
        if not mai_path:
            ui.print_error("麦麦路径未配置")
            return False
        
        # 检查版本
        from ..utils.version_detector import is_legacy_version_with_bot_type
        bot_type = config.get("bot_type", "MaiBot")
        if not is_legacy_version_with_bot_type(version, bot_type):
            ui.print_error("此功能仅适用于0.6.0-alpha及更早版本")
            return False
        
        warnings = [
            "=== 旧版知识库构建 ===",
            "=======================",
            "警告提示：",
            "1. 这是一个demo系统，不完善不稳定，仅用于体验",
            "2. 不要塞入过长过大的文本，这会导致信息提取迟缓",
            "=======================",
            f"请将要学习的文本文件放入以下目录：{raw_info_dir}",
            "=======================",
            "确保文件为UTF-8编码的txt文件",
            "======================="
        ]
        
        try:
            # 显示警告信息
            ui.print_warning("执行前请注意：")
            for msg in warnings:
                ui.console.print(f"  • {msg}", style=ui.colors["warning"])
            
            # 确认执行
            if not ui.confirm("确定要执行旧版知识库构建吗？"):
                ui.print_info("操作已取消")
                return False

            script_path = os.path.join(zhishi_path, "knowledge_library.py")
            if not os.path.exists(script_path):
                ui.print_error("脚本文件不存在：knowledge_library.py")
                logger.error("旧版知识库脚本不存在", path=script_path)
                return False
            
            ui.print_info("正在新窗口执行旧版知识库构建...")
            ui.console.print("将在新的cmd窗口中执行脚本，请查看弹出的命令行窗口", style=ui.colors["info"])
            logger.info("开始执行旧版知识库构建脚本")
            
            # 构建在新cmd窗口中执行的命令
            # 切换到zhishi目录并执行脚本
            cmd_command = f'start cmd /k "cd /d "{zhishi_path}" && python knowledge_library.py && pause"'
            
            # 执行命令
            process = subprocess.run(
                cmd_command,
                shell=True,
                capture_output=False,
                text=True
            )
            
            ui.print_info("旧版知识库构建已在新窗口中启动")
            ui.console.print("请查看新打开的命令行窗口以确认执行结果", style=ui.colors["warning"])
            ui.console.print("执行完成后，新窗口将显示 '请按任意键继续...' 提示", style=ui.colors["info"])
            
            logger.info("旧版知识库构建脚本已在新窗口启动")
            return True
                
        except Exception as e:
            ui.print_error(f"执行旧版知识库构建时发生错误：{str(e)}")
            logger.error("执行旧版知识库构建异常", error=str(e))
            return False
    
    def migrate_mongodb_to_sqlite(self, source_path: str = "", target_path: str = "") -> bool:
        """
        执行MongoDB到SQLite的数据迁移
            
        Returns:
            迁移是否成功
        """
        try:
            from ..core.config import config_manager
            
            ui.print_info("开始数据库迁移（MongoDB → SQLite）")
            ui.console.print("="*60, style=ui.colors["info"])
            ui.console.print("📊 数据库迁移向导", style=ui.colors["primary"])
            ui.console.print("="*60, style=ui.colors["info"])
            
            # 获取所有配置
            configurations = config_manager.get_all_configurations()
            if not configurations:
                ui.print_error("没有可用的配置，请先创建配置")
                return False
            
            # 第一步：选择源版本（MongoDB版本）
            ui.console.print("\n📂 步骤1：选择源版本（包含MongoDB数据的旧版本）", style=ui.colors["info"])
            ui.console.print("请选择一个包含MongoDB数据的配置（0.7.0以下版本）：", style=ui.colors["warning"])
            
            # 过滤出0.7.0以下版本
            source_configs = {}
            for name, cfg in configurations.items():
                version = cfg.get("version_path", "")
                if self._is_version_below_070(version):
                    source_configs[name] = cfg
            
            if not source_configs:
                ui.print_error("没有找到0.7.0以下版本的配置")
                ui.console.print("MongoDB迁移需要至少有一个0.7.0以下版本的配置作为数据源", style=ui.colors["warning"])
                ui.console.print("0.7.0以下版本通常使用MongoDB存储数据", style=ui.colors["info"])
                ui.console.print("如果您没有旧版本的配置，请先创建或导入", style=ui.colors["info"])
                return False
            
            # 显示可用的源版本配置列表
            ui.show_instance_list(source_configs)
            
            # 选择源配置
            source_config = None
            while not source_config:
                choice = ui.get_input("请输入源版本的实例序列号（输入Q取消）：")
                if choice.upper() == 'Q':
                    ui.print_info("迁移已取消")
                    return False
                
                # 根据序列号查找配置（只在0.7.0以下版本中查找）
                for cfg in source_configs.values():
                    if (cfg.get("serial_number") == choice or 
                        str(cfg.get("absolute_serial_number")) == choice):
                        source_config = cfg
                        break
                
                if not source_config:
                    ui.print_error("未找到匹配的实例序列号！")
            
            source_version = source_config.get("version_path", "")
            source_mai_path = source_config.get("mai_path", "")
            ui.print_success(f"已选择源版本：{source_version}")
            
            # 第二步：选择目标版本（0.7.0+版本）
            ui.console.print("\n🎯 步骤2：选择目标版本（0.7.0以上版本）", style=ui.colors["info"])
            ui.console.print("请选择一个0.7.0以上版本的配置作为迁移目标：", style=ui.colors["warning"])
            ui.console.print("0.7.0以上版本使用SQLite存储数据", style=ui.colors["info"])
            
            # 过滤出0.7.0+版本
            target_configs = {}
            for name, cfg in configurations.items():
                version = cfg.get("version_path", "")
                if self._is_version_070_or_higher(version):
                    target_configs[name] = cfg
            
            if not target_configs:
                ui.print_error("没有找到0.7.0以上版本的配置，请先创建")
                ui.console.print("迁移需要至少有一个0.7.0以上版本的配置作为目标", style=ui.colors["warning"])
                ui.console.print("您可以通过部署功能创建0.7.0以上版本的实例", style=ui.colors["info"])
                return False
            
            # 显示0.7.0+版本配置列表
            ui.show_instance_list(target_configs)
            
            # 选择目标配置
            target_config = None
            while not target_config:
                choice = ui.get_input("请输入目标版本的实例序列号（输入Q取消）：")
                if choice.upper() == 'Q':
                    ui.print_info("迁移已取消")
                    return False
                
                # 根据序列号查找配置
                for cfg in target_configs.values():
                    if (cfg.get("serial_number") == choice or 
                        str(cfg.get("absolute_serial_number")) == choice):
                        target_config = cfg
                        break
                
                if not target_config:
                    ui.print_error("未找到匹配的实例序列号！")
            
            target_version = target_config.get("version_path", "")
            target_mai_path = target_config.get("mai_path", "")
            ui.print_success(f"已选择目标版本：{target_version}")
            
            # 第三步：启动MongoDB（源版本）
            ui.console.print("\n🚀 步骤3：启动MongoDB服务", style=ui.colors["info"])
            ui.console.print(f"即将为源版本 {source_version} 启动MongoDB服务", style=ui.colors["warning"])
            
            mongodb_path = source_config.get("mongodb_path", "")
            if not mongodb_path or not os.path.exists(mongodb_path):
                ui.print_error("源版本MongoDB路径未配置或不存在")
                return False
            
            if not ui.confirm("是否启动MongoDB服务？"):
                ui.print_info("迁移已取消")
                return False
            
            # 启动MongoDB
            ui.print_info("正在启动MongoDB服务...")
            mongodb_cmd = f'start cmd /k "cd /d "{mongodb_path}\\mongodb-win32-x64_windows-windows-8.2.0-alpha-2686-g3770008\\bin" && mongod --dbpath ..\\data && pause"'
            
            subprocess.run(mongodb_cmd, shell=True, capture_output=False, text=True)
            ui.print_success("MongoDB服务已在新窗口启动")
            ui.console.print("请确保MongoDB服务正常运行后再继续", style=ui.colors["warning"])
            
            # 等待用户确认MongoDB启动
            if not ui.confirm("MongoDB服务是否已正常启动？"):
                ui.print_error("请确保MongoDB服务正常启动后再重试")
                return False
            
            # 第四步：执行迁移脚本
            ui.console.print("\n📋 步骤4：执行数据迁移脚本", style=ui.colors["info"])
            
            # 检查迁移脚本是否存在
            script_path = os.path.join(target_mai_path, "scripts", "mongodb_to_sqlite.py")
            migration_script = os.path.basename(script_path)

            if not os.path.exists(script_path):
                ui.print_error(f"迁移脚本不存在：{migration_script}")
                ui.console.print(f"预期路径：{script_path}", style=ui.colors["warning"])
                return False


            # 显示迁移信息总览
            ui.console.print("\n📊 迁移信息总览：", style=ui.colors["primary"])
            ui.console.print(f"源版本：{source_version} (MongoDB)", style=ui.colors["info"])
            ui.console.print(f"目标版本：{target_version} (SQLite)", style=ui.colors["info"])
            ui.console.print(f"迁移脚本：{script_path}", style=ui.colors["info"])

            warnings = [
                "此操作将把MongoDB数据迁移到SQLite",
                "请确保MongoDB服务正在运行",
                "请确保已备份重要数据",
                "迁移过程中请勿关闭任何窗口",
                "迁移完成后请验证数据完整性"
            ]
            
            ui.print_warning("迁移前请注意：")
            for msg in warnings:
                ui.console.print(f"  • {msg}", style=ui.colors["warning"])
            
            if not ui.confirm("确定要开始迁移吗？"):
                ui.print_info("迁移已取消")
                return False
            
            # 执行迁移脚本
            ui.print_info("正在新窗口执行数据迁移脚本...")
            logger.info("开始数据库迁移", 
                       source_version=source_version, 
                       target_version=target_version,
                       script=migration_script)
            
            # 构建迁移命令
            if script_path == os.path.join(target_mai_path, migration_script):
                # 脚本在目标版本根目录
                cmd_command = f'start cmd /k "cd /d "{target_mai_path}" && python {migration_script} && echo. && echo 迁移完成！请检查结果 && pause"'
            else:
                # 脚本在其他位置
                script_dir = os.path.dirname(script_path)
                cmd_command = f'start cmd /k "cd /d "{script_dir}" && python "{migration_script}" && echo. && echo 迁移完成！请检查结果 && pause"'
            
            # 执行命令
            subprocess.run(cmd_command, shell=True, capture_output=False, text=True)
            
            ui.print_info("数据迁移脚本已在新窗口启动")
            ui.console.print("请查看新打开的命令行窗口以确认迁移结果", style=ui.colors["warning"])
            ui.console.print("迁移完成后，新窗口将显示确认信息", style=ui.colors["info"])
            
            logger.info("数据库迁移脚本已启动")
            
            # 等待用户确认迁移结果
            ui.pause("迁移完成后，请按回车键继续...")
            
            if ui.confirm("数据迁移是否成功完成？"):
                ui.print_success("数据迁移完成！")
                ui.console.print("建议验证目标版本中的数据完整性", style=ui.colors["info"])
                return True
            else:
                ui.print_warning("请检查迁移过程中的错误信息")
                return False
            
        except Exception as e:
            ui.print_error(f"数据迁移失败：{str(e)}")
            logger.error("数据库迁移失败", error=str(e))
            return False
    
    def _is_version_070_or_higher(self, version: str) -> bool:
        """
        检查版本是否为0.7.0或更高
        
        Args:
            version: 版本号字符串
            
        Returns:
            是否为0.7.0或更高版本
        """
        try:
            if version.lower() in ('main', 'dev'):
                return True
            
            # 解析版本号
            version_number = version.split('-')[0]  # 去掉后缀如 -alpha
            version_parts = version_number.split('.')
            
            major = int(version_parts[0])
            minor = int(version_parts[1])
            patch = int(version_parts[2]) if len(version_parts) > 2 else 0
            
            # 检查是否 >= 0.7.0
            if major > 0:
                return True
            elif major == 0 and minor > 7:
                return True
            elif major == 0 and minor == 7 and patch >= 0:
                return True
            else:
                return False
                
        except (ValueError, IndexError):
            logger.warning("版本号解析失败", version=version)
            return False

    def _is_version_below_070(self, version: str) -> bool:
        """
        检查版本是否低于0.7.0
        
        Args:
            version: 版本号字符串
            
        Returns:
            是否低于0.7.0版本
        """
        try:
            # 分支版本的特殊处理
            if version.lower() in ('main', 'dev'):
                # main和dev分支通常是最新版本，不是低于0.7.0的版本
                return False
            
            # 解析版本号
            version_number = version.split('-')[0]  # 去掉后缀如 -alpha
            version_parts = version_number.split('.')
            
            major = int(version_parts[0])
            minor = int(version_parts[1])
            patch = int(version_parts[2]) if len(version_parts) > 2 else 0
            
            # 检查是否 < 0.7.0
            if major > 0:
                return False
            elif major == 0 and minor >= 7:
                return False
            else:
                return True  # major == 0 and minor < 7
                
        except (ValueError, IndexError):
            logger.warning("版本号解析失败，假设为旧版本", version=version)
            # 解析失败时，保守假设为旧版本
            return True

    def _run_lpmm_script_internal(self, bot_path: str, script_name: str, description: str,
                                 skip_confirm: bool = False) -> bool:
        """
        运行LPMM相关脚本的内部函数（用于一条龙服务）
        
        Args:
            bot_path: Bot本体路径
            script_name: 脚本名称
            description: 操作描述
            skip_confirm: 是否跳过确认提示
            
        Returns:
            执行是否成功
        """
        try:
            scripts_dir = os.path.join(bot_path, "scripts")
            script_path = os.path.join(scripts_dir, script_name)
            if not os.path.exists(script_path):
                ui.print_error(f"脚本文件不存在：{script_name}")
                logger.error("LPMM脚本不存在", script=script_name, path=script_path)
                return False
            
            ui.print_info(f"正在新窗口执行 {description}...")
            ui.console.print(f"将在新的cmd窗口中执行脚本，请查看弹出的命令行窗口", style=ui.colors["info"])
            logger.info("开始执行LPMM脚本", script=script_name, description=description)
            
            # 构建在新cmd窗口中执行的命令
            # 使用 start cmd /k 打开新的cmd窗口并保持窗口打开
            cmd_command = f'start cmd /k "cd /d "{bot_path}" && python scripts\\{script_name} && echo. && echo 脚本执行完成！ && pause"'
            
            # 执行命令
            process = subprocess.run(
                cmd_command,
                shell=True,
                capture_output=False,
                text=True
            )
            
            # 由于脚本在新窗口中运行，我们无法直接获取返回值
            # 提示用户查看新窗口的执行结果
            ui.print_info(f"{description} 已在新窗口中启动")
            ui.console.print("请查看新打开的命令行窗口以确认执行结果", style=ui.colors["warning"])
            ui.console.print("执行完成后，新窗口将显示 '请按任意键继续...' 提示", style=ui.colors["info"])
            
            # 对于一条龙服务，我们需要等待用户确认
            if not skip_confirm:
                if not ui.confirm("脚本是否成功执行？"):
                    ui.print_error("用户确认脚本执行失败")
                    return False
            else:
                # 在一条龙服务中，等待用户确认后再继续
                ui.console.print("请等待脚本执行完成后再继续...", style=ui.colors["warning"])
                ui.get_input("脚本执行完成后，请按回车键继续下一步...")
            
            logger.info("LPMM脚本已在新窗口启动", script=script_name)
            return True
                
        except Exception as e:
            ui.print_error(f"执行脚本时发生错误：{str(e)}")
            logger.error("执行LPMM脚本异常", script=script_name, error=str(e))
            return False

    def _text_split_internal(self, config: Dict[str, Any]) -> bool:
        """
        执行文本分割（内部方法，用于一条龙服务）
        
        Args:
            config: 配置字典
            
        Returns:
            执行是否成功
        """
        bot_path = self._get_bot_path(config)
        if not bot_path:
            return False
        
        return self._run_lpmm_script_internal(
            bot_path,
            "raw_data_preprocessor.py",
            "LPMM知识库文本分割",
            skip_confirm=True
        )
    
    def _entity_extract_internal(self, config: Dict[str, Any]) -> bool:
        """
        执行实体提取（内部方法，用于一条龙服务）
        
        Args:
            config: 配置字典
            
        Returns:
            执行是否成功
        """
        bot_path = self._get_bot_path(config)
        if not bot_path:
            return False
        
        return self._run_lpmm_script_internal(
            bot_path,
            "info_extraction.py",
            "LPMM知识库实体提取",
            skip_confirm=True
        )
    
    def _knowledge_import_internal(self, config: Dict[str, Any]) -> bool:
        """
        执行知识图谱导入（内部方法，用于一条龙服务）
        
        Args:
            config: 配置字典
            
        Returns:
            执行是否成功
        """
        bot_path = self._get_bot_path(config)
        if not bot_path:
            return False
        
        return self._run_lpmm_script_internal(
            bot_path,
            "import_openie.py",
            "LPMM知识库知识图谱导入",
            skip_confirm=True
        )


# 全局知识库构建器实例
knowledge_builder = KnowledgeBuilder()

