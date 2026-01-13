"""MCP server management endpoints"""

import time
from fastapi import APIRouter, HTTPException

from ..models.mcp_schemas import (
    MCPServerInfo,
    MCPToolInfo,
    ConnectResponse,
    DisconnectResponse,
    ToolCallRequest,
    ToolCallResponse,
    ConnectionStatus,
    SetSecretRequest,
    SetSecretResponse,
)

router = APIRouter(prefix="/api/mcp", tags=["mcp"])


def get_mcp_service():
    """Get the MCP client service instance"""
    from ..main import mcp_service
    return mcp_service


@router.get("/servers", response_model=list[MCPServerInfo])
async def list_servers():
    """List all configured MCP servers with their status"""
    service = get_mcp_service()
    return service.get_all_servers_info()


@router.get("/servers/{server_id}", response_model=MCPServerInfo)
async def get_server(server_id: str):
    """Get detailed info for a specific server"""
    service = get_mcp_service()
    info = service.get_server_info(server_id)
    if not info:
        raise HTTPException(status_code=404, detail=f"Server not found: {server_id}")
    return info


@router.post("/servers/{server_id}/connect", response_model=ConnectResponse)
async def connect_server(server_id: str):
    """Connect to an MCP server"""
    service = get_mcp_service()

    # Check if server exists
    info = service.get_server_info(server_id)
    if not info:
        raise HTTPException(status_code=404, detail=f"Server not found: {server_id}")

    # Try to connect
    success, error = await service.connect(server_id)

    # Get updated info
    updated_info = service.get_server_info(server_id)

    return ConnectResponse(
        success=success,
        server_id=server_id,
        status=updated_info.status if updated_info else ConnectionStatus.ERROR,
        error=error,
        tool_count=updated_info.tool_count if updated_info else 0,
    )


@router.post("/servers/{server_id}/disconnect", response_model=DisconnectResponse)
async def disconnect_server(server_id: str):
    """Disconnect from an MCP server"""
    service = get_mcp_service()

    # Check if server exists
    info = service.get_server_info(server_id)
    if not info:
        raise HTTPException(status_code=404, detail=f"Server not found: {server_id}")

    await service.disconnect(server_id)

    return DisconnectResponse(
        success=True,
        server_id=server_id,
    )


@router.get("/tools", response_model=list[MCPToolInfo])
async def list_tools():
    """Get all available tools from connected servers"""
    service = get_mcp_service()
    return service.get_all_tools()


@router.post("/tools/call", response_model=ToolCallResponse)
async def call_tool(request: ToolCallRequest):
    """Call a specific MCP tool"""
    service = get_mcp_service()

    start_time = time.time()
    success, result, error = await service.call_tool(request.tool_name, request.arguments)
    execution_time = (time.time() - start_time) * 1000

    # Convert MCP result to serializable format
    result_data = None
    if success and result:
        # MCP results have content attribute
        if hasattr(result, 'content'):
            result_data = [
                {"type": c.type, "text": getattr(c, 'text', None)}
                for c in result.content
            ]
        else:
            result_data = result

    return ToolCallResponse(
        success=success,
        tool_name=request.tool_name,
        result=result_data,
        error=error,
        execution_time_ms=execution_time,
    )


@router.post("/secrets", response_model=SetSecretResponse)
async def set_secret(request: SetSecretRequest):
    """Set an API key or secret for MCP servers"""
    service = get_mcp_service()

    if not request.key or not request.value:
        raise HTTPException(status_code=400, detail="Key and value are required")

    service.set_secret(request.key, request.value)

    return SetSecretResponse(
        success=True,
        key=request.key,
        message=f"Secret '{request.key}' saved successfully",
    )


@router.delete("/secrets/{key}", response_model=SetSecretResponse)
async def delete_secret(key: str):
    """Delete an API key or secret"""
    service = get_mcp_service()

    if service.delete_secret(key):
        return SetSecretResponse(
            success=True,
            key=key,
            message=f"Secret '{key}' deleted successfully",
        )
    else:
        return SetSecretResponse(
            success=False,
            key=key,
            message=f"Secret '{key}' not found",
        )
