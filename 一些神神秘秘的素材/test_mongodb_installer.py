#!/usr/bin/env python3
"""
MongoDB安装器测试脚本
用于测试MongoDB安装功能
"""
import sys
import os

# 添加项目根目录到Python路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.modules.mongodb_installer import mongodb_installer
from src.core.logging import setup_logging, get_logger
from src.ui.interface import ui

# 设置日志
setup_logging()
logger = get_logger(__name__)


def test_version_comparison():
    """测试版本比较功能"""
    print("测试版本比较功能...")
    
    test_cases = [
        ("0.6.0", "0.7.0", -1),  # 0.6.0 < 0.7.0
        ("0.7.0", "0.7.0", 0),   # 0.7.0 == 0.7.0
        ("0.8.0", "0.7.0", 1),   # 0.8.0 > 0.7.0
        ("classical", "0.7.0", -1),  # classical 应该被处理为旧版本
        ("v0.6.5", "0.7.0", -1),     # 带v前缀的版本
    ]
    
    for v1, v2, expected in test_cases:
        result = mongodb_installer.compare_version(v1, v2)
        status = "✅" if result == expected else "❌"
        print(f"{status} {v1} vs {v2}: 期望={expected}, 实际={result}")


def test_should_install_mongodb():
    """测试是否需要安装MongoDB的判断"""
    print("\n测试MongoDB安装判断...")
    
    test_versions = [
        ("0.6.0", True),     # 小于0.7，需要安装
        ("0.6.9", True),     # 小于0.7，需要安装
        ("0.7.0", False),    # 等于0.7，不需要安装
        ("0.8.0", False),    # 大于0.7，不需要安装
        ("classical", True), # classical版本，需要安装
        ("", False),         # 空版本，不安装
    ]
    
    for version, expected in test_versions:
        result = mongodb_installer.should_install_mongodb(version)
        status = "✅" if result == expected else "❌"
        print(f"{status} 版本 '{version}': 期望安装={expected}, 实际判断={result}")


def interactive_test():
    """交互式测试"""
    print("\n交互式测试 - MongoDB安装检查")
    print("请输入一个版本号来测试MongoDB安装检查功能")
    
    while True:
        version = input("\n请输入版本号（输入 'q' 退出）: ").strip()
        if version.lower() == 'q':
            break
        
        if not version:
            print("版本号不能为空")
            continue
        
        print(f"\n测试版本: {version}")
        should_install = mongodb_installer.should_install_mongodb(version)
        print(f"是否需要安装MongoDB: {should_install}")
        
        if should_install:
            print("这个版本 < 0.7.0，需要安装MongoDB")
            
            # 询问是否模拟安装
            simulate = input("是否模拟安装过程？(y/N): ").strip().lower()
            if simulate == 'y':
                print("模拟安装MongoDB...")
                print("在实际环境中，此时会:")
                print("1. 下载MongoDB")
                print("2. 解压MongoDB")
                print("3. 询问是否安装MongoDB Compass")
                print("模拟安装完成！")
        else:
            print("这个版本 >= 0.7.0，无需安装MongoDB")


def main():
    """主函数"""
    ui.clear_screen()
    ui.console.print("[🧪 MongoDB安装器测试]", style=ui.colors["primary"])
    ui.console.print("="*50)
    
    try:
        # 运行版本比较测试
        test_version_comparison()
        
        # 运行安装判断测试
        test_should_install_mongodb()
        
        # 交互式测试
        interactive_test()
        
        print("\n测试完成！")
        
    except KeyboardInterrupt:
        print("\n测试被用户中断")
    except Exception as e:
        print(f"\n测试过程中发生错误: {e}")
        logger.error("测试失败", error=str(e))


if __name__ == "__main__":
    main()
