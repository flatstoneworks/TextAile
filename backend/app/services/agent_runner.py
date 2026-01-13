"""Agent Runner Service for TextAile

Executes agents: fetches sources, processes with LLM, saves report, sends notification.
"""

import httpx
import logging
import time
from datetime import datetime
from typing import Optional

from ..models.agent_schemas import (
    AgentConfig,
    RunMeta,
    RunStatus,
    TriggerType,
    SourceType,
    SourceResult,
    LLMUsage,
    OutputInfo,
)
from .agent_store import AgentStore
from .inference import LLMInferenceService
from .mcp_client import MCPClientService
from .secrets_store import SecretsStore

logger = logging.getLogger(__name__)


class AgentRunner:
    """Executes agent runs"""

    def __init__(
        self,
        store: AgentStore,
        inference: LLMInferenceService,
        mcp: MCPClientService,
        secrets: SecretsStore,
        base_url: str = "http://spark.local:5174",
    ):
        self.store = store
        self.inference = inference
        self.mcp = mcp
        self.secrets = secrets
        self.base_url = base_url
        self.default_model = "qwen2.5-7b"  # Default model for agents (no approval required)

    async def run_agent(
        self,
        agent_id: str,
        trigger: TriggerType = TriggerType.MANUAL,
    ) -> RunMeta:
        """
        Execute a full agent run.

        Steps:
        1. Create run metadata
        2. Fetch all sources
        3. Build prompt and call LLM
        4. Save report as markdown
        5. Send notification (if enabled)
        """
        agent = self.store.get_agent(agent_id)
        if not agent:
            raise ValueError(f"Agent not found: {agent_id}")

        # Generate run ID
        run_id = RunMeta.generate_run_id()
        start_time = time.time()

        # Create initial run metadata
        meta = RunMeta(
            run_id=run_id,
            agent_id=agent_id,
            agent_name=agent.name,
            trigger=trigger,
            status=RunStatus.RUNNING,
        )

        # Create run directory
        self.store.create_run(meta)
        logger.info(f"Starting agent run: {agent.name} ({run_id})")

        try:
            # Step 1: Fetch all sources
            source_results = await self._fetch_sources(agent, run_id)
            meta.sources = source_results

            # Check if we got any content
            total_content = sum(r.chars for r in source_results if r.status == "ok")
            if total_content == 0:
                raise RuntimeError("No content fetched from any source")

            # Step 2: Build prompt and generate report
            report_content, llm_usage = await self._generate_report(
                agent, source_results, run_id
            )
            meta.llm = llm_usage

            # Step 3: Save report
            report_path = self.store.save_report(agent_id, run_id, report_content)
            meta.output = OutputInfo(
                path=str(report_path),
                url=f"/agents/{agent_id}/runs/{run_id}",
                chars=len(report_content),
            )

            # Step 4: Send notification
            if agent.notify.enabled:
                notification_sent = await self._send_notification(agent, meta)
                meta.notification_sent = notification_sent

            # Mark as completed
            meta.status = RunStatus.COMPLETED
            meta.completed_at = datetime.utcnow()
            meta.duration_ms = int((time.time() - start_time) * 1000)

            logger.info(
                f"Agent run completed: {agent.name} ({run_id}) "
                f"in {meta.duration_ms}ms, {meta.output.chars} chars"
            )

        except Exception as e:
            logger.error(f"Agent run failed: {agent.name} ({run_id}): {e}")
            meta.status = RunStatus.FAILED
            meta.error = str(e)
            meta.completed_at = datetime.utcnow()
            meta.duration_ms = int((time.time() - start_time) * 1000)

        # Save final metadata
        self.store.save_run_meta(meta)
        return meta

    async def _fetch_sources(
        self,
        agent: AgentConfig,
        run_id: str,
    ) -> list[SourceResult]:
        """Fetch all sources for an agent"""
        results = []

        for i, source_config in enumerate(agent.sources):
            source_type = SourceType(source_config.get("type", "fetch"))
            label = source_config.get("label", f"Source {i + 1}")

            result = SourceResult(
                label=label,
                type=source_type,
                status="pending",
            )

            try:
                content = await self._fetch_single_source(source_config, source_type)
                result.status = "ok"
                result.content = content
                result.chars = len(content) if content else 0

                # Save raw source content
                if content:
                    self.store.save_source(agent.id, run_id, i, content)

                logger.info(f"Fetched source '{label}': {result.chars} chars")

            except Exception as e:
                logger.error(f"Failed to fetch source '{label}': {e}")
                result.status = "error"
                result.error = str(e)

            results.append(result)

        return results

    async def _fetch_single_source(
        self,
        config: dict,
        source_type: SourceType,
    ) -> Optional[str]:
        """Fetch a single source based on its type"""

        if source_type == SourceType.FETCH:
            return await self._fetch_url(config.get("url", ""))

        elif source_type == SourceType.BRAVE:
            return await self._fetch_brave(
                config.get("query", ""),
                config.get("count", 5),
            )

        elif source_type == SourceType.FILE:
            return await self._fetch_file(config.get("path", ""))

        elif source_type == SourceType.MCP:
            return await self._fetch_mcp(
                config.get("tool", ""),
                config.get("action", ""),
                config.get("args", {}),
            )

        else:
            raise ValueError(f"Unknown source type: {source_type}")

    async def _fetch_url(self, url: str) -> str:
        """Fetch URL content via MCP fetch server"""
        if not url:
            raise ValueError("URL is required")

        # Connect to fetch MCP server if not connected
        status = self.mcp.get_connection_status("fetch")
        if status.value != "connected":
            success, error = await self.mcp.connect("fetch")
            if not success:
                raise RuntimeError(f"Cannot connect to fetch MCP server: {error}")

        # Call the fetch tool
        success, result, error = await self.mcp.call_tool("fetch", {"url": url})
        if not success:
            raise RuntimeError(f"Fetch failed: {error}")

        # Extract content from result
        if hasattr(result, "content"):
            # MCP result format
            content_parts = []
            for item in result.content:
                if hasattr(item, "text"):
                    content_parts.append(item.text)
            return "\n".join(content_parts)

        return str(result)

    async def _fetch_brave(self, query: str, count: int) -> str:
        """Search via Brave Search MCP server"""
        if not query:
            raise ValueError("Search query is required")

        # Expand date placeholder
        query = query.replace("{date}", datetime.now().strftime("%Y-%m-%d"))

        # Connect to brave-search MCP server if not connected
        status = self.mcp.get_connection_status("brave-search")
        if status.value != "connected":
            success, error = await self.mcp.connect("brave-search")
            if not success:
                raise RuntimeError(f"Cannot connect to Brave Search: {error}")

        # Call brave_web_search tool
        success, result, error = await self.mcp.call_tool(
            "brave_web_search",
            {"query": query, "count": count},
        )
        if not success:
            raise RuntimeError(f"Brave search failed: {error}")

        # Format results
        if hasattr(result, "content"):
            content_parts = []
            for item in result.content:
                if hasattr(item, "text"):
                    content_parts.append(item.text)
            return "\n".join(content_parts)

        return str(result)

    async def _fetch_file(self, path: str) -> str:
        """Read local file via MCP filesystem server"""
        if not path:
            raise ValueError("File path is required")

        # Connect to filesystem MCP server if not connected
        status = self.mcp.get_connection_status("filesystem")
        if status.value != "connected":
            success, error = await self.mcp.connect("filesystem")
            if not success:
                raise RuntimeError(f"Cannot connect to filesystem: {error}")

        # Call read_file tool
        success, result, error = await self.mcp.call_tool(
            "read_file",
            {"path": path},
        )
        if not success:
            raise RuntimeError(f"File read failed: {error}")

        if hasattr(result, "content"):
            content_parts = []
            for item in result.content:
                if hasattr(item, "text"):
                    content_parts.append(item.text)
            return "\n".join(content_parts)

        return str(result)

    async def _fetch_mcp(self, tool: str, action: str, args: dict) -> str:
        """Execute custom MCP tool call"""
        if not tool or not action:
            raise ValueError("Tool and action are required")

        # Connect to the MCP server
        status = self.mcp.get_connection_status(tool)
        if status.value != "connected":
            success, error = await self.mcp.connect(tool)
            if not success:
                raise RuntimeError(f"Cannot connect to {tool}: {error}")

        # Call the tool
        success, result, error = await self.mcp.call_tool(action, args)
        if not success:
            raise RuntimeError(f"MCP tool {action} failed: {error}")

        if hasattr(result, "content"):
            content_parts = []
            for item in result.content:
                if hasattr(item, "text"):
                    content_parts.append(item.text)
            return "\n".join(content_parts)

        return str(result)

    async def _generate_report(
        self,
        agent: AgentConfig,
        sources: list[SourceResult],
        run_id: str,
    ) -> tuple[str, LLMUsage]:
        """Generate the report using LLM"""

        # Build the prompt with source content
        source_texts = []
        for source in sources:
            if source.status == "ok" and source.content:
                source_texts.append(f"## {source.label}\n\n{source.content}")

        combined_sources = "\n\n---\n\n".join(source_texts)

        system_prompt = """You are a helpful assistant that creates well-formatted markdown reports.
Follow the user's instructions carefully and format your output as clean, readable markdown.
Include appropriate headings, bullet points, and formatting."""

        user_prompt = f"""{agent.prompt}

---

Here is the source content to analyze:

{combined_sources}"""

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        # Estimate input tokens (rough approximation)
        input_chars = len(system_prompt) + len(user_prompt)
        input_tokens_estimate = input_chars // 4

        # Generate with LLM
        model_id = self.default_model
        try:
            response = self.inference.generate_sync(
                messages=messages,
                model_id=model_id,
                temperature=0.7,
                max_tokens=4096,
            )
        except Exception as e:
            error_msg = str(e)
            # Check for gated model error
            if "gated repo" in error_msg.lower() or "403" in error_msg:
                model_info = self.inference.get_model_info(model_id)
                approval_url = model_info.get("approval_url") if model_info else None
                if not approval_url:
                    # Construct URL from model path
                    model_path = model_info.get("path") if model_info else model_id
                    approval_url = f"https://huggingface.co/{model_path}"
                raise RuntimeError(
                    f"Model '{model_id}' requires approval. "
                    f"Request access at: {approval_url}"
                ) from e
            raise

        # Build the final report with frontmatter
        date_str = datetime.now().strftime("%B %d, %Y")
        title = agent.output.title.format(
            agent_name=agent.name,
            date=date_str,
        )

        source_labels = [s.label for s in sources if s.status == "ok"]

        report = f"""---
title: "{title}"
agent: {agent.id}
run_id: {run_id}
generated: {datetime.utcnow().isoformat()}Z
sources:
{chr(10).join(f'  - {label}' for label in source_labels)}
---

# {title}

{response}

---
*Generated by TextAile Agent: {agent.name}*
"""

        # Output tokens estimate
        output_tokens_estimate = len(response) // 4

        llm_usage = LLMUsage(
            model=model_id,
            input_tokens=input_tokens_estimate,
            output_tokens=output_tokens_estimate,
        )

        return report, llm_usage

    async def _send_notification(
        self,
        agent: AgentConfig,
        meta: RunMeta,
    ) -> bool:
        """Send Gotify notification"""
        gotify_url = self.secrets.get("GOTIFY_URL")
        gotify_token = self.secrets.get("GOTIFY_TOKEN")

        if not gotify_url or not gotify_token:
            logger.warning("Gotify not configured, skipping notification")
            return False

        try:
            # Build notification message
            report_url = f"{self.base_url}{meta.output.url}"
            message = f"Report ready: {report_url}"

            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    f"{gotify_url}/message",
                    params={"token": gotify_token},
                    data={
                        "title": agent.notify.title,
                        "message": message,
                        "priority": agent.notify.priority,
                    },
                )

                if response.status_code == 200:
                    logger.info(f"Notification sent for {agent.name}")
                    return True
                else:
                    logger.error(f"Notification failed: {response.status_code}")
                    return False

        except Exception as e:
            logger.error(f"Failed to send notification: {e}")
            return False
