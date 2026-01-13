import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bot, ChevronDown, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ChatMessage } from '@/components/ChatMessage'
import { ChatInput } from '@/components/ChatInput'
import { ConversationSidebar } from '@/components/ConversationSidebar'
import { SystemPromptEditor } from '@/components/SystemPromptEditor'
import { cn } from '@/lib/utils'
import * as api from '@/api/client'
import type { Message, StreamEvent } from '@/api/client'

export function ChatPage() {
  const { conversationId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [streamingContent, setStreamingContent] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [selectedModel, setSelectedModel] = useState<string | undefined>()
  const [systemPromptOpen, setSystemPromptOpen] = useState(false)
  const [editingConvId, setEditingConvId] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const stopStreamRef = useRef<(() => void) | null>(null)

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
    queryKey: ['models'],
    queryFn: api.getModels,
  })

  // Set selected model when conversation changes
  useEffect(() => {
    if (conversation?.model) {
      setSelectedModel(conversation.model)
    }
  }, [conversation?.model])

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [conversation?.messages, streamingContent])

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

  const handleModelChange = (model: string) => {
    setSelectedModel(model)
    if (conversationId) {
      updateConversation.mutate({
        id: conversationId,
        data: { model },
      })
    }
  }

  const handleSendMessage = useCallback((message: string) => {
    if (!conversationId || isStreaming) return

    setIsStreaming(true)
    setStreamingContent('')

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
        if (event.type === 'token' && event.content) {
          setStreamingContent((prev) => prev + event.content)
        } else if (event.type === 'done') {
          setIsStreaming(false)
          setStreamingContent('')
          queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] })
          queryClient.invalidateQueries({ queryKey: ['conversations'] })
        } else if (event.type === 'error') {
          console.error('Stream error:', event.error)
          setIsStreaming(false)
          setStreamingContent('')
          queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] })
        }
      },
      (error) => {
        console.error('Stream connection error:', error)
        setIsStreaming(false)
        setStreamingContent('')
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
    queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] })
  }

  // Group models by category
  const modelsByCategory = models.reduce(
    (acc, model) => {
      const category = model.category
      if (!acc[category]) {
        acc[category] = []
      }
      acc[category].push(model)
      return acc
    },
    {} as Record<string, typeof models>
  )

  const categoryLabels: Record<string, string> = {
    fast: 'Fast',
    quality: 'Quality',
    large: 'Large',
    specialized: 'Specialized',
  }

  // Get current conversation for system prompt editor
  const editingConversation = conversations.find((c) => c.id === editingConvId)

  return (
    <div className="flex h-[calc(100vh-48px)]">
      {/* Sidebar */}
      <ConversationSidebar
        conversations={conversations}
        currentId={conversationId}
        onNew={handleNewChat}
        onSelect={handleSelectConversation}
        onRename={handleRename}
        onDelete={handleDelete}
        onExport={handleExport}
        onImport={handleImport}
        onSystemPrompt={handleSystemPromptOpen}
      />

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {conversationId && conversation ? (
          <>
            {/* Chat header */}
            <div className="h-12 flex items-center justify-between px-4 border-b border-border">
              <div className="flex items-center gap-3">
                <h2 className="font-medium truncate max-w-[300px]">
                  {conversation.name}
                </h2>
                {conversation.system_prompt && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs gap-1.5"
                    onClick={() => handleSystemPromptOpen(conversationId)}
                  >
                    <Settings2 className="h-3 w-3" />
                    System Prompt
                  </Button>
                )}
              </div>

              {/* Model selector */}
              <Select value={selectedModel} onValueChange={handleModelChange}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select model..." />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(modelsByCategory).map(([category, categoryModels]) => (
                    <SelectGroup key={category}>
                      <SelectLabel>{categoryLabels[category] || category}</SelectLabel>
                      {categoryModels.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          <div className="flex items-center gap-2">
                            <span>{model.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {model.size_gb}GB
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1" ref={scrollRef}>
              <div className="max-w-3xl mx-auto">
                {conversation.messages.map((msg) => (
                  <ChatMessage key={msg.id} message={msg} />
                ))}

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
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center mb-4">
                      <Bot className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="text-lg font-medium mb-2">Start a conversation</h3>
                    <p className="text-muted-foreground text-sm max-w-md">
                      Type a message below to start chatting with the AI. You can
                      change the model or set a system prompt using the controls above.
                    </p>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Input */}
            <ChatInput
              onSend={handleSendMessage}
              onStop={handleStopGeneration}
              isLoading={isStreaming}
              disabled={conversationLoading}
            />
          </>
        ) : (
          /* No conversation selected */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <div className="w-20 h-20 rounded-2xl bg-primary/20 flex items-center justify-center mb-6">
              <Bot className="h-10 w-10 text-primary" />
            </div>
            <h2 className="text-2xl font-semibold mb-2">Welcome to TextAile</h2>
            <p className="text-muted-foreground mb-6 max-w-md">
              A local LLM chat interface. Select a conversation from the sidebar
              or start a new one.
            </p>
            <Button onClick={handleNewChat} size="lg">
              Start New Chat
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
