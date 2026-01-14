# CLAUDE.md

This file provides guidance to Claude Code when working with TextAile.

## Communication Guidelines

- **URLs must be clickable**: Always format URLs so they are clickable (no trailing punctuation like periods or commas immediately after the URL)
  - Good: "View at http://spark.local:8040"
  - Bad: "View at http://spark.local:8040."

## Project Overview

TextAile is a local LLM chat interface that provides a ChatGPT/Claude-like experience for running language models locally. It's inspired by HollyWool and shares the same technology stack and design patterns.

## Project Structure

```
TextAile/
├── backend/                    # FastAPI Python backend
│   ├── app/
│   │   ├── main.py            # FastAPI app entry point
│   │   ├── models/
│   │   │   ├── schemas.py     # Chat/conversation Pydantic models
│   │   │   ├── mcp_schemas.py # MCP-related Pydantic models
│   │   │   └── agent_schemas.py # Agent Pydantic models
│   │   ├── routers/           # API route handlers
│   │   │   ├── chat.py        # Chat & streaming endpoints
│   │   │   ├── conversations.py # Conversation CRUD
│   │   │   ├── models.py      # Model management
│   │   │   ├── mcp.py         # MCP server management
│   │   │   ├── settings.py    # Settings & notifications
│   │   │   └── agents.py      # Agent management & execution
│   │   └── services/          # Business logic
│   │       ├── inference.py   # LLM loading & generation
│   │       ├── conversation_store.py # Persistence
│   │       ├── mcp_client.py  # MCP client connections
│   │       ├── secrets_store.py # API key storage
│   │       ├── agent_store.py # Agent config & run persistence
│   │       ├── agent_runner.py # Agent execution logic
│   │       └── agent_scheduler.py # APScheduler for cron jobs
│   ├── config.yaml            # Model configurations
│   ├── mcp_config.yaml        # MCP server configurations
│   ├── agents.yaml            # Agent configurations
│   ├── secrets.json           # API keys (gitignored)
│   └── requirements.txt
│
├── frontend/                   # React + TypeScript frontend
│   ├── src/
│   │   ├── api/client.ts      # Typed API client
│   │   ├── components/        # React components
│   │   │   ├── Layout.tsx
│   │   │   ├── ChatMessage.tsx
│   │   │   ├── ChatInput.tsx
│   │   │   ├── ConversationSidebar.tsx
│   │   │   └── ui/            # shadcn/ui components
│   │   ├── pages/             # Page components
│   │   │   ├── ChatPage.tsx
│   │   │   ├── ModelsPage.tsx
│   │   │   ├── MCPPage.tsx    # MCP server management
│   │   │   ├── SettingsPage.tsx
│   │   │   ├── AgentsPage.tsx # Agent list & status
│   │   │   ├── AgentDetailPage.tsx # Single agent + runs
│   │   │   └── AgentRunPage.tsx # Report viewer
│   │   ├── lib/utils.ts
│   │   ├── main.tsx
│   │   └── index.css
│   └── package.json
│
├── gotify/                     # Notification server
│   └── docker-compose.yml
│
├── start.sh                    # One-command startup script
├── data/conversations/         # Persisted conversation JSON files
└── data/agents/                # Agent run data & reports
```

## Development Commands

### Backend

```bash
cd backend
source venv/bin/activate

# Start server
uvicorn app.main:app --host 0.0.0.0 --port 8001

# Test endpoints
curl http://spark.local:8001/api/health
curl http://spark.local:8041/api/mcp/servers
```

### Frontend

```bash
cd frontend

npm run dev          # Start dev server (port 8040)
npm run build        # Production build
npm run typecheck    # TypeScript check
npm run lint         # ESLint
```

### Gotify (Notifications)

```bash
cd gotify
docker compose up -d   # Start Gotify server on port 8070
docker compose down    # Stop Gotify
```

## URLs

- Frontend: http://spark.local:8040
- Backend API: http://spark.local:8041
- API Docs: http://spark.local:8041/docs
- Gotify: http://spark.local:8070

## Key Architecture Decisions

1. **Streaming via SSE**: Text generation uses Server-Sent Events for real-time token streaming
2. **Transformers + Accelerate**: HuggingFace ecosystem for model loading with automatic GPU placement
3. **JSON Persistence**: Conversations stored as individual JSON files for simplicity
4. **TanStack Query**: Frontend data fetching with automatic caching and refetching
5. **MCP Client**: Connects to external MCP servers for extended tool capabilities
6. **Gotify Notifications**: Local push notifications for agents (phone must be on same network)

## MCP Integration

TextAile acts as an MCP **client**, connecting to external MCP servers.

### Configured Servers (mcp_config.yaml)

| Server | Description | Status |
|--------|-------------|--------|
| filesystem | Read/write local files | Enabled |
| fetch | Fetch URLs as markdown | Enabled |
| memory | Persistent knowledge graph | Enabled |
| brave-search | Web search (needs API key) | Enabled |

### Adding MCP Servers

Edit `backend/mcp_config.yaml`:

```yaml
servers:
  new-server:
    name: "Server Name"
    description: "What it does"
    type: "stdio"
    command: "npx"
    args: ["-y", "@modelcontextprotocol/server-name"]
    enabled: true
    # Optional: for servers needing API keys
    env:
      API_KEY: "${API_KEY}"
    required_secrets:
      - key: "API_KEY"
        name: "API Key"
        description: "Get from example.com"
```

### API Key Storage

API keys are stored in `backend/secrets.json` (gitignored) and can be configured via:
- MCP page: Configure button on servers with required_secrets
- Settings page: Gotify notification settings

## Notification System

Uses Gotify for local push notifications.

### Setup

1. Start Gotify: `cd gotify && docker compose up -d`
2. Access http://spark.local:8070 (default: admin/admin)
3. Create app token: Apps → Create Application
4. Configure in TextAile: Settings → Notifications

### Sending Notifications (Backend)

```python
import httpx

async def send_notification(title: str, message: str):
    store = get_secrets_store()
    url = store.get("GOTIFY_URL")
    token = store.get("GOTIFY_TOKEN")

    async with httpx.AsyncClient() as client:
        await client.post(
            f"{url}/message",
            params={"token": token},
            data={"title": title, "message": message, "priority": 5}
        )
```

## Agents

Personal autonomous agents that run on schedule and send notifications with generated reports.

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      DGX Spark                          │
│                                                         │
│  ┌─────────────┐    ┌─────────────┐    ┌────────────┐  │
│  │   Agent     │    │  TextAile   │    │  Gotify    │  │
│  │  Scheduler  │───▶│  LLM +      │───▶│  Server    │  │
│  │ (APScheduler)│    │  MCP Tools  │    │  :8070     │  │
│  └─────────────┘    └─────────────┘    └─────┬──────┘  │
└───────────────────────────────────────────────┼─────────┘
                                                │
                                    ┌───────────▼──────────┐
                                    │   Phone (on WiFi)    │
                                    │   Gotify App         │
                                    └──────────────────────┘
```

### Agent Definition (agents.yaml)

```yaml
agents:
  tech-news:
    name: "Tech News Digest"
    description: "Daily summary of top tech stories"
    schedule: "0 8 * * *"  # Cron: Daily at 8am
    enabled: true
    sources:
      - type: fetch
        label: "Hacker News"
        url: "https://news.ycombinator.com"
      - type: fetch
        label: "Lobsters"
        url: "https://lobste.rs"
    prompt: |
      Analyze the tech news from these sources and create a digest with:
      1. Top 5 most interesting stories
      2. Key themes or trends
      3. Brief summary of each story
    output:
      format: markdown
      title: "{agent_name} - {date}"
    notify:
      enabled: true
      title: "📰 Tech News Ready"
      priority: 5
```

### Source Types

| Type | Description | Config |
|------|-------------|--------|
| `fetch` | Fetch URL via MCP | `url`, `label` |
| `brave` | Web search | `query`, `count` |
| `file` | Read local file | `path` |
| `mcp` | Custom MCP tool | `tool`, `action`, `args` |

### Agent Execution Flow

1. **Fetch Sources**: Collects data from all configured sources via MCP
2. **Generate Report**: Sends sources + prompt to LLM (Qwen 2.5 7B by default)
3. **Save Report**: Stores markdown report with unique run ID
4. **Send Notification**: Pushes to Gotify with link to report

### Run Data Structure

```
data/agents/{agent_id}/runs/{run_id}/
├── meta.json       # Run metadata (status, timing, errors)
├── source_0.txt    # Raw content from first source
├── source_1.txt    # Raw content from second source
└── report.md       # Generated markdown report
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/agents` | GET | List all agents |
| `/api/agents/{id}` | GET | Get agent details |
| `/api/agents/{id}/run` | POST | Trigger manual run |
| `/api/agents/{id}/runs` | GET | List run history |
| `/api/agents/{id}/runs/{run_id}` | GET | Get run details + report |

### Frontend Pages

- **Agents List** (`/agents`): Overview of all agents with status and run buttons
- **Agent Detail** (`/agents/{id}`): Configuration, sources, and run history
- **Run Report** (`/agents/{id}/runs/{run_id}`): Rendered markdown report with metadata

### Default Model

Agents use `qwen2.5-7b` by default because it doesn't require HuggingFace approval. Models like Llama 3.2 require requesting access at their HuggingFace pages first.

### Technical Notes

- **Scheduler**: Uses APScheduler with MemoryJobStore (in-memory, jobs reload from YAML on restart)
- **Concurrent Runs**: Allowed - same agent can run multiple times simultaneously
- **Run Retention**: All runs kept forever, no automatic cleanup
- **Model Loading**: ~72 seconds for first run, cached thereafter

## Design Patterns

- **Chat bubbles**: User messages dark bubble right-aligned, AI messages no bubble left-aligned
- **Colors**: Primary purple (#5e6ad2)
- **Icons**: Lucide React throughout
- **Components**: shadcn/ui

---

## Session Notes

### Session 1 (2026-01-13) - MCP & Notifications

#### What Was Added
- MCP client service connecting to external servers (filesystem, fetch, memory, brave-search)
- Tool discovery from connected servers
- API key management via UI
- Chat UI improvements (bubbles, model selector, resizable sidebar)
- Gotify notification system with Docker setup

#### Key Files
```
backend/app/routers/mcp.py, settings.py
backend/app/services/mcp_client.py, secrets_store.py
backend/app/models/mcp_schemas.py
backend/mcp_config.yaml
frontend/src/pages/MCPPage.tsx
gotify/docker-compose.yml
```

### Session 2 (2026-01-13) - Agents Implementation

#### What Was Added
- **Full Agents Feature**: Autonomous tasks that fetch → LLM → report → notify
- APScheduler for cron-based scheduling
- Agent YAML configuration system
- Run history with persistent storage
- Markdown report viewer in frontend

#### Key Files
```
backend/app/models/agent_schemas.py   # Pydantic models
backend/app/services/agent_store.py   # Config & run persistence
backend/app/services/agent_runner.py  # Execution logic
backend/app/services/agent_scheduler.py # APScheduler
backend/app/routers/agents.py         # API endpoints
backend/agents.yaml                   # Agent configs
frontend/src/pages/AgentsPage.tsx     # Agent list
frontend/src/pages/AgentDetailPage.tsx # Agent + runs
frontend/src/pages/AgentRunPage.tsx   # Report viewer
start.sh                              # One-command startup
```

#### Bug Fixes
- Fixed scheduler pickling error by using module-level callback functions
- Changed from SQLAlchemyJobStore to MemoryJobStore
- Added gated model error handling with HuggingFace approval URLs
- Changed default agent model to Qwen 2.5 7B (no approval needed)

#### First Successful Agent Run
- Tech News Digest: Fetched HN + Lobsters → Generated 3099 char report → Sent Gotify notification

### Git Remote
```bash
git remote set-url origin git@github-flatstoneworks:flatstoneworks/TextAile.git
```

### GitHub
Repository: https://github.com/flatstoneworks/TextAile
