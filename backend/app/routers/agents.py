"""Agent management API endpoints"""

import asyncio
import logging
from fastapi import APIRouter, HTTPException, BackgroundTasks
from typing import Optional

from ..models.agent_schemas import (
    AgentConfig,
    AgentInfo,
    RunMeta,
    RunSummary,
    RunStatus,
    TriggerType,
    CreateAgentRequest,
    UpdateAgentRequest,
    TriggerRunRequest,
    TriggerRunResponse,
    RunDetailResponse,
    AddToContextRequest,
    AddToContextResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/agents", tags=["agents"])


def get_agent_store():
    """Get the agent store instance"""
    from ..main import agent_store
    return agent_store


def get_agent_runner():
    """Get the agent runner instance"""
    from ..main import agent_runner
    return agent_runner


def get_agent_scheduler():
    """Get the agent scheduler instance"""
    from ..main import agent_scheduler
    return agent_scheduler


def get_conversation_store():
    """Get the conversation store instance"""
    from ..main import conversation_store
    return conversation_store


# ============================================================================
# Agent CRUD
# ============================================================================

@router.get("", response_model=list[AgentInfo])
async def list_agents():
    """List all agents with their current status"""
    store = get_agent_store()
    scheduler = get_agent_scheduler()

    # Get next run times from scheduler
    next_runs = scheduler.get_all_next_runs() if scheduler else {}

    return store.list_agents_info(next_runs)


@router.get("/{agent_id}", response_model=AgentInfo)
async def get_agent(agent_id: str):
    """Get details for a specific agent"""
    store = get_agent_store()
    scheduler = get_agent_scheduler()

    next_run = scheduler.get_next_run(agent_id) if scheduler else None
    info = store.get_agent_info(agent_id, next_run)

    if not info:
        raise HTTPException(status_code=404, detail="Agent not found")

    return info


@router.get("/{agent_id}/config", response_model=AgentConfig)
async def get_agent_config(agent_id: str):
    """Get the full configuration for an agent"""
    store = get_agent_store()
    agent = store.get_agent(agent_id)

    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    return agent


@router.post("", response_model=AgentConfig)
async def create_agent(request: CreateAgentRequest):
    """Create a new agent"""
    store = get_agent_store()
    scheduler = get_agent_scheduler()

    agent = store.create_agent(request)

    # Schedule if it has a cron schedule
    if scheduler and agent.schedule:
        scheduler.schedule_agent(agent)

    return agent


@router.put("/{agent_id}", response_model=AgentConfig)
async def update_agent(agent_id: str, request: UpdateAgentRequest):
    """Update an existing agent"""
    store = get_agent_store()
    scheduler = get_agent_scheduler()

    agent = store.update_agent(agent_id, request)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Reschedule if schedule might have changed
    if scheduler:
        scheduler.reschedule_agent(agent)

    return agent


@router.delete("/{agent_id}")
async def delete_agent(agent_id: str):
    """Delete an agent (keeps run history)"""
    store = get_agent_store()
    scheduler = get_agent_scheduler()

    # Unschedule first
    if scheduler:
        scheduler.unschedule_agent(agent_id)

    if not store.delete_agent(agent_id):
        raise HTTPException(status_code=404, detail="Agent not found")

    return {"status": "deleted", "agent_id": agent_id}


# ============================================================================
# Agent Runs
# ============================================================================

@router.post("/{agent_id}/run", response_model=TriggerRunResponse)
async def trigger_run(
    agent_id: str,
    request: TriggerRunRequest,
    background_tasks: BackgroundTasks,
):
    """Manually trigger an agent run"""
    store = get_agent_store()
    runner = get_agent_runner()

    agent = store.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Generate run ID for tracking
    run_id = RunMeta.generate_run_id()

    # Create initial metadata
    meta = RunMeta(
        run_id=run_id,
        agent_id=agent_id,
        agent_name=agent.name,
        trigger=TriggerType.MANUAL,
        status=RunStatus.PENDING,
    )
    store.create_run(meta)

    # Run in background
    async def run_agent():
        try:
            await runner.run_agent(agent_id, TriggerType.MANUAL)
        except Exception as e:
            logger.error(f"Background agent run failed: {e}")
            # Update metadata with error
            meta.status = RunStatus.FAILED
            meta.error = str(e)
            store.save_run_meta(meta)

    background_tasks.add_task(run_agent)

    return TriggerRunResponse(
        run_id=run_id,
        agent_id=agent_id,
        status=RunStatus.PENDING,
        message="Agent run started",
    )


@router.get("/{agent_id}/runs", response_model=list[RunSummary])
async def list_runs(
    agent_id: str,
    limit: int = 50,
    offset: int = 0,
):
    """List runs for an agent"""
    store = get_agent_store()

    agent = store.get_agent(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    return store.list_runs(agent_id, limit=limit, offset=offset)


@router.get("/{agent_id}/runs/{run_id}", response_model=RunDetailResponse)
async def get_run(agent_id: str, run_id: str):
    """Get details for a specific run including report content"""
    store = get_agent_store()

    meta = store.load_run_meta(agent_id, run_id)
    if not meta:
        raise HTTPException(status_code=404, detail="Run not found")

    report = store.load_report(agent_id, run_id)

    return RunDetailResponse(
        meta=meta,
        report=report,
    )


@router.get("/{agent_id}/runs/{run_id}/report")
async def get_report(agent_id: str, run_id: str):
    """Get the raw markdown report"""
    store = get_agent_store()

    report = store.load_report(agent_id, run_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    return {"content": report}


# ============================================================================
# Context Integration
# ============================================================================

@router.post("/{agent_id}/runs/{run_id}/context", response_model=AddToContextResponse)
async def add_to_context(
    agent_id: str,
    run_id: str,
    request: AddToContextRequest,
):
    """Add a report to a conversation as context"""
    store = get_agent_store()
    conv_store = get_conversation_store()

    # Load the report
    report = store.load_report(agent_id, run_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    # Load the conversation
    conversation = conv_store.load(request.conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Add report as a system message for context
    from ..models.schemas import Message

    context_message = Message(
        role="system",
        content=f"[Agent Report Context]\n\n{report}",
    )
    conv_store.add_message(request.conversation_id, context_message)

    return AddToContextResponse(
        success=True,
        message="Report added to conversation context",
        conversation_id=request.conversation_id,
    )


# ============================================================================
# Scheduler Status
# ============================================================================

@router.get("/scheduler/status")
async def get_scheduler_status():
    """Get scheduler status and scheduled jobs"""
    scheduler = get_agent_scheduler()

    if not scheduler:
        return {"running": False, "jobs": []}

    next_runs = scheduler.get_all_next_runs()

    jobs = [
        {
            "agent_id": agent_id,
            "next_run": next_run.isoformat() if next_run else None,
        }
        for agent_id, next_run in next_runs.items()
    ]

    return {
        "running": scheduler._started,
        "jobs": jobs,
    }
