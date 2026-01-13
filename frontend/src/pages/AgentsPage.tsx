import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
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
  ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import * as api from '@/api/client'
import type { RunStatus } from '@/api/client'

type FilterStatus = 'all' | 'enabled' | 'disabled'

export function AgentsPage() {
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all')
  const [runningAgents, setRunningAgents] = useState<Set<string>>(new Set())

  // Query for agents
  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['agents'],
    queryFn: api.getAgents,
    refetchInterval: 5000,
  })

  // Trigger run mutation
  const triggerRun = useMutation({
    mutationFn: api.triggerAgentRun,
    onMutate: (agentId) => {
      setRunningAgents((prev) => new Set(prev).add(agentId))
    },
    onSettled: (_, __, agentId) => {
      // Keep running indicator for a bit longer to show progress
      setTimeout(() => {
        setRunningAgents((prev) => {
          const next = new Set(prev)
          next.delete(agentId)
          return next
        })
      }, 2000)
      queryClient.invalidateQueries({ queryKey: ['agents'] })
    },
  })

  // Filter agents
  const filteredAgents = agents.filter((agent) => {
    if (statusFilter === 'all') return true
    if (statusFilter === 'enabled') return agent.enabled
    if (statusFilter === 'disabled') return !agent.enabled
    return true
  })

  // Stats
  const enabledCount = agents.filter((a) => a.enabled).length
  const scheduledCount = agents.filter((a) => a.schedule).length
  const totalRuns = agents.reduce((sum, a) => sum + a.total_runs, 0)

  const getStatusIcon = (status: RunStatus | null) => {
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

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never'
    const date = new Date(dateStr)
    return date.toLocaleString()
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

  if (isLoading) {
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
          <h1 className="text-2xl font-semibold mb-2">Agents</h1>
          <p className="text-muted-foreground mb-4">
            Autonomous tasks that fetch data, process with LLM, and send notifications
          </p>

          {/* Stats */}
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-muted-foreground" />
              <span>{agents.length} agents</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span>{enabledCount} enabled</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              <span>{scheduledCount} scheduled</span>
            </div>
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span>{totalRuns} total runs</span>
            </div>
          </div>

          {/* Filter buttons */}
          <div className="flex items-center gap-2 mt-4">
            {(['all', 'enabled', 'disabled'] as FilterStatus[]).map((filter) => (
              <Button
                key={filter}
                variant={statusFilter === filter ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setStatusFilter(filter)}
                className="capitalize"
              >
                {filter}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Agent list */}
      <ScrollArea className="flex-1">
        <div className="max-w-5xl mx-auto p-6">
          {filteredAgents.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {agents.length === 0 ? (
                <div className="space-y-2">
                  <p>No agents configured</p>
                  <p className="text-sm">Add agents to backend/agents.yaml</p>
                </div>
              ) : (
                <p>No agents match the current filter</p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {filteredAgents.map((agent) => {
                const isRunning = runningAgents.has(agent.id) || agent.last_status === 'running'
                const nextRunText = formatNextRun(agent.next_run)

                return (
                  <div
                    key={agent.id}
                    className={cn(
                      'bg-card rounded-xl p-5 border transition-colors',
                      agent.enabled
                        ? 'border-border hover:border-primary/50'
                        : 'border-border/50 opacity-60'
                    )}
                  >
                    <div className="flex items-start justify-between gap-4">
                      {/* Agent info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <Bot className="h-5 w-5 text-primary flex-shrink-0" />
                          <h3 className="font-medium truncate">{agent.name}</h3>
                          {!agent.enabled && (
                            <span className="text-xs bg-muted px-2 py-0.5 rounded">
                              Disabled
                            </span>
                          )}
                        </div>

                        <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                          {agent.description}
                        </p>

                        {/* Meta info */}
                        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                          {agent.schedule && (
                            <div className="flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5" />
                              <span className="font-mono">{agent.schedule}</span>
                              {nextRunText && (
                                <span className="text-primary">({nextRunText})</span>
                              )}
                            </div>
                          )}

                          <div className="flex items-center gap-1.5">
                            <FileText className="h-3.5 w-3.5" />
                            <span>{agent.source_count} sources</span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {getStatusIcon(agent.last_status)}
                            <span>
                              {agent.total_runs > 0
                                ? `${agent.total_runs} runs`
                                : 'No runs yet'}
                            </span>
                          </div>

                          {agent.last_run && (
                            <div className="flex items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5" />
                              <span>Last: {formatDate(agent.last_run)}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => triggerRun.mutate(agent.id)}
                          disabled={isRunning || !agent.enabled}
                        >
                          {isRunning ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                          ) : (
                            <Play className="h-4 w-4 mr-1.5" />
                          )}
                          {isRunning ? 'Running...' : 'Run Now'}
                        </Button>

                        <Link to={`/agents/${agent.id}`}>
                          <Button variant="ghost" size="sm">
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </Link>
                      </div>
                    </div>

                    {/* Error message if last run failed */}
                    {agent.last_status === 'failed' && (
                      <div className="mt-3 p-2 bg-red-500/10 rounded text-xs text-red-400 flex items-center gap-2">
                        <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                        <span>Last run failed - check run history for details</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
