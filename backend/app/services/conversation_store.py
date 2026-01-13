"""Conversation persistence service"""

import json
import os
from datetime import datetime
from pathlib import Path
from typing import Optional

from ..models.schemas import Conversation, ConversationSummary, Message


class ConversationStore:
    """Manages conversation persistence using JSON files"""

    def __init__(self, data_dir: str = "data/conversations"):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)

    def _get_path(self, conversation_id: str) -> Path:
        """Get the file path for a conversation"""
        return self.data_dir / f"{conversation_id}.json"

    def _serialize(self, conversation: Conversation) -> dict:
        """Serialize a conversation to dict"""
        return {
            "id": conversation.id,
            "name": conversation.name,
            "system_prompt": conversation.system_prompt,
            "model": conversation.model,
            "messages": [
                {
                    "id": m.id,
                    "role": m.role,
                    "content": m.content,
                    "created_at": m.created_at.isoformat(),
                    "model": m.model,
                }
                for m in conversation.messages
            ],
            "created_at": conversation.created_at.isoformat(),
            "updated_at": conversation.updated_at.isoformat(),
        }

    def _deserialize(self, data: dict) -> Conversation:
        """Deserialize a conversation from dict"""
        return Conversation(
            id=data["id"],
            name=data["name"],
            system_prompt=data.get("system_prompt"),
            model=data["model"],
            messages=[
                Message(
                    id=m["id"],
                    role=m["role"],
                    content=m["content"],
                    created_at=datetime.fromisoformat(m["created_at"]),
                    model=m.get("model"),
                )
                for m in data.get("messages", [])
            ],
            created_at=datetime.fromisoformat(data["created_at"]),
            updated_at=datetime.fromisoformat(data["updated_at"]),
        )

    def save(self, conversation: Conversation) -> None:
        """Save a conversation to disk"""
        conversation.updated_at = datetime.now()
        path = self._get_path(conversation.id)
        with open(path, "w") as f:
            json.dump(self._serialize(conversation), f, indent=2)

    def load(self, conversation_id: str) -> Optional[Conversation]:
        """Load a conversation from disk"""
        path = self._get_path(conversation_id)
        if not path.exists():
            return None
        try:
            with open(path, "r") as f:
                data = json.load(f)
            return self._deserialize(data)
        except (json.JSONDecodeError, KeyError, ValueError):
            return None

    def delete(self, conversation_id: str) -> bool:
        """Delete a conversation"""
        path = self._get_path(conversation_id)
        if path.exists():
            path.unlink()
            return True
        return False

    def list_all(self) -> list[ConversationSummary]:
        """List all conversations as summaries"""
        summaries = []
        for path in self.data_dir.glob("*.json"):
            try:
                with open(path, "r") as f:
                    data = json.load(f)

                # Get preview from first user message
                preview = None
                messages = data.get("messages", [])
                for m in messages:
                    if m["role"] == "user":
                        preview = m["content"][:100]
                        if len(m["content"]) > 100:
                            preview += "..."
                        break

                summaries.append(ConversationSummary(
                    id=data["id"],
                    name=data["name"],
                    system_prompt=data.get("system_prompt"),
                    model=data["model"],
                    message_count=len(messages),
                    created_at=datetime.fromisoformat(data["created_at"]),
                    updated_at=datetime.fromisoformat(data["updated_at"]),
                    preview=preview,
                ))
            except (json.JSONDecodeError, KeyError, ValueError):
                continue

        # Sort by updated_at descending
        summaries.sort(key=lambda x: x.updated_at, reverse=True)
        return summaries

    def add_message(self, conversation_id: str, message: Message) -> Optional[Conversation]:
        """Add a message to a conversation"""
        conversation = self.load(conversation_id)
        if conversation is None:
            return None
        conversation.messages.append(message)
        self.save(conversation)
        return conversation

    def export_markdown(self, conversation: Conversation) -> str:
        """Export conversation to Markdown format"""
        lines = [f"# {conversation.name}", ""]

        if conversation.system_prompt:
            lines.extend([
                "## System Prompt",
                "",
                conversation.system_prompt,
                "",
            ])

        lines.extend(["## Conversation", ""])

        for msg in conversation.messages:
            if msg.role == "system":
                continue
            role_display = "**User:**" if msg.role == "user" else "**Assistant:**"
            lines.extend([
                role_display,
                "",
                msg.content,
                "",
            ])

        lines.extend([
            "---",
            f"*Exported from TextAile on {datetime.now().strftime('%Y-%m-%d %H:%M')}*",
            f"*Model: {conversation.model}*",
        ])

        return "\n".join(lines)

    def import_from_json(self, data: dict) -> Conversation:
        """Import a conversation from JSON export"""
        # Handle both our format and generic chat formats
        if "messages" in data and "id" in data:
            # Our format
            return self._deserialize(data)

        # Generic format with just messages
        messages = []
        for m in data.get("messages", []):
            messages.append(Message(
                role=m.get("role", "user"),
                content=m.get("content", ""),
                created_at=datetime.now(),
            ))

        return Conversation(
            name=data.get("name", data.get("title", "Imported Chat")),
            model=data.get("model", "llama-3.2-3b"),
            system_prompt=data.get("system_prompt"),
            messages=messages,
        )
