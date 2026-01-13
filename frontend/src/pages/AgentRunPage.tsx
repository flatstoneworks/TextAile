import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import {
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Calendar,
  FileText,
  ArrowLeft,
  Timer,
  Zap,
  Globe,
  Search,
  File,
  Wrench,
  Bell,
  BellOff,
  Copy,
  Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import * as api from '@/api/client'
import type { RunStatus, TriggerType, SourceType } from '@/api/client'
import { useState } from 'react'

export function AgentRunPage() {
  const { agentId, runId } = useParams<{ agentId: string; runId: string }>()
  const [copied, setCopied] = useState(false)

  // Query for run details
  const { data: runDetail, isLoading } = useQuery({
    queryKey: ['agent-run', agentId, runId],
    queryFn: () => api.getAgentRun(agentId!, runId!),
    enabled: !!agentId && !!runId,
    refetchInterval: (query) => {
      // Keep polling if still running
      const status = query.state.data?.meta.status
      return status === 'running' || status === 'pending' ? 2000 : false
    },
  })

  const getStatusIcon = (status: RunStatus) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case 'running':
        return <Loader2 className="h-5 w-5 animate-spin text-primary" />
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-500" />
      case 'pending':
        return <Clock className="h-5 w-5 text-amber-500" />
      default:
        return <div className="h-5 w-5 rounded-full bg-muted-foreground/30" />
    }
  }

  const getStatusText = (status: RunStatus) => {
    switch (status) {
      case 'completed':
        return 'Completed'
      case 'running':
        return 'Running'
      case 'failed':
        return 'Failed'
      case 'pending':
        return 'Pending'
    }
  }

  const getTriggerIcon = (trigger: TriggerType) => {
    switch (trigger) {
      case 'scheduled':
        return <Calendar className="h-4 w-4" />
      case 'manual':
        return <Zap className="h-4 w-4 text-amber-500" />
    }
  }

  const getSourceIcon = (type: SourceType) => {
    switch (type) {
      case 'fetch':
        return <Globe className="h-3.5 w-3.5" />
      case 'brave':
        return <Search className="h-3.5 w-3.5" />
      case 'file':
        return <File className="h-3.5 w-3.5" />
      case 'mcp':
        return <Wrench className="h-3.5 w-3.5" />
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString()
  }

  const formatDuration = (ms: number | null) => {
    if (!ms) return '-'
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
  }

  const handleCopyLink = async () => {
    const url = window.location.href
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (isLoading || !runDetail) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const { meta, report } = runDetail

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-6 border-b border-border">
        <div className="max-w-5xl mx-auto">
          {/* Back link */}
          <Link
            to={`/agents/${agentId}`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to {meta.agent_name}
          </Link>

          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                {getStatusIcon(meta.status)}
                <h1 className="text-xl font-semibold">{getStatusText(meta.status)}</h1>
                <span className="font-mono text-sm text-muted-foreground">
                  {meta.run_id}
                </span>
              </div>

              {/* Meta info */}
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  {getTriggerIcon(meta.trigger)}
                  <span className="capitalize">{meta.trigger}</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4" />
                  <span>{formatDate(meta.started_at)}</span>
                </div>

                {meta.duration_ms && (
                  <div className="flex items-center gap-1.5">
                    <Timer className="h-4 w-4" />
                    <span>{formatDuration(meta.duration_ms)}</span>
                  </div>
                )}

                <div className="flex items-center gap-1.5">
                  {meta.notification_sent ? (
                    <Bell className="h-4 w-4 text-green-500" />
                  ) : (
                    <BellOff className="h-4 w-4" />
                  )}
                  <span>{meta.notification_sent ? 'Notified' : 'No notification'}</span>
                </div>
              </div>
            </div>

            <Button variant="outline" size="sm" onClick={handleCopyLink}>
              {copied ? (
                <Check className="h-4 w-4 mr-1.5 text-green-500" />
              ) : (
                <Copy className="h-4 w-4 mr-1.5" />
              )}
              {copied ? 'Copied!' : 'Copy Link'}
            </Button>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="max-w-5xl mx-auto p-6">
          {meta.error && (
            <div className="mb-6 p-4 bg-red-500/10 rounded-lg border border-red-500/30">
              <div className="flex items-center gap-2 text-red-400 mb-2">
                <AlertCircle className="h-5 w-5" />
                <span className="font-medium">Error</span>
              </div>
              <p className="text-sm text-red-300">{meta.error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Sidebar with sources and LLM info */}
            <div className="lg:col-span-1 space-y-6">
              {/* Sources */}
              <div>
                <h2 className="text-sm font-medium mb-3">Sources</h2>
                <div className="space-y-2">
                  {meta.sources.map((source, i) => (
                    <div
                      key={i}
                      className={cn(
                        'bg-card rounded-lg p-3 border',
                        source.status === 'ok' ? 'border-green-500/30' : 'border-red-500/30'
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {getSourceIcon(source.type)}
                        <span className="text-sm font-medium truncate">{source.label}</span>
                        {source.status === 'ok' ? (
                          <CheckCircle className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {source.status === 'ok'
                          ? `${source.chars.toLocaleString()} chars`
                          : source.error || 'Failed'}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* LLM Usage */}
              {meta.llm && (
                <div>
                  <h2 className="text-sm font-medium mb-3">LLM Usage</h2>
                  <div className="bg-card rounded-lg p-3 border border-border space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Model</span>
                      <span className="font-mono">{meta.llm.model}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Input</span>
                      <span>{meta.llm.input_tokens.toLocaleString()} tokens</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Output</span>
                      <span>{meta.llm.output_tokens.toLocaleString()} tokens</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Output info */}
              {meta.output && (
                <div>
                  <h2 className="text-sm font-medium mb-3">Output</h2>
                  <div className="bg-card rounded-lg p-3 border border-border">
                    <div className="flex items-center gap-2 mb-1">
                      <FileText className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">Report</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {meta.output.chars.toLocaleString()} characters
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Report content */}
            <div className="lg:col-span-3">
              <h2 className="text-sm font-medium mb-3">Report</h2>
              {report ? (
                <div className="bg-card rounded-lg border border-border p-6 prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeHighlight]}
                    components={{
                      // Custom styling for markdown elements
                      h1: ({ children }) => (
                        <h1 className="text-2xl font-bold mb-4 mt-0 pb-2 border-b border-border">
                          {children}
                        </h1>
                      ),
                      h2: ({ children }) => (
                        <h2 className="text-xl font-semibold mb-3 mt-6">{children}</h2>
                      ),
                      h3: ({ children }) => (
                        <h3 className="text-lg font-medium mb-2 mt-4">{children}</h3>
                      ),
                      p: ({ children }) => (
                        <p className="mb-3 leading-relaxed">{children}</p>
                      ),
                      ul: ({ children }) => (
                        <ul className="list-disc list-inside mb-3 space-y-1">{children}</ul>
                      ),
                      ol: ({ children }) => (
                        <ol className="list-decimal list-inside mb-3 space-y-1">{children}</ol>
                      ),
                      li: ({ children }) => <li className="ml-2">{children}</li>,
                      blockquote: ({ children }) => (
                        <blockquote className="border-l-4 border-primary/50 pl-4 italic text-muted-foreground">
                          {children}
                        </blockquote>
                      ),
                      code: ({ className, children }) => {
                        const isInline = !className
                        return isInline ? (
                          <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">
                            {children}
                          </code>
                        ) : (
                          <code className={cn('block p-4 rounded-lg bg-muted overflow-x-auto', className)}>
                            {children}
                          </code>
                        )
                      },
                      a: ({ href, children }) => (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          {children}
                        </a>
                      ),
                      hr: () => <hr className="my-6 border-border" />,
                    }}
                  >
                    {report}
                  </ReactMarkdown>
                </div>
              ) : meta.status === 'running' || meta.status === 'pending' ? (
                <div className="bg-card rounded-lg border border-border p-12 flex flex-col items-center justify-center text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                  <p className="text-muted-foreground">Generating report...</p>
                </div>
              ) : (
                <div className="bg-card rounded-lg border border-border p-12 flex flex-col items-center justify-center text-center">
                  <FileText className="h-12 w-12 text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">No report available</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
