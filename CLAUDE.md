# CLAUDE.md

This file provides guidance to Claude Code when working with TextAile.

## Project Overview

TextAile is a local LLM chat interface that provides a ChatGPT/Claude-like experience for running language models locally. It's inspired by HollyWool and shares the same technology stack and design patterns.

## Project Structure

```
TextAile/
├── backend/                    # FastAPI Python backend
│   ├── app/
│   │   ├── main.py            # FastAPI app entry point
│   │   ├── models/schemas.py  # Pydantic models
│   │   ├── routers/           # API route handlers
│   │   │   ├── chat.py        # Chat & streaming endpoints
│   │   │   ├── conversations.py # Conversation CRUD
│   │   │   └── models.py      # Model management
│   │   └── services/          # Business logic
│   │       ├── inference.py   # LLM loading & generation
│   │       └── conversation_store.py # Persistence
│   ├── config.yaml            # Model configurations
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
│   │   │   ├── SystemPromptEditor.tsx
│   │   │   └── ui/            # shadcn/ui components
│   │   ├── pages/             # Page components
│   │   │   ├── ChatPage.tsx
│   │   │   ├── ModelsPage.tsx
│   │   │   └── SettingsPage.tsx
│   │   ├── lib/utils.ts       # Utility functions
│   │   ├── main.tsx           # React entry point
│   │   └── index.css          # Tailwind styles
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
│
└── data/conversations/         # Persisted conversation JSON files
```

## Development Commands

### Backend

```bash
cd backend
source venv/bin/activate

# Start server with hot reload
uvicorn app.main:app --reload --host 0.0.0.0 --port 8001

# Test endpoints
curl http://spark.local:8001/api/health
curl http://spark.local:8001/api/models
```

### Frontend

```bash
cd frontend

npm run dev          # Start dev server (port 5174)
npm run build        # Production build
npm run typecheck    # TypeScript check
npm run lint         # ESLint
```

## Key Architecture Decisions

1. **Streaming via SSE**: Text generation uses Server-Sent Events for real-time token streaming
2. **Transformers + Accelerate**: HuggingFace ecosystem for model loading with automatic GPU placement
3. **JSON Persistence**: Conversations stored as individual JSON files for simplicity
4. **TanStack Query**: Frontend data fetching with automatic caching and refetching

## API Ports

- Backend: 8001 (different from HollyWool's 8000)
- Frontend Dev: 5174 (different from HollyWool's 5173)

## URLs

Following the project convention, use `spark.local` instead of `localhost`:
- Frontend: http://spark.local:5174
- Backend: http://spark.local:8001
- API Docs: http://spark.local:8001/docs

## Common Tasks

### Adding a New Model

Edit `backend/config.yaml`:

```yaml
models:
  new-model-id:
    name: "Display Name"
    path: "huggingface/repo-id"
    category: "fast|quality|large|specialized"
    size_gb: 14
    context_length: 32768
    description: "Model description"
    tags: ["tag1", "tag2"]
```

### Modifying the Chat Interface

The main chat logic is in `frontend/src/pages/ChatPage.tsx`. Key areas:
- `handleSendMessage`: Initiates streaming chat
- `streamChat` API call: Handles SSE connection
- `ChatMessage` component: Renders messages with markdown

### Changing Default Settings

Edit `backend/config.yaml` under `defaults`:

```yaml
defaults:
  model: "llama-3.2-3b"
  temperature: 0.7
  top_p: 0.9
  max_tokens: 2048
  system_prompt: "You are a helpful assistant."
```

## Design Patterns

- **Glass morphism**: `bg-black/40 backdrop-blur-xl border-white/10`
- **Colors**: Primary is purple (#5e6ad2), matching HollyWool
- **Icons**: Lucide React throughout
- **Font**: System font stack with antialiasing
