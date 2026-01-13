"""Pydantic models for MCP API"""

from pydantic import BaseModel, Field
from enum import Enum
from typing import Optional, Any


class ServerType(str, Enum):
    """Type of MCP server connection"""
    STDIO = "stdio"
    SSE = "sse"
    HTTP = "http"


class ConnectionStatus(str, Enum):
    """Status of MCP server connection"""
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    ERROR = "error"


class RequiredSecret(BaseModel):
    """A secret required by an MCP server"""
    key: str
    name: str
    description: str = ""


class MCPServerConfig(BaseModel):
    """Configuration for an MCP server"""
    id: str
    name: str
    description: str
    type: ServerType
    command: Optional[str] = None
    args: Optional[list[str]] = None
    url: Optional[str] = None
    env: Optional[dict[str, str]] = None
    required_secrets: list[RequiredSecret] = Field(default_factory=list)
    enabled: bool = True


class SecretStatus(BaseModel):
    """Status of a required secret"""
    key: str
    name: str
    description: str
    configured: bool


class MCPServerInfo(BaseModel):
    """Server info returned by API"""
    id: str
    name: str
    description: str
    type: ServerType
    enabled: bool
    status: ConnectionStatus
    error_message: Optional[str] = None
    tool_count: int = 0
    tools: list[str] = Field(default_factory=list)
    required_secrets: list[SecretStatus] = Field(default_factory=list)


class MCPToolInfo(BaseModel):
    """Tool info returned by API"""
    name: str
    description: str
    input_schema: dict
    server_id: str
    server_name: str


class ConnectResponse(BaseModel):
    """Response from connect endpoint"""
    success: bool
    server_id: str
    status: ConnectionStatus
    error: Optional[str] = None
    tool_count: int = 0


class DisconnectResponse(BaseModel):
    """Response from disconnect endpoint"""
    success: bool
    server_id: str


class ToolCallRequest(BaseModel):
    """Request to call an MCP tool"""
    tool_name: str
    arguments: dict = Field(default_factory=dict)


class ToolCallResponse(BaseModel):
    """Response from tool call"""
    success: bool
    tool_name: str
    result: Optional[Any] = None
    error: Optional[str] = None
    execution_time_ms: Optional[float] = None


class SetSecretRequest(BaseModel):
    """Request to set an API key/secret"""
    key: str
    value: str


class SetSecretResponse(BaseModel):
    """Response from setting a secret"""
    success: bool
    key: str
    message: Optional[str] = None
