"""Settings and notification configuration endpoints"""

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

router = APIRouter(prefix="/api/settings", tags=["settings"])


def get_secrets_store():
    """Get the secrets store instance"""
    from ..main import mcp_service
    return mcp_service.secrets_store


class NotificationConfig(BaseModel):
    """Notification configuration"""
    gotify_url: Optional[str] = None
    gotify_token: Optional[str] = None
    gotify_configured: bool = False


class NotificationConfigUpdate(BaseModel):
    """Request to update notification config"""
    gotify_url: str
    gotify_token: str


class TestNotificationRequest(BaseModel):
    """Request to send test notification"""
    title: str = "Test Notification"
    message: str = "TextAile notifications are working"


class NotificationResponse(BaseModel):
    """Response from notification operations"""
    success: bool
    message: Optional[str] = None


@router.get("/notifications", response_model=NotificationConfig)
async def get_notification_config():
    """Get current notification configuration"""
    store = get_secrets_store()

    gotify_url = store.get("GOTIFY_URL")
    gotify_token = store.get("GOTIFY_TOKEN")

    return NotificationConfig(
        gotify_url=gotify_url,
        gotify_token="••••••••" if gotify_token else None,
        gotify_configured=bool(gotify_url and gotify_token),
    )


@router.post("/notifications", response_model=NotificationResponse)
async def update_notification_config(config: NotificationConfigUpdate):
    """Update notification configuration"""
    store = get_secrets_store()

    if not config.gotify_url or not config.gotify_token:
        raise HTTPException(status_code=400, detail="URL and token are required")

    # Normalize URL (remove trailing slash)
    gotify_url = config.gotify_url.rstrip("/")

    # Test the connection
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{gotify_url}/health")
            if response.status_code != 200:
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot connect to Gotify server: {response.status_code}"
                )
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot connect to Gotify server: {str(e)}"
        )

    # Save configuration
    store.set("GOTIFY_URL", gotify_url)
    store.set("GOTIFY_TOKEN", config.gotify_token)

    return NotificationResponse(
        success=True,
        message="Notification settings saved successfully",
    )


@router.delete("/notifications", response_model=NotificationResponse)
async def delete_notification_config():
    """Delete notification configuration"""
    store = get_secrets_store()

    store.delete("GOTIFY_URL")
    store.delete("GOTIFY_TOKEN")

    return NotificationResponse(
        success=True,
        message="Notification settings removed",
    )


@router.post("/notifications/test", response_model=NotificationResponse)
async def test_notification(request: TestNotificationRequest):
    """Send a test notification"""
    store = get_secrets_store()

    gotify_url = store.get("GOTIFY_URL")
    gotify_token = store.get("GOTIFY_TOKEN")

    if not gotify_url or not gotify_token:
        raise HTTPException(
            status_code=400,
            detail="Notifications not configured. Set Gotify URL and token first."
        )

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                f"{gotify_url}/message",
                params={"token": gotify_token},
                data={
                    "title": request.title,
                    "message": request.message,
                    "priority": 5,
                },
            )

            if response.status_code != 200:
                raise HTTPException(
                    status_code=400,
                    detail=f"Failed to send notification: {response.text}"
                )

    except httpx.RequestError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to send notification: {str(e)}"
        )

    return NotificationResponse(
        success=True,
        message="Test notification sent",
    )
