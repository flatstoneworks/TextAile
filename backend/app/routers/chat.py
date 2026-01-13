"""Chat and streaming endpoints"""

import json
import logging
from datetime import datetime
from fastapi import APIRouter, HTTPException, Request
from sse_starlette.sse import EventSourceResponse

from ..models.schemas import (
    ChatRequest,
    ChatResponse,
    Message,
    StreamEventType,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["chat"])


def get_inference_service():
    """Get the inference service instance"""
    from ..main import inference_service
    return inference_service


def get_conversation_store():
    """Get the conversation store instance"""
    from ..main import conversation_store
    return conversation_store


@router.post("", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Non-streaming chat completion"""
    store = get_conversation_store()
    service = get_inference_service()

    # Load conversation
    conversation = store.load(request.conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Use request model or conversation default
    model_id = request.model or conversation.model

    # Validate model
    if not service.get_model_info(model_id):
        raise HTTPException(status_code=400, detail=f"Unknown model: {model_id}")

    # Build messages list for the LLM
    messages = []

    # Add system prompt if present
    system_prompt = conversation.system_prompt or service.defaults.get("system_prompt")
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})

    # Add conversation history
    for msg in conversation.messages:
        if msg.role != "system":
            messages.append({"role": msg.role, "content": msg.content})

    # Add the new user message
    messages.append({"role": "user", "content": request.message})

    # Save user message to conversation
    user_message = Message(role="user", content=request.message)
    store.add_message(request.conversation_id, user_message)

    try:
        # Generate response
        response_text = service.generate_sync(
            messages=messages,
            model_id=model_id,
            temperature=request.temperature,
            top_p=request.top_p,
            max_tokens=request.max_tokens,
        )

        # Create and save assistant message
        assistant_message = Message(
            role="assistant",
            content=response_text,
            model=model_id,
        )
        store.add_message(request.conversation_id, assistant_message)

        return ChatResponse(
            message=assistant_message,
            conversation_id=request.conversation_id,
        )

    except Exception as e:
        logger.error(f"Chat error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stream")
async def chat_stream(
    request: Request,
    conversation_id: str,
    message: str,
    model: str = None,
    temperature: float = 0.7,
    top_p: float = 0.9,
    max_tokens: int = 2048,
):
    """Streaming chat completion via SSE"""
    store = get_conversation_store()
    service = get_inference_service()

    # Load conversation
    conversation = store.load(conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Use request model or conversation default
    model_id = model or conversation.model

    # Validate model
    if not service.get_model_info(model_id):
        raise HTTPException(status_code=400, detail=f"Unknown model: {model_id}")

    # Build messages list
    messages = []

    system_prompt = conversation.system_prompt or service.defaults.get("system_prompt")
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})

    for msg in conversation.messages:
        if msg.role != "system":
            messages.append({"role": msg.role, "content": msg.content})

    messages.append({"role": "user", "content": message})

    # Save user message
    user_message = Message(role="user", content=message)
    store.add_message(conversation_id, user_message)

    # Create assistant message placeholder
    assistant_message = Message(role="assistant", content="", model=model_id)

    async def event_generator():
        full_response = ""

        try:
            # Send start event
            yield {
                "event": "message",
                "data": json.dumps({
                    "type": StreamEventType.START.value,
                    "message_id": assistant_message.id,
                })
            }

            # Stream tokens
            async for token in service.generate_stream(
                messages=messages,
                model_id=model_id,
                temperature=temperature,
                top_p=top_p,
                max_tokens=max_tokens,
            ):
                # Check if client disconnected
                if await request.is_disconnected():
                    logger.info("Client disconnected, stopping generation")
                    service.stop_generation()
                    break

                full_response += token
                yield {
                    "event": "message",
                    "data": json.dumps({
                        "type": StreamEventType.TOKEN.value,
                        "content": token,
                    })
                }

            # Save the complete response
            assistant_message.content = full_response
            store.add_message(conversation_id, assistant_message)

            # Send done event
            yield {
                "event": "message",
                "data": json.dumps({
                    "type": StreamEventType.DONE.value,
                    "message_id": assistant_message.id,
                })
            }

        except Exception as e:
            logger.error(f"Streaming error: {e}")
            yield {
                "event": "message",
                "data": json.dumps({
                    "type": StreamEventType.ERROR.value,
                    "error": str(e),
                })
            }

    return EventSourceResponse(event_generator())


@router.post("/stop")
async def stop_generation():
    """Stop ongoing generation"""
    service = get_inference_service()
    service.stop_generation()
    return {"status": "stopped"}
