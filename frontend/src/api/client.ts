/**
 * TextAile API Client
 * Typed API client for communicating with the TextAile backend
 */

const API_BASE = '/api'

// ============================================================================
// Types
// ============================================================================

export interface Message {
  id: string
  role: 'system' | 'user' | 'assistant'
  content: string
  created_at: string
  model?: string
}

export interface Conversation {
  id: string
  name: string
  system_prompt?: string
  messages: Message[]
  model: string
  created_at: string
  updated_at: string
}

export interface ConversationSummary {
  id: string
  name: string
  system_prompt?: string
  model: string
  message_count: number
  created_at: string
  updated_at: string
  preview?: string
}

export interface CreateConversationRequest {
  name?: string
  model?: string
  system_prompt?: string
}

export interface UpdateConversationRequest {
  name?: string
  system_prompt?: string
  model?: string
}

export interface ChatRequest {
  conversation_id: string
  message: string
  model?: string
  temperature?: number
  top_p?: number
  max_tokens?: number
}

export interface ChatResponse {
  message: Message
  conversation_id: string
}

export interface StreamEvent {
  type: 'start' | 'token' | 'done' | 'error'
  content?: string
  message_id?: string
  error?: string
}

export interface ModelInfo {
  id: string
  name: string
  path: string
  category: string
  size_gb: number
  context_length: number
  description: string
  tags: string[]
  requires_approval: boolean
  approval_url?: string
}

export interface ModelDetailedInfo extends ModelInfo {
  is_cached: boolean
  cache_size_gb?: number
  last_accessed?: string
}

export interface HealthResponse {
  status: string
  gpu_available: boolean
  gpu_name?: string
  current_model?: string
  version: string
}

export interface CacheStats {
  total_size_gb: number
  num_repos: number
}

// ============================================================================
// API Functions
// ============================================================================

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }))
    throw new Error(error.detail || `HTTP ${response.status}`)
  }
  return response.json()
}

// Health
export async function getHealth(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE}/health`)
  return handleResponse<HealthResponse>(res)
}

// Models
export async function getModels(): Promise<ModelInfo[]> {
  const res = await fetch(`${API_BASE}/models`)
  return handleResponse<ModelInfo[]>(res)
}

export async function getModelsDetailed(): Promise<ModelDetailedInfo[]> {
  const res = await fetch(`${API_BASE}/models/detailed`)
  return handleResponse<ModelDetailedInfo[]>(res)
}

export async function getModel(modelId: string): Promise<ModelDetailedInfo> {
  const res = await fetch(`${API_BASE}/models/${modelId}`)
  return handleResponse<ModelDetailedInfo>(res)
}

export async function deleteModelCache(modelId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/models/${modelId}/cache`, {
    method: 'DELETE',
  })
  await handleResponse(res)
}

export async function getCacheStatus(): Promise<CacheStats> {
  const res = await fetch(`${API_BASE}/models/cache-status`)
  return handleResponse<CacheStats>(res)
}

export async function downloadModel(modelId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/models/${modelId}/download`, {
    method: 'POST',
  })
  await handleResponse(res)
}

// Conversations
export async function getConversations(): Promise<ConversationSummary[]> {
  const res = await fetch(`${API_BASE}/conversations`)
  return handleResponse<ConversationSummary[]>(res)
}

export async function getConversation(id: string): Promise<Conversation> {
  const res = await fetch(`${API_BASE}/conversations/${id}`)
  return handleResponse<Conversation>(res)
}

export async function createConversation(
  data: CreateConversationRequest = {}
): Promise<Conversation> {
  const res = await fetch(`${API_BASE}/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return handleResponse<Conversation>(res)
}

export async function updateConversation(
  id: string,
  data: UpdateConversationRequest
): Promise<Conversation> {
  const res = await fetch(`${API_BASE}/conversations/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  return handleResponse<Conversation>(res)
}

export async function deleteConversation(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/conversations/${id}`, {
    method: 'DELETE',
  })
  await handleResponse(res)
}

export async function exportConversation(
  id: string,
  format: 'json' | 'markdown' = 'json'
): Promise<Blob> {
  const res = await fetch(`${API_BASE}/conversations/${id}/export?format=${format}`)
  if (!res.ok) {
    throw new Error('Failed to export conversation')
  }
  return res.blob()
}

export async function importConversation(file: File): Promise<Conversation> {
  const formData = new FormData()
  formData.append('file', file)

  const res = await fetch(`${API_BASE}/conversations/import`, {
    method: 'POST',
    body: formData,
  })
  return handleResponse<Conversation>(res)
}

// Chat
export async function sendMessage(request: ChatRequest): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  return handleResponse<ChatResponse>(res)
}

export async function stopGeneration(): Promise<void> {
  const res = await fetch(`${API_BASE}/chat/stop`, { method: 'POST' })
  await handleResponse(res)
}

// Streaming
export function streamChat(
  conversationId: string,
  message: string,
  options: {
    model?: string
    temperature?: number
    top_p?: number
    max_tokens?: number
  } = {},
  onEvent: (event: StreamEvent) => void,
  onError?: (error: Error) => void
): () => void {
  const params = new URLSearchParams({
    conversation_id: conversationId,
    message,
    ...(options.model && { model: options.model }),
    ...(options.temperature !== undefined && { temperature: String(options.temperature) }),
    ...(options.top_p !== undefined && { top_p: String(options.top_p) }),
    ...(options.max_tokens !== undefined && { max_tokens: String(options.max_tokens) }),
  })

  const eventSource = new EventSource(`${API_BASE}/chat/stream?${params}`)

  eventSource.onmessage = (event) => {
    try {
      const data: StreamEvent = JSON.parse(event.data)
      onEvent(data)

      if (data.type === 'done' || data.type === 'error') {
        eventSource.close()
      }
    } catch (e) {
      console.error('Failed to parse SSE event:', e)
    }
  }

  eventSource.onerror = (event) => {
    console.error('SSE error:', event)
    eventSource.close()
    onError?.(new Error('Stream connection failed'))
  }

  // Return cleanup function
  return () => {
    eventSource.close()
  }
}
