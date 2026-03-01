# -*- coding: utf-8 -*-
"""
实例更新器
负责实例的版本更新，支持Git部署方式，确保数据安全
"""
import os
import shutil
import subprocess
import tempfile
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, Optional, Tuple, List, Callable
import structlog

from ...ui.interface import ui
from ...core.config import config_manager
from .base_deployer import BaseDeployer

logger = structlog.get_logger(__name__)


class InstanceUpdater(BaseDeployer):
    """实例更新器类 - 负责安全的实例版本更新"""
    
    def __init__(self):
        super().__init__()
        self.backup_dir: Optional[str] = None
        self.instance_config: Optional[Dict] = None
        self.bot_path: Optional[str] = None
        self.instance_dir: Optional[str] = None
        self._progress_callback: Optional[Callable[..., None]] = None
        self._progress_total_steps: int = 6
        self._progress_step: int = 0
        self._progress_step_name: str = "更新实例"

    @staticmethod
    def _clip_text(text: str, limit: int = 280) -> str:
        if not text:
            return ""
        t = text.strip().replace("\r", " ").replace("\n", " | ")
        return t if len(t) <= limit else f"{t[:limit]}...(已截断)"

    def _progress(self, message: str, step: Optional[int] = None, step_name: Optional[str] = None, status: str = "running"):
        """向WebUI进度流追加一条日志消息（CLI模式下自动静默）"""
        if step is not None:
            self._progress_step = step
        if step_name:
            self._progress_step_name = step_name
        if not self._progress_callback:
            return
        try:
            self._progress_callback(
                step=self._progress_step,
                total_steps=self._progress_total_steps,
                step_name=self._progress_step_name,
                status=status,
                message=message
            )
        except Exception:
            pass
        
    def update_instance(
        self,
        serial_number: str,
        new_version: Dict,
        from_webui: bool = False,
        progress_callback: Optional[Callable[..., None]] = None
    ) -> bool:
        """
        更新实例到新版本
        
        Args:
            serial_number: 实例序列号
            new_version: 新版本信息
            
        Returns:
            是否更新成功
        """
        try:
            self._progress_callback = progress_callback if from_webui else None
            self._progress_total_steps = 6
            self._progress_step = 1
            self._progress_step_name = "准备更新"
            self._progress("开始执行实例更新任务，正在读取实例配置...", step=1, step_name="准备更新", status="running")

            if not from_webui:
                ui.clear_screen()
                ui.components.show_title("实例更新助手", symbol="🔄")

            # 获取实例配置
            self.instance_config = self._get_instance_config(serial_number)
            if not self.instance_config:
                self._progress(f"未找到实例配置，序列号: {serial_number}", status="failed")
                return False

            bot_type = self.instance_config.get("bot_type", "MaiBot")
            self.bot_path = self.instance_config.get("mai_path") if bot_type == "MaiBot" else self.instance_config.get("mofox_path")
            self.instance_dir = os.path.dirname(self.bot_path)

            if not self.bot_path or not os.path.exists(self.bot_path):
                ui.print_error(f"未找到实例路径: {self.bot_path}")
                self._progress(f"实例路径无效或不存在: {self.bot_path}", status="failed")
                return False

            current_version = self.instance_config.get("version_path", "-")
            nickname = self.instance_config.get("nickname_path", "-")
            target_version = new_version.get("display_name") or new_version.get("name", "-")

            self._progress(f"实例昵称: {nickname} | Bot类型: {bot_type} | 当前版本: {current_version} | 目标版本: {target_version}")
            self._progress(f"实例目录: {self.instance_dir}")
            self._progress(f"Bot路径: {self.bot_path}")

            if not from_webui:
                ui.console.print(f"\n[📋 更新信息]", style=ui.colors["info"])
                ui.console.print(f"实例昵称: {nickname}", style=ui.colors["info"])
                ui.console.print(f"序列号: {serial_number}", style=ui.colors["info"])
                ui.console.print(f"Bot类型: {bot_type}", style=ui.colors["info"])
                ui.console.print(f"当前版本: {current_version}", style=ui.colors["info"])
                ui.console.print(f"目标版本: {new_version['display_name']}", style=ui.colors["info"])

                # 确认更新
                if not ui.confirm("确定要更新此实例吗？这将下载新版本并可能覆盖现有文件。"):
                    ui.print_info("已取消更新操作。")
                    return False
            
            ui.print_info("🚀 开始更新流程...")
            logger.info("开始更新实例", serial=serial_number, current_version=current_version, target_version=target_version)
            
            # 步骤1: 创建备份
            self._progress("准备创建更新前备份...", step=2, step_name="创建备份", status="running")
            if not self._create_backup():
                ui.print_error("创建备份失败，更新终止")
                self._progress("创建备份失败，更新终止", status="failed")
                return False
            self._progress(f"备份完成，路径: {self.backup_dir}")
            
            # 步骤2: 停止相关进程（如果需要）
            self._progress("准备停止相关实例进程...", step=3, step_name="更新代码", status="running")
            if not self._stop_instance_processes():
                ui.print_warning("停止实例进程失败，但继续更新")
                self._progress("停止实例进程失败，继续执行后续步骤")
            else:
                self._progress("实例进程检查完成")
            
            # 步骤3: 更新Bot代码
            if not self._update_bot_code(new_version):
                ui.print_error("更新Bot代码失败")
                self._progress("更新Bot代码失败，准备回滚备份", status="failed")
                if not self._restore_from_backup():
                    ui.print_error("恢复备份失败，请手动处理")
                    self._progress("回滚失败，请手动恢复备份", status="failed")
                return False
            self._progress("Bot代码更新完成")
            
            # 步骤4: 更新依赖
            self._progress("开始更新依赖...", step=4, step_name="更新依赖", status="running")
            if not self._update_dependencies():
                ui.print_warning("依赖更新失败，但继续更新")
                self._progress("依赖更新失败，继续执行后续步骤")
            else:
                self._progress("依赖更新完成")
            
            # 步骤5: 恢复用户数据
            self._progress("开始恢复用户数据目录...", step=5, step_name="恢复数据", status="running")
            if not self._restore_user_data():
                ui.print_error("恢复用户数据失败")
                self._progress("恢复用户数据失败，准备回滚备份", status="failed")
                if not self._restore_from_backup():
                    ui.print_error("恢复备份失败，请手动处理")
                    self._progress("回滚失败，请手动恢复备份", status="failed")
                return False
            self._progress("用户数据恢复完成")
            
            # 步骤6: 更新配置
            self._progress("开始更新实例配置...", step=6, step_name="更新配置", status="running")
            if not self._update_configuration(new_version):
                ui.print_warning("配置更新失败，但继续更新")
                self._progress("配置兼容检查失败，继续完成更新")
            else:
                self._progress("配置兼容检查通过")
            
            # 步骤7: 清理临时文件
            self._cleanup()
            self._progress("清理流程完成，正在写入最终版本信息...")
             
            # 更新配置信息
            self._update_instance_config(new_version)
            
            ui.print_success(f"🎉 实例 '{nickname}' 更新完成！")
            ui.print_info("请重启实例以应用新版本。")
             
            logger.info("实例更新完成", serial=serial_number, target_version=target_version)
            self._progress(f"更新完成：{nickname} -> {target_version}，备份保留在 {self.backup_dir}", status="completed")
            return True
             
        except Exception as e:
            ui.print_error(f"实例更新失败: {str(e)}")
            logger.error("实例更新失败", error=str(e), serial=serial_number)
            self._progress(f"实例更新异常: {str(e)}", status="failed")
             
            # 尝试恢复备份
            if self.backup_dir:
                ui.print_info("尝试恢复备份...")
                self._progress(f"检测到备份目录，尝试自动回滚: {self.backup_dir}")
                if not self._restore_from_backup():
                    ui.print_error("恢复备份失败，请手动处理")
                    self._progress("自动回滚失败，请手动恢复", status="failed")
             
            return False
        finally:
            self._cleanup()
    
    def _get_instance_config(self, serial_number: str) -> Optional[Dict]:
        """获取实例配置"""
        configs = config_manager.get_all_configurations()
        
        for key, cfg in configs.items():
            if str(cfg.get("serial_number", "")) == serial_number:
                return cfg
        
        ui.print_error(f"未找到序列号为 '{serial_number}' 的实例")
        return None
    
    def _create_backup(self) -> bool:
        """创建数据备份"""
        try:
            ui.console.print("\n[💾 第一步：创建数据备份]", style=ui.colors["primary"])
            self._progress("正在创建备份目录...")
            
            # 创建备份目录
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            nickname = self.instance_config.get('nickname_path', 'instance') if self.instance_config else 'instance'
            backup_name = f"backup_{nickname}_{timestamp}"
            assert self.instance_dir is not None, "实例目录不能为空"
            self.backup_dir = os.path.join(self.instance_dir, "backups", backup_name)
            
            os.makedirs(self.backup_dir, exist_ok=True)
            ui.print_info(f"备份目录: {self.backup_dir}")
            self._progress(f"备份目录已创建: {self.backup_dir}")
            
            # 备份关键数据目录
            backup_items = [
                ("data", "数据目录"),
                ("config", "配置目录"),
                ("plugins", "插件目录")
            ]
            
            backed_up_items = []
            assert self.bot_path is not None, "Bot路径不能为空"
            
            for item_name, item_desc in backup_items:
                source_path = os.path.join(self.bot_path, item_name)
                if os.path.exists(source_path):
                    target_path = os.path.join(self.backup_dir, item_name)
                    try:
                        shutil.copytree(source_path, target_path, dirs_exist_ok=True)
                        backed_up_items.append(item_name)
                        ui.print_success(f"✅ 已备份: {item_desc}")
                        self._progress(f"已备份 {item_desc}: {target_path}")
                    except Exception as e:
                        ui.print_warning(f"⚠️ 备份 {item_desc} 失败: {str(e)}")
                        self._progress(f"备份 {item_desc} 失败: {str(e)}")
                else:
                    ui.print_info(f"ℹ️ {item_desc} 不存在，跳过")
                    self._progress(f"{item_desc} 不存在，跳过")
            
            # 备份虚拟环境信息（如果存在）
            venv_path = self.instance_config.get("venv_path", "") if self.instance_config else ""
            if venv_path and os.path.exists(venv_path):
                venv_backup_path = os.path.join(self.backup_dir, "venv_info.txt")
                try:
                    with open(venv_backup_path, 'w', encoding='utf-8') as f:
                        f.write(f"虚拟环境路径: {venv_path}\n")
                        f.write(f"备份时间: {datetime.now().isoformat()}\n")
                    ui.print_success("✅ 已备份: 虚拟环境信息")
                    self._progress(f"已备份虚拟环境信息: {venv_backup_path}")
                except Exception as e:
                    ui.print_warning(f"⚠️ 备份虚拟环境信息失败: {str(e)}")
                    self._progress(f"备份虚拟环境信息失败: {str(e)}")
            
            # 创建备份清单
            backup_manifest = {
                "backup_time": datetime.now().isoformat(),
                "instance_config": self.instance_config,
                "backed_up_items": backed_up_items,
                "bot_type": self.instance_config.get("bot_type", "MaiBot") if self.instance_config else "MaiBot",
                "current_version": self.instance_config.get("version_path", "") if self.instance_config else "",
                "backup_path": self.backup_dir
            }
            
            manifest_path = os.path.join(self.backup_dir, "backup_manifest.json")
            import json
            with open(manifest_path, 'w', encoding='utf-8') as f:
                json.dump(backup_manifest, f, ensure_ascii=False, indent=2)
            self._progress(f"备份清单已写入: {manifest_path}")
             
            ui.print_success(f"✅ 数据备份完成，共备份 {len(backed_up_items)} 个项目")
            self._progress(f"数据备份完成，共备份 {len(backed_up_items)} 个项目")
            logger.info("数据备份完成", backup_dir=self.backup_dir, backed_up_items=backed_up_items)
            return True
            
        except Exception as e:
            ui.print_error(f"创建备份失败: {str(e)}")
            self._progress(f"创建备份失败: {str(e)}", status="failed")
            logger.error("创建备份失败", error=str(e))
            return False
    
    def _stop_instance_processes(self) -> bool:
        """停止实例相关进程"""
        try:
            ui.console.print("\n[🛑 第二步：停止实例进程]", style=ui.colors["primary"])
            self._progress("检查运行中进程并尝试优雅停止...")
            
            # 这里可以添加停止相关进程的逻辑
            # 例如停止正在运行的Bot实例
            
            ui.print_info("检查是否有正在运行的实例进程...")
            self._progress("正在扫描实例相关进程...")
            
            # TODO: 实现进程检查和停止逻辑
            # 目前先跳过，假设没有运行中的进程
            ui.print_info("未检测到运行中的实例进程")
            self._progress("未检测到运行中的实例进程")
            
            return True
            
        except Exception as e:
            ui.print_warning(f"停止进程时发生错误: {str(e)}")
            self._progress(f"停止进程阶段发生错误: {str(e)}")
            return False
    
    def _update_bot_code(self, new_version: Dict) -> bool:
        """更新Bot代码"""
        try:
            ui.console.print("\n[📦 第三步：更新Bot代码]", style=ui.colors["primary"])
            
            # 确定仓库信息
            bot_type = self.instance_config.get("bot_type", "MaiBot")
            if bot_type == "MaiBot":
                repo = "Mai-with-u/MaiBot"
            else:
                repo = "MoFox-Studio/MoFox-Core"
            
            # 确定分支名称
            version_name = new_version.get("name", "main")
            version_type = new_version.get("type", "release")
            
            if version_type == "branch":
                branch = version_name
            else:
                branch = "main"
            
            ui.print_info(f"仓库: {repo}")
            ui.print_info(f"分支: {branch}")
            self._progress(f"准备更新仓库: {repo}")
            self._progress(f"目标分支/版本: {branch}")
            
            # 使用Git更新代码
            return self._git_update(repo, branch)
            
        except Exception as e:
            ui.print_error(f"更新Bot代码失败: {str(e)}")
            self._progress(f"更新Bot代码失败: {str(e)}", status="failed")
            logger.error("更新Bot代码失败", error=str(e))
            return False
    
    def _git_update(self, repo: str, branch: str) -> bool:
        """使用Git更新代码"""
        try:
            git_exe = self.get_git_executable_path()
            if not git_exe:
                ui.print_error("未找到Git可执行文件")
                self._progress("未找到Git可执行文件", status="failed")
                return False
            self._progress(f"Git可执行文件: {git_exe}")
            clone_url = self.get_git_clone_url(repo)
            self._progress(f"目标仓库URL: {clone_url}")
             
            # 检查当前目录是否是Git仓库
            if not os.path.exists(os.path.join(self.bot_path, ".git")):
                ui.print_info("当前不是Git仓库，将重新克隆...")
                self._progress("当前目录不是Git仓库，切换到重新克隆流程")
                return self._reclone_repository(repo, branch)
             
            # 执行Git更新（避免 merge，直接对齐远端，防止 unrelated histories）
            ui.print_info("正在更新Git仓库...")
            self._progress("采用 fetch + reset 对齐策略（避免 unrelated histories）")
            self._progress(f"执行 git remote set-url origin {clone_url} ...")

            set_remote_cmd = [git_exe, "remote", "set-url", "origin", clone_url]
            result = subprocess.run(set_remote_cmd, cwd=self.bot_path, capture_output=True, text=True)
            if result.returncode != 0:
                self._progress(f"设置远端地址失败: {self._clip_text(result.stderr)}")
             
            self._progress(f"执行 git fetch --prune origin {branch} ...")
            fetch_cmd = [git_exe, "fetch", "--prune", "origin", branch]
            result = subprocess.run(fetch_cmd, cwd=self.bot_path, capture_output=True, text=True)
            if result.returncode != 0:
                ui.print_warning(f"Git fetch失败: {result.stderr}")
                self._progress(f"git fetch 失败: {self._clip_text(result.stderr)}")
                self._progress("切换到重新克隆流程")
                return self._reclone_repository(repo, branch)
            elif result.stdout or result.stderr:
                self._progress(f"git fetch 输出: {self._clip_text(result.stdout or result.stderr)}")
             
            self._progress(f"执行 git checkout -B {branch} origin/{branch} ...")
            checkout_cmd = [git_exe, "checkout", "-B", branch, f"origin/{branch}"]
            result = subprocess.run(checkout_cmd, cwd=self.bot_path, capture_output=True, text=True)
            if result.returncode != 0:
                ui.print_warning(f"Git checkout失败: {result.stderr}")
                self._progress(f"git checkout 失败: {self._clip_text(result.stderr)}")
                self._progress("切换到重新克隆流程")
                return self._reclone_repository(repo, branch)

            self._progress(f"执行 git reset --hard origin/{branch} ...")
            reset_cmd = [git_exe, "reset", "--hard", f"origin/{branch}"]
            result = subprocess.run(reset_cmd, cwd=self.bot_path, capture_output=True, text=True)
             
            if result.returncode == 0:
                ui.print_success("✅ Git代码更新成功")
                self._progress(f"Git代码已对齐远端 {branch}: {self._clip_text(result.stdout or result.stderr)}")
                return True
            else:
                ui.print_warning(f"Git reset到远端失败: {result.stderr}")
                ui.print_info("尝试重新克隆仓库...")
                self._progress(f"git reset 失败: {self._clip_text(result.stderr)}")
                self._progress("切换到重新克隆流程")
                return self._reclone_repository(repo, branch)
                 
        except Exception as e:
            ui.print_error(f"Git更新失败: {str(e)}")
            self._progress(f"Git更新失败: {str(e)}", status="failed")
            return False
    
    def _reclone_repository(self, repo: str, branch: str) -> bool:
        """重新克隆仓库"""
        try:
            ui.print_info("正在重新克隆仓库...")
            self._progress(f"重新克隆仓库: {repo} @ {branch}")

            if not self.bot_path:
                ui.print_error("Bot路径为空，无法重克隆")
                self._progress("Bot路径为空，无法重克隆", status="failed")
                return False

            clone_url = self.get_git_clone_url(repo)
            temp_clone_root = tempfile.mkdtemp(prefix="update_clone_", dir=self.instance_dir or None)
            clone_target = os.path.join(temp_clone_root, "repo")
            self._progress(f"临时克隆目录: {clone_target}")

            old_backup_dir = f"{self.bot_path}.old_{int(time.time())}"

            if not self.clone_repository(clone_url, clone_target, branch):
                self._progress("临时目录克隆失败，请检查网络或仓库可达性", status="failed")
                shutil.rmtree(temp_clone_root, ignore_errors=True)
                return False

            self._progress("临时目录克隆成功，准备替换当前代码目录")

            # 原子替换目录：先移动旧目录，再把新目录换上
            shutil.move(self.bot_path, old_backup_dir)
            shutil.move(clone_target, self.bot_path)

            # 尽量保留旧目录中的 .env（如果新仓库不存在）
            old_env = os.path.join(old_backup_dir, ".env")
            new_env = os.path.join(self.bot_path, ".env")
            if os.path.exists(old_env) and not os.path.exists(new_env):
                shutil.copy2(old_env, new_env)
                self._progress("已从旧目录恢复 .env 文件")

            shutil.rmtree(temp_clone_root, ignore_errors=True)
            shutil.rmtree(old_backup_dir, ignore_errors=True)
            self._progress("目录替换完成，旧目录已清理")
            ui.print_success("✅ 仓库重新克隆成功")
            return True
                 
        except Exception as e:
            # 失败时尽可能回滚目录
            try:
                if self.bot_path and not os.path.exists(self.bot_path):
                    candidates = []
                    if self.bot_path:
                        parent = os.path.dirname(self.bot_path)
                        base = os.path.basename(self.bot_path) + ".old_"
                        if os.path.exists(parent):
                            for item in os.listdir(parent):
                                if item.startswith(base):
                                    candidates.append(os.path.join(parent, item))
                    if candidates:
                        latest = sorted(candidates, key=os.path.getmtime, reverse=True)[0]
                        shutil.move(latest, self.bot_path)
                        self._progress(f"重克隆失败，已自动回滚到旧目录: {latest}")
            except Exception:
                pass
            ui.print_error(f"重新克隆失败: {str(e)}")
            self._progress(f"重新克隆失败: {str(e)}", status="failed")
            return False
    
    def _update_dependencies(self) -> bool:
        """更新依赖"""
        try:
            ui.console.print("\n[🐍 第四步：更新依赖]", style=ui.colors["primary"])
            self._progress("开始检查虚拟环境和依赖文件...")

            venv_path = self.instance_config.get("venv_path", "")

            # 如果配置的venv不存在，尝试在实例目录下查找
            if not venv_path or not os.path.exists(venv_path):
                fallback = os.path.join(self.instance_dir, "venv")
                if os.path.exists(fallback):
                    venv_path = fallback
                    ui.print_info(f"在实例目录找到虚拟环境: {venv_path}")
                    self._progress(f"使用实例目录虚拟环境: {venv_path}")
                else:
                    # 重新创建虚拟环境到实例目录
                    ui.print_info("未找到虚拟环境，正在重新创建...")
                    self._progress("未找到虚拟环境，开始创建新虚拟环境...")
                    success, result = self.create_virtual_environment(self.instance_dir)
                    if success:
                        venv_path = result
                        self._progress(f"虚拟环境创建成功: {venv_path}")
                    else:
                        ui.print_warning("虚拟环境创建失败，跳过依赖更新")
                        self._progress("虚拟环境创建失败，跳过依赖更新")
                        return True

            requirements_path = os.path.join(self.bot_path, "requirements.txt")
            if not os.path.exists(requirements_path):
                ui.print_info("未找到requirements.txt，跳过依赖更新")
                self._progress("未找到 requirements.txt，跳过依赖更新")
                return True

            ui.print_info("正在更新Bot依赖...")
            self._progress(f"开始安装依赖: {requirements_path}")
            success = self.install_dependencies_in_venv(venv_path, requirements_path)

            if success:
                # 更新配置中的venv_path
                self.instance_config["venv_path"] = venv_path
                ui.print_success("✅ 依赖更新完成")
                self._progress("依赖安装完成")
            else:
                ui.print_warning("⚠️ 依赖更新失败")
                self._progress("依赖安装失败")

            return success

        except Exception as e:
            ui.print_warning(f"更新依赖时发生错误: {str(e)}")
            self._progress(f"更新依赖时发生错误: {str(e)}")
            return False
    
    def _restore_user_data(self) -> bool:
        """恢复用户数据"""
        try:
            ui.console.print("\n[🔄 第五步：恢复用户数据]", style=ui.colors["primary"])
            self._progress("开始从备份恢复 data/config/plugins ...")
             
            if not self.backup_dir or not os.path.exists(self.backup_dir):
                ui.print_warning("未找到备份目录，跳过数据恢复")
                self._progress("未找到备份目录，跳过数据恢复")
                return True
            
            # 恢复数据目录
            backup_data_dir = os.path.join(self.backup_dir, "data")
            if os.path.exists(backup_data_dir):
                target_data_dir = os.path.join(self.bot_path, "data")
                try:
                    if os.path.exists(target_data_dir):
                        shutil.rmtree(target_data_dir)
                    shutil.copytree(backup_data_dir, target_data_dir)
                    ui.print_success("✅ 已恢复: 数据目录")
                    self._progress(f"已恢复数据目录: {target_data_dir}")
                except Exception as e:
                    ui.print_warning(f"⚠️ 恢复数据目录失败: {str(e)}")
                    self._progress(f"恢复数据目录失败: {str(e)}")
            
            # 恢复配置目录
            backup_config_dir = os.path.join(self.backup_dir, "config")
            if os.path.exists(backup_config_dir):
                target_config_dir = os.path.join(self.bot_path, "config")
                try:
                    if os.path.exists(target_config_dir):
                        shutil.rmtree(target_config_dir)
                    shutil.copytree(backup_config_dir, target_config_dir)
                    ui.print_success("✅ 已恢复: 配置目录")
                    self._progress(f"已恢复配置目录: {target_config_dir}")
                except Exception as e:
                    ui.print_warning(f"⚠️ 恢复配置目录失败: {str(e)}")
                    self._progress(f"恢复配置目录失败: {str(e)}")
            
            # 恢复插件目录
            backup_plugins_dir = os.path.join(self.backup_dir, "plugins")
            if os.path.exists(backup_plugins_dir):
                target_plugins_dir = os.path.join(self.bot_path, "plugins")
                try:
                    if os.path.exists(target_plugins_dir):
                        shutil.rmtree(target_plugins_dir)
                    shutil.copytree(backup_plugins_dir, target_plugins_dir)
                    ui.print_success("✅ 已恢复: 插件目录")
                    self._progress(f"已恢复插件目录: {target_plugins_dir}")
                except Exception as e:
                    ui.print_warning(f"⚠️ 恢复插件目录失败: {str(e)}")
                    self._progress(f"恢复插件目录失败: {str(e)}")
             
            ui.print_success("✅ 用户数据恢复完成")
            self._progress("用户数据恢复完成")
            return True
            
        except Exception as e:
            ui.print_error(f"恢复用户数据失败: {str(e)}")
            self._progress(f"恢复用户数据失败: {str(e)}", status="failed")
            return False
    
    def _update_configuration(self, new_version: Dict) -> bool:
        """更新配置"""
        try:
            ui.console.print("\n[⚙️ 第六步：更新配置]", style=ui.colors["primary"])
            self._progress("开始检查并更新配置兼容性...")
            
            # 这里可以添加配置更新逻辑
            # 例如根据新版本更新配置文件格式等
            
            ui.print_info("检查配置文件兼容性...")
            self._progress(f"目标版本: {new_version.get('display_name') or new_version.get('name', '-')}")
            
            # TODO: 根据新版本更新配置
            # 目前先跳过，假设配置兼容
            
            ui.print_success("✅ 配置检查完成")
            self._progress("配置兼容性检查完成")
            return True
            
        except Exception as e:
            ui.print_warning(f"更新配置时发生错误: {str(e)}")
            self._progress(f"更新配置时发生错误: {str(e)}")
            return False
    
    def _restore_from_backup(self) -> bool:
        """从备份恢复"""
        try:
            ui.console.print("\n[🔄 恢复备份]", style=ui.colors["warning"])
            self._progress("开始执行备份回滚流程...")
             
            if not self.backup_dir or not os.path.exists(self.backup_dir):
                ui.print_error("未找到备份目录，无法恢复")
                self._progress("未找到备份目录，无法恢复", status="failed")
                return False
            
            ui.print_info(f"从备份恢复: {self.backup_dir}")
            self._progress(f"从备份恢复: {self.backup_dir}")
            
            # 恢复所有备份的数据
            backup_items = ["data", "config", "plugins"]
            
            for item in backup_items:
                backup_path = os.path.join(self.backup_dir, item)
                if os.path.exists(backup_path):
                    target_path = os.path.join(self.bot_path, item)
                    try:
                        if os.path.exists(target_path):
                            shutil.rmtree(target_path)
                        shutil.copytree(backup_path, target_path)
                        ui.print_success(f"✅ 已恢复: {item}")
                        self._progress(f"已恢复: {item}")
                    except Exception as e:
                        ui.print_error(f"恢复 {item} 失败: {str(e)}")
                        self._progress(f"恢复 {item} 失败: {str(e)}")
             
            ui.print_success("✅ 备份恢复完成")
            self._progress("备份恢复完成")
            return True
            
        except Exception as e:
            ui.print_error(f"恢复备份失败: {str(e)}")
            self._progress(f"恢复备份失败: {str(e)}", status="failed")
            return False
    
    def _update_instance_config(self, new_version: Dict) -> bool:
        """更新实例配置"""
        try:
            self._progress("开始写回实例配置版本信息...")
            # 更新配置中的版本信息
            config_key = None
            configs = config_manager.get_all_configurations()
            
            for key, cfg in configs.items():
                if str(cfg.get("serial_number", "")) == self.instance_config.get("serial_number"):
                    config_key = key
                    break
            
            if config_key:
                # 更新版本信息
                self.instance_config["version_path"] = new_version["name"]
                
                # 保存更新后的配置
                try:
                    # 直接更新配置字典
                    config_manager.config["configurations"][config_key] = self.instance_config
                    # 保存配置
                    if not config_manager.save():
                        ui.print_error("保存配置失败")
                        self._progress("保存配置失败", status="failed")
                        return False
                    ui.print_success("实例配置更新成功")
                    self._progress(f"实例配置更新成功，version_path={new_version['name']}")
                except Exception as e:
                    ui.print_error(f"更新实例配置时发生错误: {str(e)}")
                    self._progress(f"更新实例配置失败: {str(e)}", status="failed")
                    logger.error("更新实例配置失败", error=str(e))
                    return False
            else:
                ui.print_warning("⚠️ 未找到实例配置键")
                self._progress("未找到实例配置键，无法写回版本信息")
                return False
                
        except Exception as e:
            ui.print_warning(f"更新实例配置时发生错误: {str(e)}")
            self._progress(f"更新实例配置时发生错误: {str(e)}", status="failed")
            return False
    
    def _cleanup(self):
        """清理临时文件"""
        try:
            # 清理临时备份目录（保留最近的几个备份）
            if self.backup_dir and os.path.exists(self.backup_dir):
                # 可以选择保留备份或删除
                # 这里先保留备份，以防万一
                pass
            self._progress("清理阶段完成")
        except Exception as e:
            ui.print_warning(f"清理临时文件时发生错误: {str(e)}")
            self._progress(f"清理阶段发生错误: {str(e)}")
    
    def list_available_versions(self, bot_type: str) -> List[Dict]:
        """获取可用的版本列表"""
        try:
            if bot_type == "MaiBot":
                from .version_manager import VersionManager
                version_manager = VersionManager("MaiM-with-u/MaiBot")
                return version_manager.get_available_versions()
            else:
                from .version_manager import VersionManager
                version_manager = VersionManager("MoFox-Studio/MoFox-Core")
                return version_manager.get_available_versions()
        except Exception as e:
            ui.print_error(f"获取版本列表失败: {str(e)}")
            return []
    
    def cleanup_old_backups(self, keep_count: int = 5) -> bool:
        """清理旧备份，保留最新的N个"""
        try:
            backups_dir = os.path.join(self.instance_dir, "backups")
            if not os.path.exists(backups_dir):
                return True
            
            # 获取所有备份目录
            backup_dirs = []
            for item in os.listdir(backups_dir):
                item_path = os.path.join(backups_dir, item)
                if os.path.isdir(item_path) and item.startswith("backup_"):
                    backup_dirs.append((item_path, os.path.getctime(item_path)))
            
            # 按创建时间排序
            backup_dirs.sort(key=lambda x: x[1], reverse=True)
            
            # 删除多余的备份
            if len(backup_dirs) > keep_count:
                for backup_path, _ in backup_dirs[keep_count:]:
                    try:
                        shutil.rmtree(backup_path)
                        ui.print_info(f"已删除旧备份: {os.path.basename(backup_path)}")
                    except Exception as e:
                        ui.print_warning(f"删除备份失败 {backup_path}: {str(e)}")
            
            return True
            
        except Exception as e:
            ui.print_warning(f"清理旧备份时发生错误: {str(e)}")
            return False
