"""TextAile - Local LLM Chat Interface

A ChatGPT/Claude-like experience for running local language models.
"""

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .routers import chat_router, conversations_router, models_router, mcp_router, settings_router, agents_router
from .services import LLMInferenceService, ConversationStore, MCPClientService, AgentStore, AgentRunner, AgentScheduler

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Get the backend directory path
BACKEND_DIR = Path(__file__).parent.parent
CONFIG_PATH = BACKEND_DIR / "config.yaml"
MCP_CONFIG_PATH = BACKEND_DIR / "mcp_config.yaml"
AGENTS_CONFIG_PATH = BACKEND_DIR / "agents.yaml"
DATA_DIR = BACKEND_DIR.parent / "data" / "conversations"
AGENTS_DATA_DIR = BACKEND_DIR.parent / "data" / "agents" / "runs"
SCHEDULER_DB_PATH = BACKEND_DIR.parent / "data" / "agents" / "scheduler.db"

# Global service instances
inference_service: LLMInferenceService = None
conversation_store: ConversationStore = None
mcp_service: MCPClientService = None
agent_store: AgentStore = None
agent_runner: AgentRunner = None
agent_scheduler: AgentScheduler = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    global inference_service, conversation_store, mcp_service
    global agent_store, agent_runner, agent_scheduler

    logger.info("Starting TextAile backend...")

    # Initialize core services
    inference_service = LLMInferenceService(str(CONFIG_PATH))
    conversation_store = ConversationStore(str(DATA_DIR))
    mcp_service = MCPClientService(str(MCP_CONFIG_PATH))

    gpu_available, gpu_name = inference_service.get_gpu_info()
    if gpu_available:
        logger.info(f"GPU available: {gpu_name}")
    else:
        logger.warning("No GPU available, using CPU (will be slow)")

    logger.info(f"MCP servers configured: {len(mcp_service.servers)}")

    # Initialize agent services
    agent_store = AgentStore(str(AGENTS_CONFIG_PATH), str(AGENTS_DATA_DIR))
    logger.info(f"Agents configured: {len(agent_store.agents)}")

    # Create runner (needs all other services)
    agent_runner = AgentRunner(
        store=agent_store,
        inference=inference_service,
        mcp=mcp_service,
        secrets=mcp_service.secrets_store,
    )

    # Create and start scheduler
    agent_scheduler = AgentScheduler(str(SCHEDULER_DB_PATH))
    await agent_scheduler.start()

    # Schedule all enabled agents
    scheduled_count = agent_scheduler.schedule_all_agents(agent_store.list_agents())
    logger.info(f"Scheduled {scheduled_count} agents")

    logger.info("TextAile backend ready!")

    yield

    # Cleanup
    logger.info("Shutting down TextAile backend...")

    # Stop scheduler
    if agent_scheduler:
        await agent_scheduler.stop()

    # Disconnect MCP servers
    if mcp_service:
        await mcp_service.disconnect_all()

    if inference_service and inference_service.model is not None:
        del inference_service.model
        inference_service.model = None


# Create FastAPI app
app = FastAPI(
    title="TextAile",
    description="Local LLM Chat Interface",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(chat_router)
app.include_router(conversations_router)
app.include_router(models_router)
app.include_router(mcp_router)
app.include_router(settings_router)
app.include_router(agents_router)


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "name": "TextAile",
        "version": "1.0.0",
        "description": "Local LLM Chat Interface",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8001,
        reload=True,
    )
