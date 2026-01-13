# TextAile

A local LLM chat interface inspired by [HollyWool](../HollyWool). TextAile provides a ChatGPT/Claude-like experience for running language models locally on your machine.

![TextAile Screenshot](docs/screenshot.png)

## Features

- **Chat Interface**: Familiar chat UI with streaming responses
- **Multiple Models**: Support for 15+ LLM models from Llama, Mistral, Qwen, and more
- **Conversation Management**: Create, rename, delete, and organize conversations
- **System Prompts**: Customize AI behavior with preset or custom system prompts
- **Export/Import**: Save conversations as JSON or Markdown
- **Model Management**: Browse available models, monitor cache usage
- **GPU Acceleration**: Automatic GPU detection and optimization
- **MCP Integration**: Connect to Model Context Protocol servers for extended capabilities
- **Personal Agents**: Autonomous background agents that fetch data, process with LLM, and send notifications

## Quick Start

### Prerequisites

- Python 3.12+
- Node.js 18+
- NVIDIA GPU with CUDA (optional, but recommended)

### One-Command Start

```bash
./start.sh
```

This will automatically:
- Create a Python virtual environment (if needed)
- Install all Python dependencies
- Install all Node.js dependencies
- Start both backend and frontend servers

### Manual Setup

If you prefer to start services manually:

**Backend:**
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8001
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

### Access

- Frontend: http://spark.local:5174
- Backend API: http://spark.local:8001
- API Docs: http://spark.local:8001/docs

## Architecture

### Backend

- **FastAPI** - High-performance async web framework
- **Transformers + Accelerate** - HuggingFace model loading and inference
- **PyTorch** - GPU-accelerated deep learning
- **SSE (Server-Sent Events)** - Real-time token streaming

### Frontend

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Fast build tooling
- **Tailwind CSS** - Utility-first styling
- **shadcn/ui** - Accessible component library
- **TanStack Query** - Data fetching and caching

## Supported Models

### Fast (< 8GB, quick inference)
- Llama 3.2 1B, 3B
- Phi-3.5 Mini
- Gemma 2 2B

### Quality (8-20GB, balanced)
- Llama 3.1 8B
- Mistral 7B v0.3
- Qwen 2.5 7B
- Gemma 2 9B

### Large (30GB+, maximum capability)
- Llama 3.1 70B
- Qwen 2.5 72B
- Gemma 2 27B

### Specialized
- DeepSeek Coder V2 Lite
- Qwen 2.5 Coder 7B
- Mathstral 7B

## API Endpoints

### Chat
```
POST /api/chat              # Non-streaming completion
GET  /api/chat/stream       # SSE streaming endpoint
POST /api/chat/stop         # Stop active generation
```

### Conversations
```
GET  /api/conversations                    # List conversations
POST /api/conversations                    # Create conversation
GET  /api/conversations/{id}               # Get conversation
PUT  /api/conversations/{id}               # Update conversation
DELETE /api/conversations/{id}             # Delete conversation
GET  /api/conversations/{id}/export        # Export as JSON/Markdown
POST /api/conversations/import             # Import from JSON
```

### Models
```
GET  /api/models                  # List available models
GET  /api/models/detailed         # With cache info
DELETE /api/models/{id}/cache     # Delete model cache
GET  /api/health                  # Health check with GPU status
```

### MCP
```
GET  /api/mcp/servers                    # List MCP servers
POST /api/mcp/servers/{id}/connect       # Connect to server
POST /api/mcp/servers/{id}/disconnect    # Disconnect from server
GET  /api/mcp/tools                      # List available tools
POST /api/mcp/tools/call                 # Call a tool
POST /api/mcp/secrets                    # Set API key
DELETE /api/mcp/secrets/{key}            # Delete API key
```

### Settings
```
GET  /api/settings/notifications         # Get notification config
POST /api/settings/notifications         # Update notification config
DELETE /api/settings/notifications       # Remove notification config
POST /api/settings/notifications/test    # Send test notification
```

### Agents
```
GET  /api/agents                         # List all agents
GET  /api/agents/{id}                    # Get agent info
GET  /api/agents/{id}/config             # Get full configuration
POST /api/agents/{id}/run                # Trigger manual run
GET  /api/agents/{id}/runs               # List run history
GET  /api/agents/{id}/runs/{run_id}      # Get run details + report
GET  /api/agents/scheduler/status        # Scheduler status
```

## Configuration

Edit `backend/config.yaml` to add or modify model configurations:

```yaml
models:
  my-custom-model:
    name: "My Custom Model"
    path: "organization/model-name"
    category: "quality"
    size_gb: 14
    context_length: 32768
    description: "Description here"
    tags: ["custom", "chat"]
```

## Agents

Agents are autonomous tasks that run on a schedule or manually, fetching data from various sources, processing it with the LLM, and optionally sending notifications.

### Configuration

Agents are defined in `backend/agents.yaml`:

```yaml
agents:
  tech-news:
    name: "Tech News Digest"
    description: "Daily summary of top tech stories"
    enabled: true
    schedule: "0 8 * * *"  # Cron: 8am daily (null for manual only)

    sources:
      - type: fetch
        url: "https://news.ycombinator.com"
        label: "Hacker News"
      - type: brave        # Requires API key
        query: "AI news today"
        count: 5

    prompt: |
      Analyze these sources and create a digest...

    output:
      title: "Tech Digest - {date}"

    notify:
      enabled: true
      title: "Tech Digest Ready"
      priority: 5
```

### Source Types

| Type | Description | Example |
|------|-------------|---------|
| `fetch` | Fetch URL content | `url: "https://example.com"` |
| `brave` | Brave web search | `query: "AI news", count: 5` |
| `file` | Read local file | `path: "/path/to/file.md"` |
| `mcp` | Custom MCP tool | `tool: "memory", action: "search"` |

### Output

Each agent run produces:
- `report.md` - The generated markdown document
- `meta.json` - Run metadata (timing, status, token usage)
- `sources/` - Raw fetched content (optional)

Reports are viewable in the UI at `/agents/{id}/runs/{run_id}`

## MCP Servers

TextAile can connect to [Model Context Protocol](https://modelcontextprotocol.io) servers to extend AI capabilities with external tools.

### Included MCP Servers

| Server | Description | Requires |
|--------|-------------|----------|
| Filesystem | Read/write local files | Nothing |
| Fetch | Fetch URLs as markdown | Nothing |
| Memory | Persistent knowledge graph | Nothing |
| Brave Search | Web search | API key (free at brave.com/search/api) |

### Configuration

MCP servers are configured in `backend/mcp_config.yaml`. API keys can be entered directly in the UI (MCP page → Configure).

## Notifications (Gotify)

For the upcoming Agents feature, TextAile uses [Gotify](https://gotify.net) for local push notifications.

### Prerequisites

- Docker and Docker Compose
- User in the `docker` group (or use sudo)

To add yourself to the docker group:
```bash
sudo usermod -aG docker $USER
# Log out and back in for changes to take effect
```

### Setup

```bash
cd gotify
docker compose up -d
```

### Access

- Gotify Web UI: http://spark.local:8070
- Default credentials: `admin` / `admin` (change after first login)

### Phone Setup

1. Install the Gotify app on your phone ([Android](https://play.google.com/store/apps/details?id=com.github.gotify), [iOS via Web](https://gotify.net/docs/web))
2. Connect to `http://spark.local:8070` (must be on same network)
3. Log in with your credentials

### Configure in TextAile

1. Open Gotify web UI → Apps → Create Application
2. Name it "TextAile Agents" and copy the token
3. In TextAile, go to **Settings** → **Notifications**
4. Enter Gotify URL (`http://spark.local:8070`) and app token
5. Click "Save" then "Test" to verify

## Development

### Backend

```bash
# Format code
black app/

# Type checking
mypy app/

# Run tests
pytest
```

### Frontend

```bash
# Type checking
npm run typecheck

# Linting
npm run lint

# Build for production
npm run build
```

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Enter` | Send message |
| `Shift+Enter` | New line |

## License

MIT

## Credits

- Inspired by [HollyWool](../HollyWool) image/video generation UI
- Built with [HuggingFace Transformers](https://huggingface.co/transformers)
- UI components from [shadcn/ui](https://ui.shadcn.com)
