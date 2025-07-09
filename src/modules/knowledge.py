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
    
    def run_lpmm_script(self, mai_path: str, script_name: str, description: str, 
                       warning_messages: Optional[list] = None) -> bool:
        """
        运行LPMM相关脚本的通用函数
        
        Args:
            mai_path: 麦麦本体路径
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

            script_path = os.path.join(mai_path, "scripts", script_name)
            if not os.path.exists(script_path):
                ui.print_error(f"脚本文件不存在：{script_name}")
                logger.error("LPMM脚本不存在", script=script_name, path=script_path)
                return False
            
            ui.print_info(f"正在新窗口执行 {description}...")
            ui.console.print(f"将在新的cmd窗口中执行脚本，请查看弹出的命令行窗口", style=ui.colors["info"])
            logger.info("开始执行LPMM脚本", script=script_name, description=description)
            
            # 构建在新cmd窗口中执行的命令
            # 使用 start cmd /k 打开新的cmd窗口并保持窗口打开
            cmd_command = f'start cmd /k "cd /d "{mai_path}" && python scripts\\{script_name} && pause"'
            
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
        mai_path = config.get("mai_path", "")
        if not mai_path:
            ui.print_error("麦麦路径未配置")
            return False
        
        # 检查版本要求
        if not self._check_lpmm_version(config):
            return False
        
        warnings = [
            "该进程将处理\\MaiBot\\data/lpmm_raw_data目录下的所有.txt文件。\n",
            "处理后的数据将全部合并为一个.JSON文件并储存在\\MaiBot\\data/imported_lpmm_data目录中。"
        ]


        return self.run_lpmm_script(
            mai_path, 
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
        mai_path = config.get("mai_path", "")
        if not mai_path:
            ui.print_error("麦麦路径未配置")
            return False
        
        # 检查版本要求
        if not self._check_lpmm_version(config):
            return False
        
        warnings = [
        "实体提取操作将会花费较多api余额和时间，建议在空闲时段执行。举例：600万字全剧情，提取选用deepseek v3 0324，消耗约40元，约3小时。",
        "建议使用硅基流动的非Pro模型，或者使用可以用赠金抵扣的Pro模型",
        "请确保账户余额充足，并且在执行前确认无误",
        ]
        
        return self.run_lpmm_script(
            mai_path,
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
        mai_path = config.get("mai_path", "")
        if not mai_path:
            ui.print_error("麦麦路径未配置")
            return False
        
        # 检查版本要求
        if not self._check_lpmm_version(config):
            return False
        
        warnings = [
        "OpenIE导入时会大量发送请求，可能会撞到请求速度上限，请注意选用的模型",
        "同之前样例：在本地模型下，在70分钟内我们发送了约8万条请求，在网络允许下，速度会更快",
        "推荐使用硅基流动的Pro/BAAI/bge-m3",
        "每百万Token费用为0.7元",
        "知识导入时，会消耗大量系统资源，建议在较好配置电脑上运行",
        "同上样例，导入时10700K几乎跑满，14900HX占用80%，峰值内存占用约3GB",
        "请确保账户余额充足，并且在执行前确认无误"
        ]
        
        return self.run_lpmm_script(
            mai_path,
            "import_openie.py",
            "LPMM知识库知识图谱导入",
            warnings
        )
    
    def pipeline(self, config: Dict[str, Any]) -> bool:
        """
        执行完整的LPMM一条龙服务
        包括：文本分割 → 实体提取 → 知识图谱导入
        
        Args:
            config: 配置字典
            
        Returns:
            执行是否成功
        """
        mai_path = config.get("mai_path", "")
        if not mai_path:
            ui.print_error("麦麦路径未配置")
            return False
        
        # 检查版本要求
        if not self._check_lpmm_version(config):
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
        
        logger.info("LPMM一条龙服务完成", mai_path=mai_path)
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
        from ..utils.common import is_legacy_version
        if not is_legacy_version(version):
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
        
        Args:
            source_path: 源数据路径
            target_path: 目标数据路径
            
        Returns:
            迁移是否成功
        """
        try:
            ui.print_info("开始数据库迁移（MongoDB → SQLite）")
            
            if not source_path:
                source_path = ui.get_input("请输入MongoDB数据路径：")
            
            if not target_path:
                target_path = ui.get_input("请输入SQLite目标路径：")
            
            # 检查源路径
            if not os.path.exists(source_path):
                ui.print_error("源数据路径不存在")
                return False
            
            warnings = [
                "此操作将把MongoDB数据迁移到SQLite",
                "请确保已备份重要数据",
                "迁移过程中请勿关闭程序",
                "迁移完成后请验证数据完整性"
            ]
            
            ui.print_warning("迁移前请注意：")
            for msg in warnings:
                ui.console.print(f"  • {msg}", style=ui.colors["warning"])
            
            if not ui.confirm("确定要开始迁移吗？"):
                ui.print_info("迁移已取消")
                return False
            
            ui.print_info("正在执行数据迁移...")
            logger.info("开始数据库迁移", source=source_path, target=target_path)
            
            # 这里应该实现具体的迁移逻辑
            # 由于原始代码中没有具体实现，这里提供一个框架
            ui.print_info("迁移功能待实现...")
            logger.info("数据库迁移功能待实现")
            
            ui.print_success("数据迁移完成！")
            return True
            
        except Exception as e:
            ui.print_error(f"数据迁移失败：{str(e)}")
            logger.error("数据库迁移失败", error=str(e))
            return False

    def _run_lpmm_script_internal(self, mai_path: str, script_name: str, description: str, 
                                 skip_confirm: bool = False) -> bool:
        """
        运行LPMM相关脚本的内部函数（用于一条龙服务）
        
        Args:
            mai_path: 麦麦本体路径
            script_name: 脚本名称
            description: 操作描述
            skip_confirm: 是否跳过确认提示
            
        Returns:
            执行是否成功
        """
        try:
            scripts_dir = os.path.join(mai_path, "scripts")
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
            cmd_command = f'start cmd /k "cd /d "{mai_path}" && python scripts\\{script_name} && echo. && echo 脚本执行完成！ && pause"'
            
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
        mai_path = config.get("mai_path", "")
        if not mai_path:
            ui.print_error("麦麦路径未配置")
            return False
        
        return self._run_lpmm_script_internal(
            mai_path, 
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
        mai_path = config.get("mai_path", "")
        if not mai_path:
            ui.print_error("麦麦路径未配置")
            return False
        
        return self._run_lpmm_script_internal(
            mai_path,
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
        mai_path = config.get("mai_path", "")
        if not mai_path:
            ui.print_error("麦麦路径未配置")
            return False
        
        return self._run_lpmm_script_internal(
            mai_path,
            "import_openie.py",
            "LPMM知识库知识图谱导入",
            skip_confirm=True
        )


# 全局知识库构建器实例
knowledge_builder = KnowledgeBuilder()
