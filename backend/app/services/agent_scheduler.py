"""Agent Scheduler Service for TextAile

Uses APScheduler for scheduled agent execution with SQLite persistence.
"""

import asyncio
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional, Callable, Awaitable

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.jobstores.memory import MemoryJobStore

from ..models.agent_schemas import AgentConfig, TriggerType

logger = logging.getLogger(__name__)


# Module-level function for job execution (can't use lambdas/closures with jobstores)
async def _execute_scheduled_agent(agent_id: str):
    """Execute a scheduled agent run - called by APScheduler"""
    # Import here to avoid circular imports
    from ..main import agent_runner
    from ..models.agent_schemas import TriggerType

    logger.info(f"Scheduled job triggered for agent: {agent_id}")

    if agent_runner:
        try:
            await agent_runner.run_agent(agent_id, TriggerType.SCHEDULED)
        except Exception as e:
            logger.error(f"Scheduled agent run failed for {agent_id}: {e}")
    else:
        logger.warning("Agent runner not available for scheduled job")


class AgentScheduler:
    """Manages scheduled agent execution"""

    def __init__(
        self,
        db_path: str,
        run_callback: Optional[Callable[[str, TriggerType], Awaitable]] = None,
    ):
        """
        Initialize the scheduler.

        Args:
            db_path: Path to SQLite database for job persistence (currently unused, using memory store)
            run_callback: Deprecated - using module-level function instead
        """
        self.db_path = Path(db_path)
        self.scheduler: Optional[AsyncIOScheduler] = None
        self._started = False

        # Ensure parent directory exists
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

    def _create_scheduler(self) -> AsyncIOScheduler:
        """Create the APScheduler instance with memory job store"""
        # Using MemoryJobStore - jobs are re-scheduled on startup from agents.yaml
        # This avoids pickling issues with SQLAlchemyJobStore
        jobstores = {
            "default": MemoryJobStore()
        }

        job_defaults = {
            "coalesce": True,  # Combine multiple missed runs into one
            "max_instances": 3,  # Allow concurrent runs
            "misfire_grace_time": 60 * 60,  # 1 hour grace for missed jobs
        }

        return AsyncIOScheduler(
            jobstores=jobstores,
            job_defaults=job_defaults,
            timezone="UTC",
        )

    async def start(self) -> None:
        """Start the scheduler"""
        if self._started:
            return

        self.scheduler = self._create_scheduler()
        self.scheduler.start()
        self._started = True
        logger.info("Agent scheduler started")

    async def stop(self) -> None:
        """Stop the scheduler"""
        if self.scheduler and self._started:
            self.scheduler.shutdown(wait=False)
            self._started = False
            logger.info("Agent scheduler stopped")

    def schedule_agent(self, agent: AgentConfig) -> bool:
        """
        Schedule an agent based on its cron expression.

        Returns True if scheduled, False if no schedule configured.
        """
        if not self.scheduler or not self._started:
            logger.warning("Scheduler not started, cannot schedule agent")
            return False

        if not agent.schedule:
            logger.debug(f"Agent {agent.id} has no schedule")
            return False

        if not agent.enabled:
            logger.debug(f"Agent {agent.id} is disabled, not scheduling")
            return False

        job_id = f"agent_{agent.id}"

        # Remove existing job if present
        existing = self.scheduler.get_job(job_id)
        if existing:
            self.scheduler.remove_job(job_id)
            logger.debug(f"Removed existing job for {agent.id}")

        try:
            # Parse cron expression
            trigger = CronTrigger.from_crontab(agent.schedule)

            # Add job using module-level function
            self.scheduler.add_job(
                _execute_scheduled_agent,
                trigger=trigger,
                id=job_id,
                name=f"Agent: {agent.name}",
                args=[agent.id],
                replace_existing=True,
            )

            next_run = self.get_next_run(agent.id)
            logger.info(
                f"Scheduled agent {agent.name} ({agent.schedule}), "
                f"next run: {next_run}"
            )
            return True

        except Exception as e:
            logger.error(f"Failed to schedule agent {agent.id}: {e}")
            return False

    def unschedule_agent(self, agent_id: str) -> bool:
        """Remove an agent from the schedule"""
        if not self.scheduler:
            return False

        job_id = f"agent_{agent_id}"
        job = self.scheduler.get_job(job_id)

        if job:
            self.scheduler.remove_job(job_id)
            logger.info(f"Unscheduled agent {agent_id}")
            return True

        return False

    def reschedule_agent(self, agent: AgentConfig) -> bool:
        """Update an agent's schedule (unschedule + schedule)"""
        self.unschedule_agent(agent.id)

        if agent.enabled and agent.schedule:
            return self.schedule_agent(agent)

        return True

    def get_next_run(self, agent_id: str) -> Optional[datetime]:
        """Get the next scheduled run time for an agent"""
        if not self.scheduler:
            return None

        job_id = f"agent_{agent_id}"
        job = self.scheduler.get_job(job_id)

        if job and job.next_run_time:
            return job.next_run_time

        return None

    def get_all_next_runs(self) -> dict[str, datetime]:
        """Get next run times for all scheduled agents"""
        if not self.scheduler:
            return {}

        result = {}
        for job in self.scheduler.get_jobs():
            if job.id.startswith("agent_") and job.next_run_time:
                agent_id = job.id.replace("agent_", "")
                result[agent_id] = job.next_run_time

        return result

    def is_scheduled(self, agent_id: str) -> bool:
        """Check if an agent is scheduled"""
        if not self.scheduler:
            return False

        job_id = f"agent_{agent_id}"
        return self.scheduler.get_job(job_id) is not None

    def schedule_all_agents(self, agents: list[AgentConfig]) -> int:
        """Schedule all enabled agents with schedules. Returns count scheduled."""
        scheduled = 0
        for agent in agents:
            if agent.enabled and agent.schedule:
                if self.schedule_agent(agent):
                    scheduled += 1
        return scheduled
