import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ChatMessage } from '@/components/ChatMessage'
import { ChatInput } from '@/components/ChatInput'
import { ConversationSidebar } from '@/components/ConversationSidebar'
import { SystemPromptEditor } from '@/components/SystemPromptEditor'
import * as api from '@/api/client'
import type { Message, StreamEvent } from '@/api/client'

const MIN_SIDEBAR_WIDTH = 200
const MAX_SIDEBAR_WIDTH = 400
const DEFAULT_SIDEBAR_WIDTH = 256

export function ChatPage() {
  const { conversationId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [streamingContent, setStreamingContent] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null)
  const [requestStartTime, setRequestStartTime] = useState<number | null>(null)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [selectedModel, setSelectedModel] = useState<string | undefined>()
  const [systemPromptOpen, setSystemPromptOpen] = useState(false)
  const [editingConvId, setEditingConvId] = useState<string | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('textaile-sidebar-width')
    return saved ? parseInt(saved, 10) : DEFAULT_SIDEBAR_WIDTH
  })
  const [isResizing, setIsResizing] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollAnchorRef = useRef<HTMLDivElement>(null)
  const stopStreamRef = useRef<(() => void) | null>(null)

  // Save sidebar width to localStorage
  useEffect(() => {
    localStorage.setItem('textaile-sidebar-width', String(sidebarWidth))
  }, [sidebarWidth])

  // Handle resize drag
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }, [])

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, e.clientX))
      setSidebarWidth(newWidth)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing])

  // Queries
  const { data: conversations = [] } = useQuery({
    queryKey: ['conversations'],
    queryFn: api.getConversations,
  })

  const { data: conversation, isLoading: conversationLoading } = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => api.getConversation(conversationId!),
    enabled: !!conversationId,
  })

  const { data: models = [] } = useQuery({
    queryKey: ['models', 'detailed'],
    queryFn: api.getModelsDetailed,
  })

  // Set selected model when conversation changes
  useEffect(() => {
    if (conversation?.model) {
      setSelectedModel(conversation.model)
    }
  }, [conversation?.model])

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollAnchorRef.current) {
      // Use instant scroll during streaming for better performance
      const behavior = isStreaming ? 'instant' : 'smooth'
      scrollAnchorRef.current.scrollIntoView({ behavior, block: 'end' })
    }
  }, [conversation?.messages, streamingContent, loadingMessage, isStreaming])

  // Update elapsed time during loading/thinking
  useEffect(() => {
    if (!requestStartTime || !loadingMessage) {
      setElapsedTime(0)
      return
    }

    const interval = setInterval(() => {
      setElapsedTime(Math.floor((Date.now() - requestStartTime) / 1000))
    }, 1000)

    return () => clearInterval(interval)
  }, [requestStartTime, loadingMessage])

  // Mutations
  const createConversation = useMutation({
    mutationFn: api.createConversation,
    onSuccess: (newConv) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      navigate(`/chat/${newConv.id}`)
    },
  })

  const updateConversation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: api.UpdateConversationRequest }) =>
      api.updateConversation(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] })
    },
  })

  const deleteConversation = useMutation({
    mutationFn: api.deleteConversation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
    },
  })

  // Handlers
  const handleNewChat = () => {
    // Don't pass model - let backend use configured default (qwen2.5-7b)
    // This ensures we use a model that's actually available
    createConversation.mutate({})
  }

  const handleSelectConversation = (id: string) => {
    navigate(`/chat/${id}`)
  }

  const handleRename = (id: string, name: string) => {
    updateConversation.mutate({ id, data: { name } })
  }

  const handleDelete = (id: string) => {
    deleteConversation.mutate(id)
  }

  const handleExport = async (id: string, format: 'json' | 'markdown') => {
    try {
      const blob = await api.exportConversation(id, format)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `conversation.${format === 'markdown' ? 'md' : 'json'}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Export failed:', error)
    }
  }

  const handleImport = async (file: File) => {
    try {
      const newConv = await api.importConversation(file)
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      navigate(`/chat/${newConv.id}`)
    } catch (error) {
      console.error('Import failed:', error)
    }
  }

  const handleSystemPromptOpen = (id: string) => {
    setEditingConvId(id)
    setSystemPromptOpen(true)
  }

  const handleSystemPromptSave = (prompt: string | null) => {
    if (editingConvId) {
      updateConversation.mutate({
        id: editingConvId,
        data: { system_prompt: prompt || undefined },
      })
    }
  }

  const handleModelChange = (modelId: string) => {
    setSelectedModel(modelId)
    if (conversationId) {
      updateConversation.mutate({
        id: conversationId,
        data: { model: modelId },
      })
    }
  }

  const handleSendMessage = useCallback((message: string) => {
    if (!conversationId || isStreaming) return

    setIsStreaming(true)
    setStreamingContent('')
    setLoadingMessage(null)
    setRequestStartTime(Date.now())
    setElapsedTime(0)

    // Create a temporary streaming message
    const tempMessages: Message[] = [
      ...(conversation?.messages || []),
      {
        id: 'temp-user',
        role: 'user',
        content: message,
        created_at: new Date().toISOString(),
      },
    ]

    // Optimistically update the UI
    queryClient.setQueryData(['conversation', conversationId], {
      ...conversation,
      messages: tempMessages,
    })

    // Start streaming
    const cleanup = api.streamChat(
      conversationId,
      message,
      { model: selectedModel },
      (event: StreamEvent) => {
        if (event.type === 'loading' && event.content) {
          setLoadingMessage(event.content)
        } else if (event.type === 'thinking' && event.content) {
          setLoadingMessage(event.content)
        } else if (event.type === 'token' && event.content) {
          setLoadingMessage(null)  // Clear loading message when tokens start
          setRequestStartTime(null)
          setStreamingContent((prev) => prev + event.content)
        } else if (event.type === 'done') {
          setIsStreaming(false)
          setStreamingContent('')
          setLoadingMessage(null)
          setRequestStartTime(null)
          queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] })
          queryClient.invalidateQueries({ queryKey: ['conversations'] })

          // Generate title after first message exchange
          const wasFirstMessage = !conversation?.messages?.length
          if (wasFirstMessage && conversationId) {
            api.generateTitle(conversationId).then(() => {
              queryClient.invalidateQueries({ queryKey: ['conversations'] })
            }).catch(console.error)
          }
        } else if (event.type === 'error') {
          console.error('Stream error:', event.error)
          setIsStreaming(false)
          setStreamingContent('')
          setLoadingMessage(null)
          setRequestStartTime(null)
          queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] })
        }
      },
      (error) => {
        console.error('Stream connection error:', error)
        setIsStreaming(false)
        setStreamingContent('')
        setLoadingMessage(null)
        setRequestStartTime(null)
        queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] })
      }
    )

    stopStreamRef.current = cleanup
  }, [conversationId, conversation, selectedModel, isStreaming, queryClient])

  const handleStopGeneration = async () => {
    if (stopStreamRef.current) {
      stopStreamRef.current()
      stopStreamRef.current = null
    }
    await api.stopGeneration()
    setIsStreaming(false)
    setStreamingContent('')
    setLoadingMessage(null)
    setRequestStartTime(null)
    queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] })
  }

  // Get current conversation for system prompt editor
  const editingConversation = conversations.find((c) => c.id === editingConvId)

  return (
    <div className={`flex h-[calc(100vh-48px)] ${isResizing ? 'select-none' : ''}`}>
      {/* Sidebar */}
      <ConversationSidebar
        conversations={conversations}
        currentId={conversationId}
        width={sidebarWidth}
        onNew={handleNewChat}
        onSelect={handleSelectConversation}
        onRename={handleRename}
        onDelete={handleDelete}
        onExport={handleExport}
        onImport={handleImport}
        onSystemPrompt={handleSystemPromptOpen}
      />

      {/* Resize handle */}
      <div
        className="w-1 bg-transparent hover:bg-primary/50 cursor-col-resize transition-colors flex-shrink-0"
        onMouseDown={handleMouseDown}
      />

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {conversationId && conversation ? (
          <>
            {/* Messages */}
            <ScrollArea className="flex-1" ref={scrollRef}>
              <div className="max-w-3xl mx-auto pt-4">
                {conversation.messages.map((msg, index) => {
                  const nextMsg = conversation.messages[index + 1]
                  const isLastInInteraction =
                    msg.role === 'assistant' &&
                    (!nextMsg || nextMsg.role === 'user')
                  return (
                    <ChatMessage
                      key={msg.id}
                      message={msg}
                      isLastInInteraction={isLastInInteraction && !isStreaming}
                    />
                  )
                })}

                {/* Loading indicator */}
                {isStreaming && loadingMessage && !streamingContent && (
                  <div className="flex items-center gap-3 px-4 py-6 text-muted-foreground">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.3s]" />
                      <div className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.15s]" />
                      <div className="w-2 h-2 bg-primary rounded-full animate-bounce" />
                    </div>
                    <span className="text-sm">{loadingMessage}</span>
                    {elapsedTime > 0 && (
                      <span className="text-xs text-muted-foreground/70">
                        {elapsedTime}s
                      </span>
                    )}
                  </div>
                )}

                {/* Streaming message */}
                {isStreaming && streamingContent && (
                  <ChatMessage
                    message={{
                      id: 'streaming',
                      role: 'assistant',
                      content: streamingContent,
                      created_at: new Date().toISOString(),
                      model: selectedModel,
                    }}
                    isStreaming
                  />
                )}

                {/* Empty state */}
                {conversation.messages.length === 0 && !isStreaming && (
                  <div className="flex flex-col items-center justify-center py-32 text-center px-4">
                    <h2 className="text-2xl font-medium mb-2">What can I help with?</h2>
                    <p className="text-muted-foreground text-sm">
                      Start a conversation with the AI assistant
                    </p>
                  </div>
                )}

                {/* Scroll anchor */}
                <div ref={scrollAnchorRef} className="h-4" />
              </div>
            </ScrollArea>

            {/* Input */}
            <ChatInput
              onSend={handleSendMessage}
              onStop={handleStopGeneration}
              isLoading={isStreaming}
              disabled={conversationLoading}
              models={models.map(m => ({ id: m.id, name: m.name, is_cached: m.is_cached, requires_approval: m.requires_approval }))}
              selectedModel={selectedModel}
              onModelChange={handleModelChange}
            />
          </>
        ) : (
          /* No conversation selected */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <h2 className="text-2xl font-medium mb-2">What can I help with?</h2>
            <p className="text-muted-foreground mb-8">
              Select a conversation or start a new one
            </p>
            <Button onClick={handleNewChat} size="lg" className="rounded-full px-6">
              New Chat
            </Button>
          </div>
        )}
      </div>

      {/* System prompt editor */}
      <SystemPromptEditor
        open={systemPromptOpen}
        onOpenChange={setSystemPromptOpen}
        initialPrompt={editingConversation?.system_prompt || ''}
        onSave={handleSystemPromptSave}
      />
    </div>
  )
}
