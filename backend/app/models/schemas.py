"""Pydantic models for TextAile API"""

from datetime import datetime
from enum import Enum
from typing import Literal
from pydantic import BaseModel, Field
import uuid


def generate_id() -> str:
    """Generate a unique ID"""
    return str(uuid.uuid4())[:8]


class Message(BaseModel):
    """A single message in a conversation"""
    id: str = Field(default_factory=generate_id)
    role: Literal["system", "user", "assistant"]
    content: str
    created_at: datetime = Field(default_factory=datetime.now)
    model: str | None = None  # Which model generated this (for assistant messages)


class Conversation(BaseModel):
    """A full conversation with messages"""
    id: str = Field(default_factory=generate_id)
    name: str
    system_prompt: str | None = None
    messages: list[Message] = Field(default_factory=list)
    model: str  # Default model for this conversation
    created_at: datetime = Field(default_factory=datetime.now)
    updated_at: datetime = Field(default_factory=datetime.now)


class ConversationSummary(BaseModel):
    """Summary of a conversation (without full messages)"""
    id: str
    name: str
    system_prompt: str | None = None
    model: str
    message_count: int
    created_at: datetime
    updated_at: datetime
    preview: str | None = None  # First user message preview


class CreateConversationRequest(BaseModel):
    """Request to create a new conversation"""
    name: str = "New Chat"
    model: str | None = None  # Use default if not specified
    system_prompt: str | None = None


class UpdateConversationRequest(BaseModel):
    """Request to update a conversation"""
    name: str | None = None
    system_prompt: str | None = None
    model: str | None = None


class ChatRequest(BaseModel):
    """Request to send a chat message"""
    conversation_id: str
    message: str = Field(min_length=1, max_length=100000)
    model: str | None = None  # Override conversation default
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    top_p: float = Field(default=0.9, ge=0.0, le=1.0)
    max_tokens: int = Field(default=2048, ge=1, le=32768)


class ChatResponse(BaseModel):
    """Response from a non-streaming chat request"""
    message: Message
    conversation_id: str


class StreamEventType(str, Enum):
    """Types of streaming events"""
    TOKEN = "token"
    DONE = "done"
    ERROR = "error"
    START = "start"


class StreamEvent(BaseModel):
    """A streaming event sent via SSE"""
    type: StreamEventType
    content: str | None = None
    message_id: str | None = None
    error: str | None = None


class ModelInfo(BaseModel):
    """Basic model information"""
    id: str
    name: str
    path: str
    category: str
    size_gb: float
    context_length: int
    description: str
    tags: list[str] = Field(default_factory=list)
    requires_approval: bool = False
    approval_url: str | None = None


class ModelDetailedInfo(ModelInfo):
    """Model info with cache details"""
    is_cached: bool = False
    cache_size_gb: float | None = None
    last_accessed: datetime | None = None


class HealthResponse(BaseModel):
    """Health check response"""
    status: str = "ok"
    gpu_available: bool
    gpu_name: str | None = None
    current_model: str | None = None
    version: str = "1.0.0"


class ExportFormat(str, Enum):
    """Export format options"""
    JSON = "json"
    MARKDOWN = "markdown"
