import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { Plus, ArrowUp, Square, Loader2, ChevronDown, Check, Download, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface Model {
  id: string
  name: string
  is_cached?: boolean
  requires_approval?: boolean
}

interface ChatInputProps {
  onSend: (message: string) => void
  onStop?: () => void
  isLoading?: boolean
  disabled?: boolean
  placeholder?: string
  models?: Model[]
  selectedModel?: string
  onModelChange?: (modelId: string) => void
}

export function ChatInput({
  onSend,
  onStop,
  isLoading = false,
  disabled = false,
  placeholder = 'Ask anything',
  models = [],
  selectedModel,
  onModelChange,
}: ChatInputProps) {
  const [message, setMessage] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const currentModel = models.find(m => m.id === selectedModel)

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      const newHeight = Math.min(textarea.scrollHeight, 200)
      textarea.style.height = `${newHeight}px`
    }
  }, [message])

  const handleSubmit = () => {
    if (message.trim() && !isLoading && !disabled) {
      onSend(message.trim())
      setMessage('')
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="p-4 pb-6">
      <div className="max-w-3xl mx-auto">
        <div className="relative flex items-end gap-2 bg-[#2a2a2a] rounded-full px-2 py-1.5">
          {/* Plus button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/10 flex-shrink-0"
          >
            <Plus className="h-5 w-5" />
          </Button>

          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled || isLoading}
            rows={1}
            className={cn(
              'flex-1 resize-none bg-transparent border-0 outline-none text-sm',
              'placeholder:text-muted-foreground py-1.5',
              'min-h-[32px] max-h-[200px]',
              'scrollbar-thin'
            )}
          />

          {/* Model selector */}
          {models.length > 0 && onModelChange && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-white/10 rounded-full flex-shrink-0 gap-1"
                >
                  {currentModel?.name || 'Select model'}
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[220px]">
                {models.map((model) => (
                  <DropdownMenuItem
                    key={model.id}
                    onClick={() => onModelChange(model.id)}
                    className={cn(
                      'flex items-center justify-between gap-2',
                      selectedModel === model.id && 'bg-primary/20'
                    )}
                  >
                    <span className={cn(
                      !model.is_cached && 'text-muted-foreground',
                      model.requires_approval && !model.is_cached && 'text-muted-foreground/50'
                    )}>
                      {model.name}
                    </span>
                    <div className="flex items-center gap-1">
                      {model.requires_approval && !model.is_cached && (
                        <Lock className="h-3 w-3 text-yellow-500 flex-shrink-0" />
                      )}
                      {model.is_cached ? (
                        <Check className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                      ) : (
                        <Download className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0" />
                      )}
                    </div>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {isLoading ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={onStop}
              className="h-8 w-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex-shrink-0"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSubmit}
              disabled={!message.trim() || disabled}
              className={cn(
                'h-8 w-8 rounded-full transition-colors flex-shrink-0',
                message.trim()
                  ? 'bg-primary hover:bg-primary/90 text-primary-foreground'
                  : 'bg-white/10 text-muted-foreground'
              )}
            >
              {disabled ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
