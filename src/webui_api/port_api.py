# -*- coding: utf-8 -*-
"""
端口管理API模块
为WebUI提供端口检测和管理的API接口
"""
import socket
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


# --- 请求/响应模型 ---

class PortCheckRequest(BaseModel):
    """端口检查请求"""
    port: int
    host: str = "localhost"


class PortReserveRequest(BaseModel):
    """端口预留请求"""
    port: int
    description: str = ""


# --- 辅助函数 ---

def is_port_in_use(port: int, host: str = "localhost") -> bool:
    """检查端口是否已被占用"""
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(1)
    try:
        result = sock.connect_ex((host, port))
        sock.close()
        return result == 0
    except Exception:
        return False


def get_available_port(start_port: int = 8000, end_port: int = 9000) -> Optional[int]:
    """获取一个可用端口"""
    for port in range(start_port, end_port + 1):
        if not is_port_in_use(port):
            return port
    return None


def scan_ports(start_port: int, end_port: int, host: str = "localhost") -> List[Dict[str, Any]]:
    """扫描指定范围的端口"""
    results = []
    for port in range(start_port, end_port + 1):
        in_use = is_port_in_use(port, host)
        results.append({
            "port": port,
            "in_use": in_use,
            "host": host
        })
    return results


# --- 常用端口定义 ---

COMMON_PORTS = {
    8001: "MaiBot WebUI (内置)",
    7999: "MaiBot WebUI (独立)",
    12138: "MoFox WebUI",
    27017: "MongoDB",
    8080: "HTTP 服务",
    5000: "Flask 默认",
    3000: "Node.js 开发服务器",
    8888: "Jupyter Notebook",
    22: "SSH",
    21: "FTP"
}


# --- API端点 ---

@router.get("/port/check/{port}", summary="检查端口状态")
async def check_port(port: int, host: str = "localhost"):
    """
    检查指定端口是否已被占用
    
    - **port**: 端口号
    - **host**: 主机地址（默认localhost）
    """
    try:
        if port < 1 or port > 65535:
            raise HTTPException(status_code=400, detail="端口号无效")
        
        in_use = is_port_in_use(port, host)
        description = COMMON_PORTS.get(port, "未知服务")
        
        return {
            "success": True,
            "port": port,
            "host": host,
            "in_use": in_use,
            "description": description
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"检查端口失败: {str(e)}")


@router.post("/port/check-multiple", summary="批量检查端口")
async def check_multiple_ports(ports: List[int], host: str = "localhost"):
    """
    批量检查多个端口的状态
    
    - **ports**: 端口号列表
    - **host**: 主机地址（默认localhost）
    """
    try:
        results = []
        for port in ports:
            if port < 1 or port > 65535:
                continue
            
            in_use = is_port_in_use(port, host)
            description = COMMON_PORTS.get(port, "未知服务")
            
            results.append({
                "port": port,
                "host": host,
                "in_use": in_use,
                "description": description
            })
        
        return {
            "success": True,
            "count": len(results),
            "results": results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"批量检查端口失败: {str(e)}")


@router.get("/port/range/{start_port}/{end_port}", summary="扫描端口范围")
async def scan_port_range(start_port: int, end_port: int, host: str = "localhost"):
    """
    扫描指定范围内的端口
    
    - **start_port**: 起始端口
    - **end_port**: 结束端口
    - **host**: 主机地址（默认localhost）
    """
    try:
        if start_port < 1 or end_port > 65535 or start_port > end_port:
            raise HTTPException(status_code=400, detail="端口范围无效")
        
        if end_port - start_port > 1000:
            raise HTTPException(status_code=400, detail="扫描范围过大，请控制在1000个端口以内")
        
        results = scan_ports(start_port, end_port, host)
        
        # 统计信息
        in_use_count = sum(1 for r in results if r["in_use"])
        available_count = len(results) - in_use_count
        
        return {
            "success": True,
            "start_port": start_port,
            "end_port": end_port,
            "host": host,
            "total": len(results),
            "in_use": in_use_count,
            "available": available_count,
            "results": results
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"扫描端口失败: {str(e)}")


@router.get("/port/available", summary="获取可用端口")
async def get_available_port_api(start_port: int = 8000, end_port: int = 9000):
    """
    获取一个可用端口
    
    - **start_port**: 起始端口（默认8000）
    - **end_port**: 结束端口（默认9000）
    """
    try:
        if start_port < 1 or end_port > 65535 or start_port > end_port:
            raise HTTPException(status_code=400, detail="端口范围无效")
        
        available = get_available_port(start_port, end_port)
        
        if available:
            return {
                "success": True,
                "available_port": available,
                "suggestion": f"建议使用端口 {available}"
            }
        else:
            return {
                "success": False,
                "message": f"在范围 {start_port}-{end_port} 内没有找到可用端口"
            }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取可用端口失败: {str(e)}")


@router.get("/port/common", summary="获取常用端口列表")
async def get_common_ports():
    """获取常用端口列表及其状态"""
    try:
        results = []
        for port, description in COMMON_PORTS.items():
            in_use = is_port_in_use(port)
            results.append({
                "port": port,
                "description": description,
                "in_use": in_use
            })
        
        return {
            "success": True,
            "count": len(results),
            "ports": results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取常用端口失败: {str(e)}")


@router.get("/port/instance/{serial_number}", summary="获取实例使用的端口")
async def get_instance_ports(serial_number: str):
    """
    获取指定实例可能使用的端口
    
    - **serial_number**: 实例序列号
    """
    try:
        # 返回实例可能使用的端口列表
        instance_ports = [
            {"port": 8001, "description": "MaiBot WebUI (内置)", "required": True},
            {"port": 7999, "description": "MaiBot WebUI (独立)", "required": False},
            {"port": 12138, "description": "MoFox WebUI", "required": False},
            {"port": 27017, "description": "MongoDB", "required": False},
            {"port": 8080, "description": "HTTP 服务", "required": False}
        ]
        
        # 检查每个端口的状态
        results = []
        for port_info in instance_ports:
            port = port_info["port"]
            in_use = is_port_in_use(port)
            results.append({
                **port_info,
                "in_use": in_use
            })
        
        return {
            "success": True,
            "serial_number": serial_number,
            "ports": results
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"获取实例端口失败: {str(e)}")


@router.post("/port/reserve", summary="预留端口")
async def reserve_port(request: PortReserveRequest):
    """
    预留端口（记录端口用途）
    
    注意：这只是记录端口用途，不实际占用端口
    
    - **port**: 端口号
    - **description**: 端口用途描述
    """
    try:
        if request.port < 1 or request.port > 65535:
            raise HTTPException(status_code=400, detail="端口号无效")
        
        # 检查端口是否已被使用
        in_use = is_port_in_use(request.port)
        
        if in_use:
            return {
                "success": False,
                "message": f"端口 {request.port} 已被占用，无法预留",
                "port": request.port,
                "in_use": True
            }
        
        # 这里可以添加预留记录到配置文件
        # 目前只是返回成功
        
        return {
            "success": True,
            "message": f"端口 {request.port} 预留成功",
            "port": request.port,
            "description": request.description,
            "in_use": False
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"预留端口失败: {str(e)}")
