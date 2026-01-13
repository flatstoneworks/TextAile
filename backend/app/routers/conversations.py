"""Conversation management endpoints"""

import json
from fastapi import APIRouter, HTTPException, UploadFile, File
from fastapi.responses import PlainTextResponse, JSONResponse

from ..models.schemas import (
    Conversation,
    ConversationSummary,
    CreateConversationRequest,
    UpdateConversationRequest,
    Message,
    ExportFormat,
)

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


def get_conversation_store():
    """Get the conversation store instance"""
    from ..main import conversation_store
    return conversation_store


def get_inference_service():
    """Get the inference service instance"""
    from ..main import inference_service
    return inference_service


@router.get("", response_model=list[ConversationSummary])
async def list_conversations():
    """List all conversations"""
    store = get_conversation_store()
    return store.list_all()


@router.post("", response_model=Conversation)
async def create_conversation(request: CreateConversationRequest):
    """Create a new conversation"""
    store = get_conversation_store()
    service = get_inference_service()

    # Use default model if not specified
    model = request.model or service.defaults.get("model", "llama-3.2-3b")

    # Validate model exists
    if not service.get_model_info(model):
        raise HTTPException(status_code=400, detail=f"Unknown model: {model}")

    conversation = Conversation(
        name=request.name,
        model=model,
        system_prompt=request.system_prompt,
    )

    store.save(conversation)
    return conversation


@router.get("/{conversation_id}", response_model=Conversation)
async def get_conversation(conversation_id: str):
    """Get a conversation with all messages"""
    store = get_conversation_store()
    conversation = store.load(conversation_id)

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return conversation


@router.put("/{conversation_id}", response_model=Conversation)
async def update_conversation(conversation_id: str, request: UpdateConversationRequest):
    """Update a conversation (name, system prompt, or model)"""
    store = get_conversation_store()
    conversation = store.load(conversation_id)

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    if request.name is not None:
        conversation.name = request.name

    if request.system_prompt is not None:
        conversation.system_prompt = request.system_prompt

    if request.model is not None:
        service = get_inference_service()
        if not service.get_model_info(request.model):
            raise HTTPException(status_code=400, detail=f"Unknown model: {request.model}")
        conversation.model = request.model

    store.save(conversation)
    return conversation


@router.delete("/{conversation_id}")
async def delete_conversation(conversation_id: str):
    """Delete a conversation"""
    store = get_conversation_store()

    if not store.delete(conversation_id):
        raise HTTPException(status_code=404, detail="Conversation not found")

    return {"status": "deleted", "conversation_id": conversation_id}


@router.post("/{conversation_id}/messages", response_model=Conversation)
async def add_message(conversation_id: str, message: Message):
    """Add a message to a conversation"""
    store = get_conversation_store()
    conversation = store.add_message(conversation_id, message)

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    return conversation


@router.get("/{conversation_id}/export")
async def export_conversation(conversation_id: str, format: ExportFormat = ExportFormat.JSON):
    """Export a conversation in JSON or Markdown format"""
    store = get_conversation_store()
    conversation = store.load(conversation_id)

    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    if format == ExportFormat.MARKDOWN:
        content = store.export_markdown(conversation)
        return PlainTextResponse(
            content=content,
            media_type="text/markdown",
            headers={
                "Content-Disposition": f'attachment; filename="{conversation.name}.md"'
            }
        )
    else:
        # JSON export
        data = {
            "id": conversation.id,
            "name": conversation.name,
            "system_prompt": conversation.system_prompt,
            "model": conversation.model,
            "messages": [
                {
                    "role": m.role,
                    "content": m.content,
                    "created_at": m.created_at.isoformat(),
                    "model": m.model,
                }
                for m in conversation.messages
            ],
            "created_at": conversation.created_at.isoformat(),
            "exported_at": conversation.updated_at.isoformat(),
        }
        return JSONResponse(
            content=data,
            headers={
                "Content-Disposition": f'attachment; filename="{conversation.name}.json"'
            }
        )


@router.post("/import", response_model=Conversation)
async def import_conversation(file: UploadFile = File(...)):
    """Import a conversation from a JSON file"""
    store = get_conversation_store()

    if not file.filename.endswith(".json"):
        raise HTTPException(status_code=400, detail="Only JSON files are supported")

    try:
        content = await file.read()
        data = json.loads(content.decode("utf-8"))
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON file")

    try:
        conversation = store.import_from_json(data)
        store.save(conversation)
        return conversation
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to import: {str(e)}")
