"""Agent Store Service for TextAile

Manages agent configurations and run persistence.
"""

import json
import yaml
import logging
from pathlib import Path
from datetime import datetime
from typing import Optional

from ..models.agent_schemas import (
    AgentConfig,
    AgentInfo,
    RunMeta,
    RunSummary,
    RunStatus,
    OutputConfig,
    NotifyConfig,
    CreateAgentRequest,
    UpdateAgentRequest,
)

logger = logging.getLogger(__name__)


class AgentStore:
    """Manages agent configurations and run data"""

    def __init__(self, config_path: str, data_dir: str):
        """
        Initialize the agent store.

        Args:
            config_path: Path to agents.yaml configuration file
            data_dir: Base directory for agent run data (data/agents/runs/)
        """
        self.config_path = Path(config_path)
        self.data_dir = Path(data_dir)
        self.agents: dict[str, AgentConfig] = {}

        # Ensure directories exist
        self.data_dir.mkdir(parents=True, exist_ok=True)

        # Load configurations
        self._load_config()

    def _load_config(self) -> None:
        """Load agent configurations from YAML"""
        if not self.config_path.exists():
            logger.info(f"No agents config found at {self.config_path}, starting fresh")
            return

        try:
            with open(self.config_path) as f:
                config = yaml.safe_load(f) or {}

            for agent_id, agent_data in config.get("agents", {}).items():
                # Parse output config
                output_data = agent_data.get("output", {})
                output = OutputConfig(
                    title=output_data.get("title", "{agent_name} - {date}"),
                    template=output_data.get("template"),
                )

                # Parse notify config
                notify_data = agent_data.get("notify", {})
                notify = NotifyConfig(
                    enabled=notify_data.get("enabled", True),
                    title=notify_data.get("title", "Agent Report Ready"),
                    priority=notify_data.get("priority", 5),
                )

                self.agents[agent_id] = AgentConfig(
                    id=agent_id,
                    name=agent_data.get("name", agent_id),
                    description=agent_data.get("description", ""),
                    enabled=agent_data.get("enabled", True),
                    schedule=agent_data.get("schedule"),
                    sources=agent_data.get("sources", []),
                    prompt=agent_data.get("prompt", ""),
                    output=output,
                    notify=notify,
                )

            logger.info(f"Loaded {len(self.agents)} agent configurations")

        except Exception as e:
            logger.error(f"Failed to load agents config: {e}")

    def _save_config(self) -> None:
        """Save agent configurations to YAML"""
        try:
            config = {"agents": {}}

            for agent_id, agent in self.agents.items():
                config["agents"][agent_id] = {
                    "name": agent.name,
                    "description": agent.description,
                    "enabled": agent.enabled,
                    "schedule": agent.schedule,
                    "sources": agent.sources,
                    "prompt": agent.prompt,
                    "output": {
                        "title": agent.output.title,
                        "template": agent.output.template,
                    },
                    "notify": {
                        "enabled": agent.notify.enabled,
                        "title": agent.notify.title,
                        "priority": agent.notify.priority,
                    },
                }

            # Ensure parent directory exists
            self.config_path.parent.mkdir(parents=True, exist_ok=True)

            with open(self.config_path, "w") as f:
                yaml.dump(config, f, default_flow_style=False, sort_keys=False)

            logger.info(f"Saved {len(self.agents)} agent configurations")

        except Exception as e:
            logger.error(f"Failed to save agents config: {e}")
            raise

    # =========================================================================
    # Agent CRUD Operations
    # =========================================================================

    def list_agents(self) -> list[AgentConfig]:
        """Get all agent configurations"""
        return list(self.agents.values())

    def get_agent(self, agent_id: str) -> Optional[AgentConfig]:
        """Get a specific agent configuration"""
        return self.agents.get(agent_id)

    def create_agent(self, request: CreateAgentRequest) -> AgentConfig:
        """Create a new agent"""
        # Generate ID from name
        agent_id = request.name.lower().replace(" ", "-")
        base_id = agent_id
        counter = 1
        while agent_id in self.agents:
            agent_id = f"{base_id}-{counter}"
            counter += 1

        agent = AgentConfig(
            id=agent_id,
            name=request.name,
            description=request.description,
            enabled=True,
            schedule=request.schedule,
            sources=request.sources,
            prompt=request.prompt,
            output=request.output or OutputConfig(),
            notify=request.notify or NotifyConfig(),
        )

        self.agents[agent_id] = agent
        self._save_config()

        # Create run directory
        (self.data_dir / agent_id).mkdir(parents=True, exist_ok=True)

        return agent

    def update_agent(self, agent_id: str, request: UpdateAgentRequest) -> Optional[AgentConfig]:
        """Update an existing agent"""
        agent = self.agents.get(agent_id)
        if not agent:
            return None

        # Update fields if provided
        if request.name is not None:
            agent.name = request.name
        if request.description is not None:
            agent.description = request.description
        if request.enabled is not None:
            agent.enabled = request.enabled
        if request.schedule is not None:
            agent.schedule = request.schedule
        if request.sources is not None:
            agent.sources = request.sources
        if request.prompt is not None:
            agent.prompt = request.prompt
        if request.output is not None:
            agent.output = request.output
        if request.notify is not None:
            agent.notify = request.notify

        agent.updated_at = datetime.utcnow()
        self._save_config()

        return agent

    def delete_agent(self, agent_id: str) -> bool:
        """Delete an agent (keeps run history)"""
        if agent_id not in self.agents:
            return False

        del self.agents[agent_id]
        self._save_config()
        return True

    # =========================================================================
    # Agent Info (with runtime state)
    # =========================================================================

    def get_agent_info(self, agent_id: str, next_run: Optional[datetime] = None) -> Optional[AgentInfo]:
        """Get agent info including runtime state"""
        agent = self.agents.get(agent_id)
        if not agent:
            return None

        # Get last run info
        runs = self.list_runs(agent_id, limit=1)
        last_run = runs[0] if runs else None

        return AgentInfo(
            id=agent.id,
            name=agent.name,
            description=agent.description,
            enabled=agent.enabled,
            schedule=agent.schedule,
            source_count=len(agent.sources),
            next_run=next_run,
            last_run=last_run.started_at if last_run else None,
            last_status=last_run.status if last_run else None,
            total_runs=self.count_runs(agent_id),
        )

    def list_agents_info(self, next_runs: dict[str, datetime] = None) -> list[AgentInfo]:
        """Get info for all agents"""
        next_runs = next_runs or {}
        return [
            self.get_agent_info(agent_id, next_runs.get(agent_id))
            for agent_id in self.agents
        ]

    # =========================================================================
    # Run Management
    # =========================================================================

    def _get_run_dir(self, agent_id: str, run_id: str) -> Path:
        """Get the directory for a specific run"""
        return self.data_dir / agent_id / run_id

    def create_run(self, meta: RunMeta) -> Path:
        """Create a new run directory and save initial metadata"""
        run_dir = self._get_run_dir(meta.agent_id, meta.run_id)
        run_dir.mkdir(parents=True, exist_ok=True)

        # Save metadata
        self.save_run_meta(meta)

        return run_dir

    def save_run_meta(self, meta: RunMeta) -> None:
        """Save run metadata"""
        run_dir = self._get_run_dir(meta.agent_id, meta.run_id)
        run_dir.mkdir(parents=True, exist_ok=True)

        meta_path = run_dir / "meta.json"
        with open(meta_path, "w") as f:
            json.dump(meta.model_dump(mode="json"), f, indent=2, default=str)

    def load_run_meta(self, agent_id: str, run_id: str) -> Optional[RunMeta]:
        """Load run metadata"""
        meta_path = self._get_run_dir(agent_id, run_id) / "meta.json"
        if not meta_path.exists():
            return None

        try:
            with open(meta_path) as f:
                data = json.load(f)
            return RunMeta(**data)
        except Exception as e:
            logger.error(f"Failed to load run meta {agent_id}/{run_id}: {e}")
            return None

    def save_report(self, agent_id: str, run_id: str, content: str) -> Path:
        """Save the report markdown"""
        run_dir = self._get_run_dir(agent_id, run_id)
        run_dir.mkdir(parents=True, exist_ok=True)

        report_path = run_dir / "report.md"
        with open(report_path, "w") as f:
            f.write(content)

        return report_path

    def load_report(self, agent_id: str, run_id: str) -> Optional[str]:
        """Load the report markdown"""
        report_path = self._get_run_dir(agent_id, run_id) / "report.md"
        if not report_path.exists():
            return None

        with open(report_path) as f:
            return f.read()

    def save_source(self, agent_id: str, run_id: str, index: int, content: str) -> Path:
        """Save raw source content"""
        sources_dir = self._get_run_dir(agent_id, run_id) / "sources"
        sources_dir.mkdir(parents=True, exist_ok=True)

        source_path = sources_dir / f"source_{index}.md"
        with open(source_path, "w") as f:
            f.write(content)

        return source_path

    def list_runs(self, agent_id: str, limit: int = 50, offset: int = 0) -> list[RunSummary]:
        """List runs for an agent, most recent first"""
        agent_dir = self.data_dir / agent_id
        if not agent_dir.exists():
            return []

        # Get all run directories (sorted by name descending = newest first)
        run_dirs = sorted(
            [d for d in agent_dir.iterdir() if d.is_dir()],
            key=lambda d: d.name,
            reverse=True,
        )

        # Apply pagination
        run_dirs = run_dirs[offset:offset + limit]

        summaries = []
        for run_dir in run_dirs:
            meta = self.load_run_meta(agent_id, run_dir.name)
            if meta:
                summaries.append(RunSummary(
                    run_id=meta.run_id,
                    agent_id=meta.agent_id,
                    trigger=meta.trigger,
                    status=meta.status,
                    started_at=meta.started_at,
                    completed_at=meta.completed_at,
                    duration_ms=meta.duration_ms,
                    source_count=len(meta.sources),
                    output_chars=meta.output.chars if meta.output else 0,
                    error=meta.error,
                ))

        return summaries

    def count_runs(self, agent_id: str) -> int:
        """Count total runs for an agent"""
        agent_dir = self.data_dir / agent_id
        if not agent_dir.exists():
            return 0
        return len([d for d in agent_dir.iterdir() if d.is_dir()])

    def get_last_run(self, agent_id: str) -> Optional[RunMeta]:
        """Get the most recent run for an agent"""
        runs = self.list_runs(agent_id, limit=1)
        if not runs:
            return None
        return self.load_run_meta(agent_id, runs[0].run_id)
