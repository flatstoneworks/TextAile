import { memo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import type { Message } from '@/api/client'

interface ChatMessageProps {
  message: Message
  isStreaming?: boolean
  isLastInInteraction?: boolean
}

export const ChatMessage = memo(function ChatMessage({
  message,
  isStreaming = false,
  isLastInInteraction = false,
}: ChatMessageProps) {
  const isUser = message.role === 'user'

  if (isUser) {
    // User message: right-aligned bubble
    return (
      <div className={cn('px-4 pt-2 pb-1 flex justify-end')}>
        <div className="max-w-[85%]">
          <div className="bg-[#2a2a2a] rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed">
            {message.content}
          </div>
        </div>
      </div>
    )
  }

  // Assistant message: left-aligned, no bubble
  return (
    <div className={cn('px-4 pt-1', isLastInInteraction ? 'pb-8' : 'pb-2')}>
      <div
        className={cn(
          'message-content prose prose-invert max-w-none text-[15px] leading-relaxed',
          isStreaming && 'streaming-cursor'
        )}
      >
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
          components={{
            pre: ({ children, ...props }) => (
              <PreBlock {...props}>{children}</PreBlock>
            ),
            code: ({ className, children, ...props }) => {
              const isInline = !className
              if (isInline) {
                return <code {...props}>{children}</code>
              }
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              )
            },
          }}
        >
          {message.content || ' '}
        </ReactMarkdown>
      </div>
    </div>
  )
})

function PreBlock({
  children,
  ...props
}: React.HTMLAttributes<HTMLPreElement>) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    // Extract text content from children
    const codeElement = (children as React.ReactElement)?.props?.children
    if (typeof codeElement === 'string') {
      navigator.clipboard.writeText(codeElement)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="relative group">
      <pre {...props}>{children}</pre>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={handleCopy}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-green-400" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </Button>
    </div>
  )
}
