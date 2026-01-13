# CLAUDE.md

This file provides guidance to Claude Code when working with TextAile.

## Communication Guidelines

- **URLs must be clickable**: Always format URLs so they are clickable (no trailing punctuation like periods or commas immediately after the URL)
  - Good: "View at http://spark.local:5174"
  - Bad: "View at http://spark.local:5174."

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
│   │   │   └── mcp_schemas.py # MCP-related Pydantic models
│   │   ├── routers/           # API route handlers
│   │   │   ├── chat.py        # Chat & streaming endpoints
│   │   │   ├── conversations.py # Conversation CRUD
│   │   │   ├── models.py      # Model management
│   │   │   ├── mcp.py         # MCP server management
│   │   │   └── settings.py    # Settings & notifications
│   │   └── services/          # Business logic
│   │       ├── inference.py   # LLM loading & generation
│   │       ├── conversation_store.py # Persistence
│   │       ├── mcp_client.py  # MCP client connections
│   │       └── secrets_store.py # API key storage
│   ├── config.yaml            # Model configurations
│   ├── mcp_config.yaml        # MCP server configurations
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
│   │   │   └── SettingsPage.tsx
│   │   ├── lib/utils.ts
│   │   ├── main.tsx
│   │   └── index.css
│   └── package.json
│
├── gotify/                     # Notification server
│   └── docker-compose.yml
│
└── data/conversations/         # Persisted conversation JSON files
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
curl http://spark.local:8001/api/mcp/servers
```

### Frontend

```bash
cd frontend

npm run dev          # Start dev server (port 5174)
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

- Frontend: http://spark.local:5174
- Backend API: http://spark.local:8001
- API Docs: http://spark.local:8001/docs
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

## Agents (Planned)

Personal autonomous agents that run on schedule and send notifications.

### Planned Architecture

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

### Agent Definition (Planned)

```yaml
agents:
  tech-news:
    name: "Tech News Digest"
    schedule: "0 8 * * *"  # Cron: Daily at 8am
    sources:
      - type: fetch
        url: "https://news.ycombinator.com"
    prompt: "Summarize the top 5 stories"
    notify:
      title: "Morning Tech Digest"
      priority: 3
```

## Design Patterns

- **Chat bubbles**: User messages dark bubble right-aligned, AI messages no bubble left-aligned
- **Colors**: Primary purple (#5e6ad2)
- **Icons**: Lucide React throughout
- **Components**: shadcn/ui

---

## Session Notes (2026-01-13) - Continued

### What Was Added

#### MCP Client Support
- MCP client service connecting to external servers (filesystem, fetch, memory, brave-search)
- Tool discovery from connected servers
- API key management via UI
- MCP page in navigation showing server status and tools

#### Chat UI Improvements
- User messages as dark bubbles, right-aligned
- AI messages without bubbles, left-aligned
- Model selector dropdown in input bar
- Resizable sidebar with drag handle
- Auto-generated session titles

#### Notification System (Gotify)
- Docker compose setup for local Gotify server
- Settings page UI for configuration
- Test notification button
- Secrets stored locally (not in git)

### Key Files Added

```
backend/app/routers/mcp.py          # MCP server management API
backend/app/routers/settings.py     # Notification settings API
backend/app/services/mcp_client.py  # MCP client connections
backend/app/services/secrets_store.py # API key storage
backend/app/models/mcp_schemas.py   # MCP Pydantic models
backend/mcp_config.yaml             # MCP server configurations
frontend/src/pages/MCPPage.tsx      # MCP server management UI
gotify/docker-compose.yml           # Gotify container setup
```

### Bug Fixes
- Fixed `_refresh_tools()` checking status before it was set to CONNECTED
- Fixed Fetch MCP server using correct Python package (mcp-server-fetch via pip)

### Git Remote
Configured SSH for flatstoneworks account:
```bash
git remote set-url origin git@github-flatstoneworks:flatstoneworks/TextAile.git
```

### Next Steps (Agents Feature)
1. Create agent schema and configuration
2. Implement scheduler service (APScheduler)
3. Build agent runner (fetch → LLM → notify)
4. Add Agents page to UI for management
5. Integrate with MCP tools for data fetching

### GitHub
Repository: https://github.com/flatstoneworks/TextAile
