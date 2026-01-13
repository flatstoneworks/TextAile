"""MCP Client Service for TextAile

Manages connections to MCP servers and tool execution.
"""

import os
import yaml
import asyncio
import logging
import time
from pathlib import Path
from typing import Optional, Any
from dataclasses import dataclass, field
from contextlib import AsyncExitStack

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from ..models.mcp_schemas import (
    ServerType,
    ConnectionStatus,
    MCPServerConfig,
    MCPServerInfo,
    MCPToolInfo,
    RequiredSecret,
    SecretStatus,
)
from .secrets_store import SecretsStore

logger = logging.getLogger(__name__)


@dataclass
class MCPConnection:
    """Represents a single connection to an MCP server"""
    config: MCPServerConfig
    secrets_store: Optional[SecretsStore] = None
    session: Optional[ClientSession] = None
    status: ConnectionStatus = ConnectionStatus.DISCONNECTED
    error_message: Optional[str] = None
    tools: list[MCPToolInfo] = field(default_factory=list)
    _exit_stack: Optional[AsyncExitStack] = None
    _stdio_transport: Optional[Any] = None

    async def connect(self) -> bool:
        """Establish connection to MCP server"""
        if self.status == ConnectionStatus.CONNECTED:
            return True

        self.status = ConnectionStatus.CONNECTING
        self.error_message = None

        try:
            if self.config.type == ServerType.STDIO:
                return await self._connect_stdio()
            else:
                self.error_message = f"Unsupported server type: {self.config.type}"
                self.status = ConnectionStatus.ERROR
                return False

        except Exception as e:
            logger.error(f"Failed to connect to {self.config.id}: {e}")
            self.error_message = str(e)
            self.status = ConnectionStatus.ERROR
            return False

    async def _connect_stdio(self) -> bool:
        """Connect to a stdio-based MCP server"""
        if not self.config.command:
            self.error_message = "No command specified for stdio server"
            self.status = ConnectionStatus.ERROR
            return False

        # Build environment with any custom env vars
        env = os.environ.copy()
        if self.config.env:
            for key, value in self.config.env.items():
                # Expand environment variable references
                if value.startswith("${") and value.endswith("}"):
                    env_var = value[2:-1]
                    # First check secrets store, then fall back to os.environ
                    if self.secrets_store and self.secrets_store.has(env_var):
                        env[key] = self.secrets_store.get(env_var)
                    else:
                        env[key] = os.environ.get(env_var, "")
                else:
                    env[key] = value

        # Create server parameters
        server_params = StdioServerParameters(
            command=self.config.command,
            args=self.config.args or [],
            env=env,
        )

        # Create exit stack for managing resources
        self._exit_stack = AsyncExitStack()

        try:
            # Start the stdio client
            stdio_transport = await self._exit_stack.enter_async_context(
                stdio_client(server_params)
            )
            self._stdio_transport = stdio_transport

            # Create and initialize session
            read_stream, write_stream = stdio_transport
            self.session = await self._exit_stack.enter_async_context(
                ClientSession(read_stream, write_stream)
            )

            # Initialize the session
            await self.session.initialize()

            # Fetch available tools
            await self._refresh_tools()

            self.status = ConnectionStatus.CONNECTED
            logger.info(f"Connected to MCP server: {self.config.name} ({len(self.tools)} tools)")
            return True

        except Exception as e:
            logger.error(f"Stdio connection failed for {self.config.id}: {e}")
            if self._exit_stack:
                await self._exit_stack.aclose()
                self._exit_stack = None
            self.error_message = str(e)
            self.status = ConnectionStatus.ERROR
            return False

    async def disconnect(self) -> None:
        """Close connection to MCP server"""
        if self._exit_stack:
            try:
                await self._exit_stack.aclose()
            except Exception as e:
                logger.error(f"Error closing connection to {self.config.id}: {e}")
            finally:
                self._exit_stack = None
                self.session = None
                self._stdio_transport = None

        self.tools = []
        self.status = ConnectionStatus.DISCONNECTED
        self.error_message = None
        logger.info(f"Disconnected from MCP server: {self.config.name}")

    async def _refresh_tools(self) -> None:
        """Fetch available tools from connected server"""
        if not self.session:
            self.tools = []
            return

        try:
            result = await self.session.list_tools()
            self.tools = [
                MCPToolInfo(
                    name=tool.name,
                    description=tool.description or "",
                    input_schema=tool.inputSchema if hasattr(tool, 'inputSchema') else {},
                    server_id=self.config.id,
                    server_name=self.config.name,
                )
                for tool in result.tools
            ]
        except Exception as e:
            logger.error(f"Failed to list tools for {self.config.id}: {e}")
            self.tools = []

    async def call_tool(self, tool_name: str, arguments: dict) -> Any:
        """Execute a tool on the connected server"""
        if not self.session or self.status != ConnectionStatus.CONNECTED:
            raise RuntimeError(f"Not connected to server {self.config.id}")

        result = await self.session.call_tool(tool_name, arguments)
        return result


class MCPClientService:
    """Main service for managing MCP server connections"""

    def __init__(self, config_path: str = "mcp_config.yaml", secrets_path: str = "secrets.json"):
        self.config_path = Path(config_path)
        self.secrets_store = SecretsStore(secrets_path)
        self.servers: dict[str, MCPServerConfig] = {}
        self.connections: dict[str, MCPConnection] = {}
        self.defaults: dict = {}
        self._load_config()

    def _load_config(self) -> None:
        """Load MCP configuration from YAML"""
        if not self.config_path.exists():
            logger.warning(f"MCP config not found at {self.config_path}")
            return

        try:
            with open(self.config_path) as f:
                config = yaml.safe_load(f) or {}

            self.defaults = config.get("defaults", {})

            # Parse server configurations
            for server_id, server_config in config.get("servers", {}).items():
                # Parse required secrets
                required_secrets = []
                for secret_config in server_config.get("required_secrets", []):
                    required_secrets.append(RequiredSecret(
                        key=secret_config.get("key", ""),
                        name=secret_config.get("name", ""),
                        description=secret_config.get("description", ""),
                    ))

                self.servers[server_id] = MCPServerConfig(
                    id=server_id,
                    name=server_config.get("name", server_id),
                    description=server_config.get("description", ""),
                    type=ServerType(server_config.get("type", "stdio")),
                    command=server_config.get("command"),
                    args=server_config.get("args"),
                    url=server_config.get("url"),
                    env=server_config.get("env"),
                    required_secrets=required_secrets,
                    enabled=server_config.get("enabled", True),
                )

            logger.info(f"Loaded {len(self.servers)} MCP server configurations")

        except Exception as e:
            logger.error(f"Failed to load MCP config: {e}")

    def get_server_configs(self) -> list[MCPServerConfig]:
        """Get all configured servers"""
        return list(self.servers.values())

    def get_server_info(self, server_id: str) -> Optional[MCPServerInfo]:
        """Get info for a specific server including connection status"""
        config = self.servers.get(server_id)
        if not config:
            return None

        conn = self.connections.get(server_id)
        status = conn.status if conn else ConnectionStatus.DISCONNECTED
        error = conn.error_message if conn else None
        tools = conn.tools if conn else []

        # Build required secrets status
        required_secrets = [
            SecretStatus(
                key=secret.key,
                name=secret.name,
                description=secret.description,
                configured=self.secrets_store.has(secret.key),
            )
            for secret in config.required_secrets
        ]

        return MCPServerInfo(
            id=config.id,
            name=config.name,
            description=config.description,
            type=config.type,
            enabled=config.enabled,
            status=status,
            error_message=error,
            tool_count=len(tools),
            tools=[t.name for t in tools],
            required_secrets=required_secrets,
        )

    def get_all_servers_info(self) -> list[MCPServerInfo]:
        """Get info for all configured servers"""
        return [
            self.get_server_info(server_id)
            for server_id in self.servers
            if self.get_server_info(server_id) is not None
        ]

    async def connect(self, server_id: str) -> tuple[bool, Optional[str]]:
        """Connect to a specific MCP server"""
        config = self.servers.get(server_id)
        if not config:
            return False, f"Unknown server: {server_id}"

        if not config.enabled:
            return False, f"Server {server_id} is disabled"

        # Create connection if it doesn't exist
        if server_id not in self.connections:
            self.connections[server_id] = MCPConnection(
                config=config,
                secrets_store=self.secrets_store,
            )

        conn = self.connections[server_id]

        # Already connected?
        if conn.status == ConnectionStatus.CONNECTED:
            return True, None

        # Try to connect
        success = await conn.connect()
        return success, conn.error_message

    async def disconnect(self, server_id: str) -> bool:
        """Disconnect from a specific MCP server"""
        conn = self.connections.get(server_id)
        if not conn:
            return True  # Already disconnected

        await conn.disconnect()
        return True

    def get_connection_status(self, server_id: str) -> ConnectionStatus:
        """Get the current connection status"""
        conn = self.connections.get(server_id)
        return conn.status if conn else ConnectionStatus.DISCONNECTED

    def get_all_tools(self) -> list[MCPToolInfo]:
        """Get tools from all connected servers"""
        tools = []
        for conn in self.connections.values():
            if conn.status == ConnectionStatus.CONNECTED:
                tools.extend(conn.tools)
        return tools

    def get_tool(self, tool_name: str) -> Optional[tuple[MCPToolInfo, MCPConnection]]:
        """Find a tool by name and return it with its connection"""
        for conn in self.connections.values():
            if conn.status == ConnectionStatus.CONNECTED:
                for tool in conn.tools:
                    if tool.name == tool_name:
                        return tool, conn
        return None

    async def call_tool(self, tool_name: str, arguments: dict) -> tuple[bool, Any, Optional[str]]:
        """Route tool call to appropriate server"""
        tool_info = self.get_tool(tool_name)
        if not tool_info:
            return False, None, f"Tool not found: {tool_name}"

        tool, conn = tool_info

        try:
            start_time = time.time()
            result = await conn.call_tool(tool_name, arguments)
            execution_time = (time.time() - start_time) * 1000  # ms
            logger.info(f"Tool {tool_name} executed in {execution_time:.0f}ms")
            return True, result, None
        except Exception as e:
            logger.error(f"Tool call failed for {tool_name}: {e}")
            return False, None, str(e)

    def get_tools_for_llm(self) -> list[dict]:
        """Format tools for LLM consumption (OpenAI-style function calling)"""
        tools = []
        for tool in self.get_all_tools():
            tools.append({
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.input_schema,
                }
            })
        return tools

    async def disconnect_all(self) -> None:
        """Disconnect from all servers (for cleanup)"""
        for server_id in list(self.connections.keys()):
            await self.disconnect(server_id)

    def set_secret(self, key: str, value: str) -> None:
        """Set a secret/API key"""
        self.secrets_store.set(key, value)

    def delete_secret(self, key: str) -> bool:
        """Delete a secret/API key"""
        return self.secrets_store.delete(key)

    def has_secret(self, key: str) -> bool:
        """Check if a secret exists"""
        return self.secrets_store.has(key)
