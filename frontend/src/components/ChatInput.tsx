import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { Send, Square, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ChatInputProps {
  onSend: (message: string) => void
  onStop?: () => void
  isLoading?: boolean
  disabled?: boolean
  placeholder?: string
}

export function ChatInput({
  onSend,
  onStop,
  isLoading = false,
  disabled = false,
  placeholder = 'Type your message...',
}: ChatInputProps) {
  const [message, setMessage] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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
    <div className="p-4 border-t border-border">
      <div className="max-w-3xl mx-auto">
        <div className="relative flex items-end gap-2 bg-muted/50 rounded-xl p-2">
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
              'placeholder:text-muted-foreground px-2 py-1.5',
              'min-h-[36px] max-h-[200px]',
              'scrollbar-thin'
            )}
          />

          {isLoading ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={onStop}
              className="h-9 w-9 rounded-lg bg-destructive/20 hover:bg-destructive/30 text-destructive"
            >
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSubmit}
              disabled={!message.trim() || disabled}
              className={cn(
                'h-9 w-9 rounded-lg transition-colors',
                message.trim()
                  ? 'bg-primary hover:bg-primary/90 text-primary-foreground'
                  : 'text-muted-foreground'
              )}
            >
              {disabled ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>

        <div className="flex items-center justify-between mt-2 px-2 text-xs text-muted-foreground">
          <span>Press Enter to send, Shift+Enter for new line</span>
          <span>{message.length.toLocaleString()} characters</span>
        </div>
      </div>
    </div>
  )
}
