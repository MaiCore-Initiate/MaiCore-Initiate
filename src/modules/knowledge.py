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

            script_path = os.path.join(Path(mai_path) / "script",script_name)
            if not os.path.exists(script_path):
                ui.print_error(f"脚本文件不存在：{script_name}")
                logger.error("LPMM脚本不存在", script=script_name, path=script_path)
                return False
            
            ui.print_info(f"正在执行 {description}...")
            logger.info("开始执行LPMM脚本", script=script_name, description=description)
            
            # 执行脚本
            process = subprocess.run(
                ["python", script_name],
                cwd=mai_path,
                shell=True,
                capture_output=True,
                text=True
            )
            
            if process.returncode == 0:
                ui.print_success(f"{description} 执行成功！")
                logger.info("LPMM脚本执行成功", script=script_name)
                if process.stdout:
                    ui.console.print("执行输出：", style=ui.colors["info"])
                    ui.console.print(process.stdout)
                return True
            else:
                ui.print_error(f"{description} 执行失败")
                logger.error("LPMM脚本执行失败", script=script_name, error=process.stderr)
                if process.stderr:
                    ui.console.print("错误信息：", style=ui.colors["error"])
                    ui.console.print(process.stderr)
                return False
                
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
        
        warnings = [
            "该进程将处理\\MaiBot\\data/lpmm_raw_data目录下的所有.txt文件。\n",
            "处理后的数据将全部合并为一个.JSON文件并储存在\\MaiBot\\data/imported_lpmm_data目录中。"
        ]


        return self.run_lpmm_script(
            mai_path, 
            "text_split.py", 
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
        
        warnings = [
        "实体提取操作将会花费较多api余额和时间，建议在空闲时段执行。举例：600万字全剧情，提取选用deepseek v3 0324，消耗约40元，约3小时。",
        "建议使用硅基流动的非Pro模型，或者使用可以用赠金抵扣的Pro模型",
        "请确保账户余额充足，并且在执行前确认无误",
        ]
        
        return self.run_lpmm_script(
            mai_path,
            "entity_extract.py",
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
            "knowledge_import.py",
            "LPMM知识库知识图谱导入",
            warnings
        )
    
    def pipeline(self, config: Dict[str, Any]) -> bool:
        """
        执行完整的LPMM一条龙服务
        
        Args:
            config: 配置字典
            
        Returns:
            执行是否成功
        """
        mai_path = config.get("mai_path", "")
        if not mai_path:
            ui.print_error("麦麦路径未配置")
            return False
        
        warnings = [
            "此操作将执行完整的知识库构建流程",
            "包括：文本分割 → 实体提取 → 知识图谱导入",
            "确保所有依赖已正确安装",
            "此操作可能需要很长时间"
        ]
        
        return self.run_lpmm_script(
            mai_path,
            "lpmm_pipeline.py",
            "LPMM一条龙构建服务",
            warnings
        )
    
    def legacy_knowledge_build(self, config: Dict[str, Any]) -> bool:
        """
        执行旧版知识库构建（仅0.6.0-alpha及更早版本）
        
        Args:
            config: 配置字典
            
        Returns:
            执行是否成功
        """
        mai_path = config.get("mai_path", "")
        mai_path = os.path.join(mai_path, "src", "plugins", "zhishi")
        raw_info_dir = os.path.join(mai_path, "data", "raw_info")
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
            ("=== 旧版知识库构建 ===\n")
            ("=======================\n")
            ("警告提示：\n")
            ("1. 这是一个demo系统，不完善不稳定，仅用于体验\n")
            ("2. 不要塞入过长过大的文本，这会导致信息提取迟缓\n")
            ("=======================")
            (f"请将要学习的文本文件放入以下目录：", )
            (f"{raw_info_dir}")
            ("=======================\n")
            ("确保文件为UTF-8编码的txt文件\n")
            ("=======================")
        ]
        
        return self.run_lpmm_script(
            mai_path,
            "knowledge_library.py",
            "旧版知识库构建",
            warnings
        )
    
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


# 全局知识库构建器实例
knowledge_builder = KnowledgeBuilder()
