"""
实例多开管理器
负责管理多个实例的创建、配置和启动
"""
import os
import shutil
import uuid
import structlog
from typing import Dict, Any, Optional, List, Tuple
from pathlib import Path

from ..core.config import config_manager
from ..utils.port_manager import port_manager
from ..utils.version_detector import has_builtin_webui
from ..ui.interface import ui
from .launcher import launcher

logger = structlog.get_logger(__name__)


class InstanceMultiLauncher:
    """实例多开管理器"""
    
    def __init__(self):
        self.multi_instances: Dict[str, Dict[str, Any]] = {}
        self._load_multi_instances()
    
    def _load_multi_instances(self):
        """加载已保存的多开实例"""
        try:
            # 从配置中加载多开实例信息
            multi_config = config_manager.get("multi_instances", {})
            self.multi_instances = multi_config
            logger.info("已加载多开实例", count=len(self.multi_instances))
        except Exception as e:
            logger.warning("加载多开实例失败", error=str(e))
            self.multi_instances = {}
    
    def _save_multi_instances(self):
        """保存多开实例信息"""
        try:
            config_manager.set("multi_instances", self.multi_instances)
            config_manager.save()
            logger.info("已保存多开实例", count=len(self.multi_instances))
        except Exception as e:
            logger.error("保存多开实例失败", error=str(e))
    
    def create_multi_instance(self, base_config: Dict[str, Any], instance_name: Optional[str] = None, 
                              use_multi_pool: bool = True) -> str:
        """
        创建多开实例
        
        Args:
            base_config: 基础配置
            instance_name: 实例名称，如果为None则自动生成
            use_multi_pool: 是否使用多开专用端口池 (4000-6000)，默认为True
            
        Returns:
            多开实例ID
        """
        try:
            # 生成实例ID
            instance_id = str(uuid.uuid4())[:8]
            if not instance_name:
                instance_name = f"多开实例_{instance_id}"
            
            # 获取实例类型
            bot_type = base_config.get("bot_type", "MaiBot")
            
            # 配置端口 - 使用多开专用端口池 (4000-6000)
            main_port, secondary_port = port_manager.get_next_instance_port(bot_type, base_config, use_multi_pool=use_multi_pool)
            
            # 创建多开实例配置 - 避免循环引用，只保存必要的配置信息
            multi_instance = {
                "id": instance_id,
                "name": instance_name,
                "bot_type": bot_type,
                "base_config_name": self._get_config_name_from_config(base_config),  # 保存配置名称而不是整个对象
                "created_time": str(Path().cwd()),  # 记录创建时的路径
                "status": "created",  # created, running, stopped
                "use_multi_pool": use_multi_pool,  # 记录是否使用专用端口池
                "ports": {
                    "main_port": main_port,
                    "secondary_port": secondary_port
                }
            }
            
            # 保存到多开实例列表
            self.multi_instances[instance_id] = multi_instance
            self._save_multi_instances()
            
            logger.info("成功创建多开实例", instance_id=instance_id, name=instance_name, bot_type=bot_type, 
                       use_multi_pool=use_multi_pool, main_port=main_port, secondary_port=secondary_port)
            return instance_id
            
        except Exception as e:
            logger.error("创建多开实例失败", error=str(e))
            raise
    
    def _get_config_name_from_config(self, config: Dict[str, Any]) -> str:
        """从配置对象中获取配置名称"""
        # 尝试从配置中找到配置名称
        all_configs = config_manager.get_all_configurations()
        for config_name, config_obj in all_configs.items():
            if config_obj == config:
                return config_name
        return "unknown"
    
    def _get_base_config_for_instance(self, instance: Dict[str, Any]) -> Dict[str, Any]:
        """为多开实例获取基础配置"""
        config_name = instance.get("base_config_name", "")
        if config_name and config_name != "unknown":
            all_configs = config_manager.get_all_configurations()
            base_config = all_configs.get(config_name, {})
        else:
            # 如果没有配置名称，使用默认配置
            base_config = config_manager.get_current_config() or {}
        
        if not base_config:
            raise ValueError("无法获取基础配置")
        
        # 更新端口信息
        ports = instance.get("ports", {})
        main_port = ports.get("main_port")
        secondary_port = ports.get("secondary_port")
        
        if main_port:
            if instance["bot_type"] == "MaiBot":
                # 更新.env文件
                if instance["bot_type"] == "MaiBot":
                    instance_path = base_config.get("mai_path", "")
                else:
                    instance_path = base_config.get("mofox_path", "")
                
                if instance_path:
                    env_path = os.path.join(instance_path, ".env")
                    if instance["bot_type"] == "MaiBot":
                        port_manager.update_env_file(env_path, main_port, secondary_port)
                    else:
                        port_manager.update_env_file(env_path, main_port)
            
            # 更新适配器配置
            adapter_path = base_config.get("adapter_path", "")
            if adapter_path and os.path.exists(adapter_path):
                if instance["bot_type"] == "MaiBot":
                    adapter_config_path = os.path.join(adapter_path, "config.toml")
                    port_manager.update_maibot_adapter_config(adapter_config_path, main_port, secondary_port)
                else:
                    adapter_config_path = os.path.join(adapter_path, "config.toml")
                    port_manager.update_mofox_adapter_config(adapter_config_path, secondary_port)
        
        return base_config
    
    def launch_multi_instance(self, instance_id: str) -> bool:
        """
        启动多开实例
        
        Args:
            instance_id: 实例ID
            
        Returns:
            是否启动成功
        """
        try:
            if instance_id not in self.multi_instances:
                ui.print_error(f"多开实例不存在: {instance_id}")
                return False
            
            multi_instance = self.multi_instances[instance_id]
            config = self._get_base_config_for_instance(multi_instance)
            
            # 验证配置
            errors = launcher.validate_configuration(config)
            if errors:
                ui.print_error("多开实例配置错误：")
                for error in errors:
                    ui.console.print(f"  • {error}", style=ui.colors["error"])
                return False
            
            # 显示启动选择菜单
            ui.print_info(f"正在启动多开实例: {multi_instance['name']}")
            success = launcher.show_launch_menu(config)
            
            if success:
                multi_instance["status"] = "running"
                self._save_multi_instances()
                ui.print_success(f"多开实例 '{multi_instance['name']}' 启动成功！")
                logger.info("多开实例启动成功", instance_id=instance_id, name=multi_instance['name'])
            else:
                ui.print_info("用户取消启动操作")
                logger.info("用户取消多开实例启动", instance_id=instance_id)
            
            return success
            
        except Exception as e:
            ui.print_error(f"启动多开实例失败：{str(e)}")
            logger.error("启动多开实例异常", instance_id=instance_id, error=str(e))
            return False
    
    def stop_multi_instance(self, instance_id: str) -> bool:
        """
        停止多开实例
        
        Args:
            instance_id: 实例ID
            
        Returns:
            是否停止成功
        """
        try:
            if instance_id not in self.multi_instances:
                ui.print_error(f"多开实例不存在: {instance_id}")
                return False
            
            multi_instance = self.multi_instances[instance_id]
            
            # 停止所有相关进程
            launcher.stop_all_processes()
            
            multi_instance["status"] = "stopped"
            self._save_multi_instances()
            
            ui.print_success(f"多开实例 '{multi_instance['name']}' 已停止")
            logger.info("多开实例已停止", instance_id=instance_id, name=multi_instance['name'])
            return True
            
        except Exception as e:
            ui.print_error(f"停止多开实例失败：{str(e)}")
            logger.error("停止多开实例异常", instance_id=instance_id, error=str(e))
            return False
    
    def delete_multi_instance(self, instance_id: str) -> bool:
        """
        删除多开实例
        
        Args:
            instance_id: 实例ID
            
        Returns:
            是否删除成功
        """
        try:
            if instance_id not in self.multi_instances:
                ui.print_error(f"多开实例不存在: {instance_id}")
                return False
            
            multi_instance = self.multi_instances[instance_id]
            
            # 如果实例正在运行，先停止
            if multi_instance["status"] == "running":
                if not ui.confirm("实例正在运行，确定要删除吗？"):
                    return False
                self.stop_multi_instance(instance_id)
            
            # 从列表中删除
            del self.multi_instances[instance_id]
            self._save_multi_instances()
            
            ui.print_success(f"多开实例 '{multi_instance['name']}' 已删除")
            logger.info("多开实例已删除", instance_id=instance_id, name=multi_instance['name'])
            return True
            
        except Exception as e:
            ui.print_error(f"删除多开实例失败：{str(e)}")
            logger.error("删除多开实例异常", instance_id=instance_id, error=str(e))
            return False
    
    def list_multi_instances(self) -> List[Dict[str, Any]]:
        """
        获取多开实例列表
        
        Returns:
            多开实例列表
        """
        return list(self.multi_instances.values())
    
    def get_multi_instance(self, instance_id: str) -> Optional[Dict[str, Any]]:
        """
        获取指定多开实例
        
        Args:
            instance_id: 实例ID
            
        Returns:
            实例信息，如果不存在则返回None
        """
        return self.multi_instances.get(instance_id)
    
    def show_multi_instance_menu(self):
        """显示多开实例管理菜单"""
        while True:
            ui.clear_screen()
            ui.console.print("[🚀 实例多开管理]", style=ui.colors["primary"])
            ui.console.print("="*50)
            
            # 显示端口使用状态
            self._show_port_usage_status()
            
            # 显示多开实例列表
            instances = self.list_multi_instances()
            if not instances:
                ui.console.print("暂无多开实例", style=ui.colors["warning"])
            else:
                from rich.table import Table
                table = Table(show_header=True, header_style="bold magenta")
                table.add_column("ID", style="dim", width=8)
                table.add_column("名称", style="cyan")
                table.add_column("类型", style="yellow")
                table.add_column("状态", style="green")
                table.add_column("端口", style="blue")
                
                for instance in instances:
                    ports_info = instance.get("ports", {})
                    if ports_info:
                        main_port = ports_info.get("main_port", "N/A")
                        secondary_port = ports_info.get("secondary_port", "N/A")
                        port_str = f"{main_port}/{secondary_port}"
                    else:
                        port_str = "N/A"
                    
                    status_color = {
                        "created": "yellow",
                        "running": "green",
                        "stopped": "red"
                    }.get(instance["status"], "white")
                    
                    table.add_row(
                        instance["id"][:8],
                        instance["name"],
                        instance["bot_type"],
                        f"[{status_color}]{instance['status']}[/{status_color}]",
                        port_str
                    )
                
                ui.console.print(table)
            
            ui.console.print("\n[操作选项]", style=ui.colors["info"])
            ui.console.print(" [A] 创建新的多开实例", style=ui.colors["success"])
            if instances:
                ui.console.print(" [B] 启动多开实例", style=ui.colors["success"])
                ui.console.print(" [C] 停止多开实例", style=ui.colors["warning"])
                ui.console.print(" [D] 删除多开实例", style=ui.colors["error"])
                ui.console.print(" [E] 查看实例详情", style=ui.colors["info"])
            ui.console.print(" [Q] 返回上级菜单", style=ui.colors["exit"])
            
            choice = ui.get_input("请选择操作: ").upper()
            
            if choice == "Q":
                break
            elif choice == "A":
                self._handle_create_multi_instance()
            elif choice == "B" and instances:
                self._handle_launch_multi_instance()
            elif choice == "C" and instances:
                self._handle_stop_multi_instance()
            elif choice == "D" and instances:
                self._handle_delete_multi_instance()
            elif choice == "E" and instances:
                self._handle_view_multi_instance_details()
            else:
                ui.print_error("无效选项或无可用操作")
                ui.pause()
    
    def _show_port_usage_status(self):
        """显示端口使用状态"""
        try:
            from ..utils.port_manager import port_manager
            
            ui.console.print("[端口使用状态]", style=ui.colors["info"])
            
            # 获取当前运行中的实例
            running_instances = [inst for inst in self.list_multi_instances() if inst["status"] == "running"]
            
            if not running_instances:
                ui.console.print("  当前没有运行中的实例", style=ui.colors["warning"])
                return
            
            # 按类型分组显示
            mai_instances = [inst for inst in running_instances if inst["bot_type"] == "MaiBot"]
            mofox_instances = [inst for inst in running_instances if inst["bot_type"] == "MoFox_bot"]
            
            if mai_instances:
                ui.console.print("  MaiBot实例:", style=ui.colors["success"])
                for inst in mai_instances:
                    ports = inst.get("ports", {})
                    main_port = ports.get("main_port", "N/A")
                    webui_port = ports.get("secondary_port", "N/A")
                    
                    # 检查是否为内置WebUI版本
                    try:
                        base_config = self._get_base_config_for_instance(inst)
                        version = base_config.get("version_path", "")
                        has_builtin = has_builtin_webui(version)
                        
                        if has_builtin:
                            ui.console.print(f"    - {inst['name']}: 主程序({main_port}) + 控制面板(内置,代理端口8001)", style="white")
                        else:
                            ui.console.print(f"    - {inst['name']}: 主程序({main_port}) + WebUI({webui_port})", style="white")
                    except:
                        ui.console.print(f"    - {inst['name']}: 主程序({main_port}) + WebUI({webui_port})", style="white")
            
            if mofox_instances:
                ui.console.print("  MoFox_bot实例:", style=ui.colors["success"])
                for inst in mofox_instances:
                    ports = inst.get("ports", {})
                    main_port = ports.get("main_port", "N/A")
                    napcat_port = ports.get("secondary_port", "N/A")
                    ui.console.print(f"    - {inst['name']}: 主程序({main_port}) + NapCat({napcat_port})", style="white")
            
            # 添加WebUI绑定提示
            ui.console.print("\n[WebUI绑定说明]", style=ui.colors["info"])
            ui.console.print("  • 内置WebUI版本：所有实例共享代理端口8001", style="white")
            ui.console.print("  • 独立WebUI版本：每个实例使用独立端口，可能存在冲突", style="white")
            ui.console.print("  • 建议：多开时优先使用内置WebUI版本以避免端口冲突", style="white")
            
            ui.console.print("")  # 空行分隔
            
        except Exception as e:
            logger.warning("显示端口状态失败", error=str(e))
    
    def _handle_create_multi_instance(self):
        """处理创建多开实例"""
        try:
            ui.clear_screen()
            ui.console.print("[🚀 创建多开实例]", style=ui.colors["success"])
            ui.console.print("="*50)
            
            # 获取所有可用配置
            all_configurations = config_manager.get_all_configurations()
            if not all_configurations:
                ui.print_error("当前没有任何可用配置")
                ui.pause()
                return
            
            # 显示所有配置供用户选择
            ui.console.print("请选择要作为基础配置的实例：", style=ui.colors["info"])
            config_list = list(all_configurations.items())
            
            from rich.table import Table
            table = Table(show_header=True, header_style="bold magenta")
            table.add_column("序号", style="dim", width=6)
            table.add_column("配置名称", style="cyan")
            table.add_column("Bot类型", style="yellow")
            table.add_column("版本", style="green")
            table.add_column("昵称", style="blue")
            
            for i, (config_name, config) in enumerate(config_list, 1):
                bot_type = config.get("bot_type", "未知")
                version = config.get("version_path", "未知")
                nickname = config.get("nickname_path", "未知")
                table.add_row(str(i), config_name, bot_type, version, nickname)
            
            ui.console.print(table)
            ui.console.print(" [Q] 返回", style=ui.colors["exit"])
            
            # 用户选择配置
            while True:
                choice = ui.get_input("请选择配置序号: ").upper()
                if choice == "Q":
                    return
                
                try:
                    index = int(choice) - 1
                    if 0 <= index < len(config_list):
                        selected_config_name, base_config = config_list[index]
                        break
                    else:
                        ui.print_error("无效的序号，请重新选择")
                except ValueError:
                    ui.print_error("请输入有效数字")
            
            # 显示选中的配置信息
            bot_type = base_config.get("bot_type", "MaiBot")
            nickname = base_config.get("nickname_path", "未知")
            version = base_config.get("version_path", "未知")
            
            ui.console.print(f"已选择配置: {selected_config_name} - {nickname} ({bot_type})", style=ui.colors["info"])
            ui.console.print(f"版本信息: {version}", style=ui.colors["info"])
            
            # 对于MaiBot，显示WebUI版本信息
            if bot_type == "MaiBot":
                has_builtin = has_builtin_webui(version)
                if has_builtin:
                    ui.console.print("✅ 检测到内置WebUI版本 - 支持多开实例WebUI绑定", style=ui.colors["success"])
                    ui.console.print("   所有实例将共享代理端口8001，避免端口冲突", style="white")
                else:
                    ui.console.print("⚠️ 检测到独立WebUI版本 - 可能存在端口冲突", style=ui.colors["warning"])
                    ui.console.print("   建议：多开时考虑升级到内置WebUI版本", style="white")
            
            # 询问是否使用专用端口池
            use_multi_pool = ui.confirm("是否使用多开专用端口池 (4000-6000)？推荐选择是以避免端口冲突")
            
            if use_multi_pool:
                ui.console.print("✅ 将使用多开专用端口池 (4000-6000)", style=ui.colors["success"])
            else:
                ui.console.print("⚠️ 将使用默认端口池，可能与其他服务冲突", style=ui.colors["warning"])
            
            # 输入实例名称
            instance_name = ui.get_input("请输入多开实例名称 (回车自动生成): ").strip()
            
            # 创建多开实例
            instance_id = self.create_multi_instance(base_config, instance_name if instance_name else None, use_multi_pool=use_multi_pool)
            
            ui.print_success(f"多开实例创建成功！")
            ui.console.print(f"实例ID: {instance_id}", style=ui.colors["info"])
            
            # 显示端口信息
            multi_instance = self.get_multi_instance(instance_id)
            if multi_instance:
                ports = multi_instance.get("ports", {})
                pool_type = "专用端口池 (4000-6000)" if multi_instance.get("use_multi_pool") else "默认端口池"
                ui.console.print(f"端口池类型: {pool_type}", style=ui.colors["info"])
                ui.console.print(f"主程序端口: {ports.get('main_port', 'N/A')}", style=ui.colors["info"])
                ui.console.print(f"适配器/WebUI端口: {ports.get('secondary_port', 'N/A')}", style=ui.colors["info"])
            
            # 询问是否立即启动
            if ui.confirm("是否立即启动这个多开实例？"):
                self.launch_multi_instance(instance_id)
            
            ui.pause()
            
        except Exception as e:
            ui.print_error(f"创建多开实例失败：{str(e)}")
            logger.error("创建多开实例异常", error=str(e))
            ui.pause()
    
    def _handle_launch_multi_instance(self):
        """处理启动多开实例"""
        try:
            instances = self.list_multi_instances()
            if not instances:
                ui.print_warning("没有可启动的多开实例")
                ui.pause()
                return
            
            ui.clear_screen()
            ui.console.print("[🚀 启动多开实例]", style=ui.colors["success"])
            ui.console.print("="*50)
            
            # 显示实例列表供选择
            ui.console.print("请选择要启动的实例：", style=ui.colors["info"])
            for i, instance in enumerate(instances, 1):
                status = instance["status"]
                status_color = "green" if status == "stopped" else "yellow" if status == "created" else "red"
                ui.console.print(f" [{i}] {instance['name']} ({instance['bot_type']}) - [{status_color}]{status}[/{status_color}]")
            
            ui.console.print(" [Q] 返回", style=ui.colors["exit"])
            
            choice = ui.get_input("请选择: ").upper()
            if choice == "Q":
                return
            
            try:
                index = int(choice) - 1
                if 0 <= index < len(instances):
                    instance = instances[index]
                    if instance["status"] == "running":
                        ui.print_warning("实例已在运行中")
                        ui.pause()
                        return
                    
                    self.launch_multi_instance(instance["id"])
                else:
                    ui.print_error("无效选择")
            except ValueError:
                ui.print_error("请输入有效数字")
            
            ui.pause()
            
        except Exception as e:
            ui.print_error(f"启动多开实例失败：{str(e)}")
            logger.error("启动多开实例异常", error=str(e))
            ui.pause()
    
    def _handle_stop_multi_instance(self):
        """处理停止多开实例"""
        try:
            instances = self.list_multi_instances()
            running_instances = [inst for inst in instances if inst["status"] == "running"]
            
            if not running_instances:
                ui.print_warning("没有运行中的多开实例")
                ui.pause()
                return
            
            ui.clear_screen()
            ui.console.print("[🛑 停止多开实例]", style=ui.colors["warning"])
            ui.console.print("="*50)
            
            # 显示运行中的实例列表
            ui.console.print("运行中的实例：", style=ui.colors["info"])
            for i, instance in enumerate(running_instances, 1):
                ui.console.print(f" [{i}] {instance['name']} ({instance['bot_type']})")
            
            ui.console.print(" [A] 停止所有实例", style=ui.colors["error"])
            ui.console.print(" [Q] 返回", style=ui.colors["exit"])
            
            choice = ui.get_input("请选择: ").upper()
            if choice == "Q":
                return
            elif choice == "A":
                if ui.confirm("确定要停止所有运行中的实例吗？"):
                    for instance in running_instances:
                        self.stop_multi_instance(instance["id"])
            else:
                try:
                    index = int(choice) - 1
                    if 0 <= index < len(running_instances):
                        instance = running_instances[index]
                        self.stop_multi_instance(instance["id"])
                    else:
                        ui.print_error("无效选择")
                except ValueError:
                    ui.print_error("请输入有效数字")
            
            ui.pause()
            
        except Exception as e:
            ui.print_error(f"停止多开实例失败：{str(e)}")
            logger.error("停止多开实例异常", error=str(e))
            ui.pause()
    
    def _handle_delete_multi_instance(self):
        """处理删除多开实例"""
        try:
            instances = self.list_multi_instances()
            if not instances:
                ui.print_warning("没有可删除的多开实例")
                ui.pause()
                return
            
            ui.clear_screen()
            ui.console.print("[🗑️ 删除多开实例]", style=ui.colors["error"])
            ui.console.print("="*50)
            
            # 显示实例列表供选择
            ui.console.print("请选择要删除的实例：", style=ui.colors["info"])
            for i, instance in enumerate(instances, 1):
                status = instance["status"]
                status_color = "green" if status == "stopped" else "yellow" if status == "created" else "red"
                ui.console.print(f" [{i}] {instance['name']} ({instance['bot_type']}) - [{status_color}]{status}[/{status_color}]")
            
            ui.console.print(" [Q] 返回", style=ui.colors["exit"])
            
            choice = ui.get_input("请选择: ").upper()
            if choice == "Q":
                return
            
            try:
                index = int(choice) - 1
                if 0 <= index < len(instances):
                    instance = instances[index]
                    if ui.confirm(f"确定要删除实例 '{instance['name']}' 吗？此操作不可恢复！"):
                        self.delete_multi_instance(instance["id"])
                else:
                    ui.print_error("无效选择")
            except ValueError:
                ui.print_error("请输入有效数字")
            
            ui.pause()
            
        except Exception as e:
            ui.print_error(f"删除多开实例失败：{str(e)}")
            logger.error("删除多开实例异常", error=str(e))
            ui.pause()
    
    def _handle_view_multi_instance_details(self):
        """处理查看多开实例详情"""
        try:
            instances = self.list_multi_instances()
            if not instances:
                ui.print_warning("没有可查看的多开实例")
                ui.pause()
                return
            
            ui.clear_screen()
            ui.console.print("[📋 多开实例详情]", style=ui.colors["info"])
            ui.console.print("="*50)
            
            # 显示实例列表供选择
            ui.console.print("请选择要查看详情的实例：", style=ui.colors["info"])
            for i, instance in enumerate(instances, 1):
                ui.console.print(f" [{i}] {instance['name']} ({instance['bot_type']})")
            
            ui.console.print(" [Q] 返回", style=ui.colors["exit"])
            
            choice = ui.get_input("请选择: ").upper()
            if choice == "Q":
                return
            
            try:
                index = int(choice) - 1
                if 0 <= index < len(instances):
                    instance = instances[index]
                    self._show_instance_details(instance)
                else:
                    ui.print_error("无效选择")
            except ValueError:
                ui.print_error("请输入有效数字")
            
            ui.pause()
            
        except Exception as e:
            ui.print_error(f"查看实例详情失败：{str(e)}")
            logger.error("查看实例详情异常", error=str(e))
            ui.pause()
    
    def _show_instance_details(self, instance: Dict[str, Any]):
        """显示实例详细信息"""
        ui.clear_screen()
        ui.console.print(f"[📋 {instance['name']} 详情]", style=ui.colors["info"])
        ui.console.print("="*50)
        
        ui.console.print(f"实例ID: {instance['id']}", style="cyan")
        ui.console.print(f"实例名称: {instance['name']}", style="cyan")
        ui.console.print(f"Bot类型: {instance['bot_type']}", style="cyan")
        ui.console.print(f"状态: {instance['status']}", style="cyan")
        
        ports = instance.get("ports", {})
        if ports:
            pool_type = "专用端口池 (4000-6000)" if instance.get("use_multi_pool") else "默认端口池"
            ui.console.print(f"端口池类型: {pool_type}", style="yellow")
            ui.console.print(f"主程序端口: {ports.get('main_port', 'N/A')}", style="yellow")
            ui.console.print(f"适配器端口: {ports.get('secondary_port', 'N/A')}", style="yellow")
        
        # 显示基础配置信息
        try:
            base_config = self._get_base_config_for_instance(instance)
            ui.console.print(f"版本: {base_config.get('version_path', 'N/A')}", style="green")
            ui.console.print(f"昵称: {base_config.get('nickname_path', 'N/A')}", style="green")
            
            if instance["bot_type"] == "MaiBot":
                ui.console.print(f"本体路径: {base_config.get('mai_path', 'N/A')}", style="blue")
            else:
                ui.console.print(f"本体路径: {base_config.get('mofox_path', 'N/A')}", style="blue")
            
            ui.console.print(f"适配器路径: {base_config.get('adapter_path', 'N/A')}", style="blue")
            ui.console.print(f"基础配置: {instance.get('base_config_name', 'N/A')}", style="blue")
        except Exception as e:
            ui.console.print(f"基础配置: {instance.get('base_config_name', 'N/A')} (获取详情失败)", style="red")
            logger.warning("获取实例详情失败", instance_id=instance['id'], error=str(e))


# 全局实例多开管理器
instance_multi_launcher = InstanceMultiLauncher()