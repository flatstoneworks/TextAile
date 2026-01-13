"""Agent-related Pydantic schemas for TextAile

Defines data models for agents, sources, runs, and reports.
"""

from datetime import datetime
from enum import Enum
from typing import Optional, Any
from pydantic import BaseModel, Field
import uuid


class SourceType(str, Enum):
    """Types of data sources agents can fetch"""
    FETCH = "fetch"      # URL fetching via MCP
    BRAVE = "brave"      # Web search via Brave Search
    FILE = "file"        # Local file read
    MCP = "mcp"          # Custom MCP tool call


class TriggerType(str, Enum):
    """How an agent run was triggered"""
    SCHEDULED = "scheduled"
    MANUAL = "manual"


class RunStatus(str, Enum):
    """Status of an agent run"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


# ============================================================================
# Source Definitions
# ============================================================================

class FetchSource(BaseModel):
    """URL fetch source configuration"""
    type: SourceType = SourceType.FETCH
    url: str
    label: Optional[str] = None


class BraveSource(BaseModel):
    """Brave search source configuration"""
    type: SourceType = SourceType.BRAVE
    query: str
    label: Optional[str] = None
    count: int = 5


class FileSource(BaseModel):
    """Local file source configuration"""
    type: SourceType = SourceType.FILE
    path: str
    label: Optional[str] = None


class MCPSource(BaseModel):
    """Custom MCP tool source configuration"""
    type: SourceType = SourceType.MCP
    tool: str
    action: str
    args: dict[str, Any] = Field(default_factory=dict)
    label: Optional[str] = None


# Union type for all sources
SourceConfig = FetchSource | BraveSource | FileSource | MCPSource


# ============================================================================
# Agent Output Configuration
# ============================================================================

class OutputConfig(BaseModel):
    """Configuration for agent output"""
    title: str = "{agent_name} - {date}"
    template: Optional[str] = None  # Optional template name


class NotifyConfig(BaseModel):
    """Configuration for notifications"""
    enabled: bool = True
    title: str = "Agent Report Ready"
    priority: int = 5


# ============================================================================
# Agent Definition
# ============================================================================

class AgentConfig(BaseModel):
    """Full agent configuration"""
    id: str
    name: str
    description: str = ""
    enabled: bool = True
    schedule: Optional[str] = None  # Cron expression, None = manual only
    sources: list[dict[str, Any]] = Field(default_factory=list)  # Raw source configs
    prompt: str
    output: OutputConfig = Field(default_factory=OutputConfig)
    notify: NotifyConfig = Field(default_factory=NotifyConfig)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class AgentInfo(BaseModel):
    """Agent info for API responses (includes runtime state)"""
    id: str
    name: str
    description: str
    enabled: bool
    schedule: Optional[str]
    source_count: int
    next_run: Optional[datetime] = None
    last_run: Optional[datetime] = None
    last_status: Optional[RunStatus] = None
    total_runs: int = 0


# ============================================================================
# Source Fetch Result
# ============================================================================

class SourceResult(BaseModel):
    """Result of fetching a single source"""
    label: str
    type: SourceType
    status: str  # "ok" or "error"
    content: Optional[str] = None
    chars: int = 0
    error: Optional[str] = None
    fetched_at: datetime = Field(default_factory=datetime.utcnow)


# ============================================================================
# Run Metadata
# ============================================================================

class LLMUsage(BaseModel):
    """LLM usage statistics for a run"""
    model: str
    input_tokens: int = 0
    output_tokens: int = 0


class OutputInfo(BaseModel):
    """Information about the generated output"""
    path: str
    url: str
    chars: int = 0


class RunMeta(BaseModel):
    """Complete metadata for an agent run"""
    run_id: str
    agent_id: str
    agent_name: str
    trigger: TriggerType
    status: RunStatus = RunStatus.PENDING
    started_at: datetime = Field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None
    duration_ms: Optional[int] = None
    sources: list[SourceResult] = Field(default_factory=list)
    llm: Optional[LLMUsage] = None
    output: Optional[OutputInfo] = None
    notification_sent: bool = False
    error: Optional[str] = None

    def generate_run_id() -> str:
        """Generate a unique run ID"""
        now = datetime.utcnow()
        short_uuid = uuid.uuid4().hex[:8]
        return f"{now.strftime('%Y%m%d_%H%M%S')}_{short_uuid}"


class RunSummary(BaseModel):
    """Summary of a run for list views"""
    run_id: str
    agent_id: str
    trigger: TriggerType
    status: RunStatus
    started_at: datetime
    completed_at: Optional[datetime] = None
    duration_ms: Optional[int] = None
    source_count: int = 0
    output_chars: int = 0
    error: Optional[str] = None


# ============================================================================
# API Request/Response Models
# ============================================================================

class CreateAgentRequest(BaseModel):
    """Request to create a new agent"""
    name: str
    description: str = ""
    schedule: Optional[str] = None
    sources: list[dict[str, Any]]
    prompt: str
    output: Optional[OutputConfig] = None
    notify: Optional[NotifyConfig] = None


class UpdateAgentRequest(BaseModel):
    """Request to update an existing agent"""
    name: Optional[str] = None
    description: Optional[str] = None
    enabled: Optional[bool] = None
    schedule: Optional[str] = None
    sources: Optional[list[dict[str, Any]]] = None
    prompt: Optional[str] = None
    output: Optional[OutputConfig] = None
    notify: Optional[NotifyConfig] = None


class TriggerRunRequest(BaseModel):
    """Request to manually trigger an agent run"""
    # Future: could add overrides for sources, prompt, etc.
    pass


class TriggerRunResponse(BaseModel):
    """Response from triggering a run"""
    run_id: str
    agent_id: str
    status: RunStatus
    message: str


class RunDetailResponse(BaseModel):
    """Full details of a run including report content"""
    meta: RunMeta
    report: Optional[str] = None  # Markdown content


class AddToContextRequest(BaseModel):
    """Request to add a report to a conversation as context"""
    conversation_id: str


class AddToContextResponse(BaseModel):
    """Response from adding report to context"""
    success: bool
    message: str
    conversation_id: str
