import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Bot,
  Play,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Calendar,
  FileText,
  ArrowLeft,
  ChevronRight,
  Timer,
  Zap,
  Globe,
  Search,
  File,
  Wrench,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import * as api from '@/api/client'
import type { RunStatus, TriggerType, SourceType } from '@/api/client'

export function AgentDetailPage() {
  const { agentId } = useParams<{ agentId: string }>()
  const queryClient = useQueryClient()
  const [isRunning, setIsRunning] = useState(false)

  // Query for agent info
  const { data: agent, isLoading: agentLoading } = useQuery({
    queryKey: ['agent', agentId],
    queryFn: () => api.getAgent(agentId!),
    enabled: !!agentId,
    refetchInterval: 5000,
  })

  // Query for agent config
  const { data: config } = useQuery({
    queryKey: ['agent-config', agentId],
    queryFn: () => api.getAgentConfig(agentId!),
    enabled: !!agentId,
  })

  // Query for runs
  const { data: runs = [], isLoading: runsLoading } = useQuery({
    queryKey: ['agent-runs', agentId],
    queryFn: () => api.getAgentRuns(agentId!),
    enabled: !!agentId,
    refetchInterval: 5000,
  })

  // Trigger run mutation
  const triggerRun = useMutation({
    mutationFn: api.triggerAgentRun,
    onMutate: () => setIsRunning(true),
    onSettled: () => {
      setTimeout(() => setIsRunning(false), 2000)
      queryClient.invalidateQueries({ queryKey: ['agent', agentId] })
      queryClient.invalidateQueries({ queryKey: ['agent-runs', agentId] })
    },
  })

  const getStatusIcon = (status: RunStatus) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'running':
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />
      case 'pending':
        return <Clock className="h-4 w-4 text-amber-500" />
      default:
        return <div className="h-4 w-4 rounded-full bg-muted-foreground/30" />
    }
  }

  const getTriggerIcon = (trigger: TriggerType) => {
    switch (trigger) {
      case 'scheduled':
        return <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
      case 'manual':
        return <Zap className="h-3.5 w-3.5 text-amber-500" />
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

  const formatNextRun = (dateStr: string | null) => {
    if (!dateStr) return null
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = date.getTime() - now.getTime()

    if (diffMs < 0) return 'Overdue'

    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))

    if (diffHours > 24) {
      return `in ${Math.floor(diffHours / 24)}d ${diffHours % 24}h`
    }
    if (diffHours > 0) {
      return `in ${diffHours}h ${diffMins}m`
    }
    return `in ${diffMins}m`
  }

  if (agentLoading || !agent) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-6 border-b border-border">
        <div className="max-w-5xl mx-auto">
          {/* Back link */}
          <Link
            to="/agents"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Agents
          </Link>

          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Bot className="h-6 w-6 text-primary" />
                <h1 className="text-2xl font-semibold">{agent.name}</h1>
                {!agent.enabled && (
                  <span className="text-xs bg-muted px-2 py-0.5 rounded">Disabled</span>
                )}
              </div>
              <p className="text-muted-foreground">{agent.description}</p>
            </div>

            <Button
              onClick={() => triggerRun.mutate(agentId!)}
              disabled={isRunning || !agent.enabled}
            >
              {isRunning ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              {isRunning ? 'Running...' : 'Run Now'}
            </Button>
          </div>

          {/* Stats */}
          <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-muted-foreground">
            {agent.schedule && (
              <div className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                <span className="font-mono">{agent.schedule}</span>
                {agent.next_run && (
                  <span className="text-primary">({formatNextRun(agent.next_run)})</span>
                )}
              </div>
            )}

            <div className="flex items-center gap-1.5">
              <FileText className="h-4 w-4" />
              <span>{agent.source_count} sources</span>
            </div>

            <div className="flex items-center gap-1.5">
              <Timer className="h-4 w-4" />
              <span>{agent.total_runs} total runs</span>
            </div>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="max-w-5xl mx-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Sources panel */}
            <div className="lg:col-span-1">
              <h2 className="text-lg font-medium mb-4">Sources</h2>
              <div className="space-y-3">
                {config?.sources.map((source, i) => (
                  <div
                    key={i}
                    className="bg-card rounded-lg p-3 border border-border"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {getSourceIcon(source.type)}
                      <span className="font-medium text-sm">
                        {source.label || `Source ${i + 1}`}
                      </span>
                      <span className="text-xs bg-muted px-1.5 py-0.5 rounded">
                        {source.type}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {source.url || source.query || source.path || source.tool}
                    </p>
                  </div>
                ))}
              </div>

              {/* Prompt preview */}
              {config?.prompt && (
                <div className="mt-6">
                  <h2 className="text-lg font-medium mb-4">Prompt</h2>
                  <div className="bg-card rounded-lg p-3 border border-border">
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-6">
                      {config.prompt}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Run history */}
            <div className="lg:col-span-2">
              <h2 className="text-lg font-medium mb-4">Run History</h2>

              {runsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : runs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No runs yet</p>
                  <p className="text-sm mt-1">Click "Run Now" to trigger the first run</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {runs.map((run) => (
                    <Link
                      key={run.run_id}
                      to={`/agents/${agentId}/runs/${run.run_id}`}
                      className={cn(
                        'block bg-card rounded-lg p-4 border border-border',
                        'hover:border-primary/50 transition-colors'
                      )}
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                          {getStatusIcon(run.status)}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm truncate">
                                {run.run_id}
                              </span>
                              {getTriggerIcon(run.trigger)}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                              <span>{formatDate(run.started_at)}</span>
                              {run.duration_ms && (
                                <span>{formatDuration(run.duration_ms)}</span>
                              )}
                              {run.output_chars > 0 && (
                                <span>{run.output_chars.toLocaleString()} chars</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      </div>

                      {run.error && (
                        <div className="mt-2 p-2 bg-red-500/10 rounded text-xs text-red-400 flex items-center gap-2">
                          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="truncate">{run.error}</span>
                        </div>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
