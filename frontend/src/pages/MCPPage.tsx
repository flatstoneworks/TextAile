import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plug,
  PlugZap,
  Server,
  Wrench,
  AlertCircle,
  CheckCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Key,
  Eye,
  EyeOff,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import * as api from '@/api/client'
import type { MCPConnectionStatus, MCPSecretStatus } from '@/api/client'

type FilterStatus = 'all' | 'connected' | 'disconnected'

export function MCPPage() {
  const queryClient = useQueryClient()
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all')
  const [expandedServer, setExpandedServer] = useState<string | null>(null)
  const [connectingServers, setConnectingServers] = useState<Set<string>>(new Set())
  const [configuringServer, setConfiguringServer] = useState<string | null>(null)
  const [secretInputs, setSecretInputs] = useState<Record<string, string>>({})
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({})

  // Query for MCP servers
  const { data: servers = [], isLoading } = useQuery({
    queryKey: ['mcp-servers'],
    queryFn: api.getMCPServers,
    refetchInterval: 5000,
  })

  // Query for tools
  const { data: tools = [] } = useQuery({
    queryKey: ['mcp-tools'],
    queryFn: api.getMCPTools,
    refetchInterval: 5000,
  })

  // Connect mutation
  const connectServer = useMutation({
    mutationFn: api.connectMCPServer,
    onMutate: (serverId) => {
      setConnectingServers((prev) => new Set(prev).add(serverId))
    },
    onSettled: (_, __, serverId) => {
      setConnectingServers((prev) => {
        const next = new Set(prev)
        next.delete(serverId)
        return next
      })
      queryClient.invalidateQueries({ queryKey: ['mcp-servers'] })
      queryClient.invalidateQueries({ queryKey: ['mcp-tools'] })
    },
  })

  // Disconnect mutation
  const disconnectServer = useMutation({
    mutationFn: api.disconnectMCPServer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-servers'] })
      queryClient.invalidateQueries({ queryKey: ['mcp-tools'] })
    },
  })

  // Set secret mutation
  const setSecret = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) => api.setMCPSecret(key, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-servers'] })
    },
  })

  // Filter servers
  const filteredServers = servers.filter((server) => {
    if (statusFilter === 'all') return true
    if (statusFilter === 'connected') return server.status === 'connected'
    if (statusFilter === 'disconnected') return server.status !== 'connected'
    return true
  })

  // Stats
  const connectedCount = servers.filter((s) => s.status === 'connected').length
  const totalTools = tools.length

  const getStatusIcon = (status: MCPConnectionStatus, isConnecting: boolean) => {
    if (isConnecting) {
      return <Loader2 className="h-4 w-4 animate-spin text-primary" />
    }
    switch (status) {
      case 'connected':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'connecting':
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />
      default:
        return <div className="h-4 w-4 rounded-full bg-muted-foreground/30" />
    }
  }

  const getStatusText = (status: MCPConnectionStatus) => {
    switch (status) {
      case 'connected':
        return 'Connected'
      case 'connecting':
        return 'Connecting...'
      case 'error':
        return 'Error'
      default:
        return 'Disconnected'
    }
  }

  const handleSaveSecret = async (secret: MCPSecretStatus) => {
    const value = secretInputs[secret.key]
    if (!value?.trim()) return

    await setSecret.mutateAsync({ key: secret.key, value: value.trim() })
    setSecretInputs((prev) => ({ ...prev, [secret.key]: '' }))
  }

  const hasUnconfiguredSecrets = (secrets: MCPSecretStatus[]) => {
    return secrets.some((s) => !s.configured)
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
          <h1 className="text-2xl font-semibold mb-2">MCP Servers</h1>
          <p className="text-muted-foreground mb-4">
            Connect to Model Context Protocol servers to extend AI capabilities with external tools
          </p>

          {/* Stats */}
          <div className="flex items-center gap-6 text-sm">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-muted-foreground" />
              <span>{servers.length} servers configured</span>
            </div>
            <div className="flex items-center gap-2">
              <PlugZap className="h-4 w-4 text-green-500" />
              <span>{connectedCount} connected</span>
            </div>
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-primary" />
              <span>{totalTools} tools available</span>
            </div>
          </div>

          {/* Filter buttons */}
          <div className="flex items-center gap-2 mt-4">
            {(['all', 'connected', 'disconnected'] as FilterStatus[]).map((filter) => (
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

      {/* Server list */}
      <ScrollArea className="flex-1">
        <div className="max-w-5xl mx-auto p-6">
          {filteredServers.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {servers.length === 0 ? (
                <p>No MCP servers configured. Add servers to mcp_config.yaml</p>
              ) : (
                <p>No servers match the current filter</p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredServers.map((server) => {
                const isConnecting = connectingServers.has(server.id)
                const isExpanded = expandedServer === server.id
                const isConfiguring = configuringServer === server.id
                const needsSecrets = hasUnconfiguredSecrets(server.required_secrets || [])

                return (
                  <div
                    key={server.id}
                    className={cn(
                      'bg-card rounded-xl p-4 border transition-colors',
                      server.status === 'connected'
                        ? 'border-green-500/30'
                        : 'border-border hover:border-primary/50'
                    )}
                  >
                    {/* Server header */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {getStatusIcon(server.status, isConnecting)}
                        <div className="min-w-0">
                          <h3 className="font-medium truncate">{server.name}</h3>
                          <p className="text-xs text-muted-foreground">
                            {getStatusText(isConnecting ? 'connecting' : server.status)}
                            {server.status === 'connected' && ` - ${server.tool_count} tools`}
                          </p>
                        </div>
                      </div>

                      {/* Type badge */}
                      <span className="text-xs bg-muted px-2 py-0.5 rounded flex-shrink-0">
                        {server.type}
                      </span>
                    </div>

                    {/* Description */}
                    <p className="text-sm text-muted-foreground mt-3 line-clamp-2">
                      {server.description}
                    </p>

                    {/* Required secrets warning */}
                    {needsSecrets && !isConfiguring && (
                      <div className="mt-3 p-2 bg-amber-500/10 rounded text-xs text-amber-400 flex items-center gap-2">
                        <Key className="h-3.5 w-3.5 flex-shrink-0" />
                        <span>API key required</span>
                      </div>
                    )}

                    {/* Secrets configuration panel */}
                    {isConfiguring && server.required_secrets && server.required_secrets.length > 0 && (
                      <div className="mt-3 p-3 bg-muted/50 rounded-lg space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">Configure API Keys</span>
                          <button
                            onClick={() => setConfiguringServer(null)}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        {server.required_secrets.map((secret) => (
                          <div key={secret.key} className="space-y-1.5">
                            <label className="text-xs text-muted-foreground flex items-center gap-2">
                              {secret.name}
                              {secret.configured && (
                                <CheckCircle className="h-3 w-3 text-green-500" />
                              )}
                            </label>
                            {secret.description && (
                              <p className="text-xs text-muted-foreground/70">{secret.description}</p>
                            )}
                            <div className="flex gap-2">
                              <div className="relative flex-1">
                                <input
                                  type={showSecrets[secret.key] ? 'text' : 'password'}
                                  value={secretInputs[secret.key] || ''}
                                  onChange={(e) =>
                                    setSecretInputs((prev) => ({
                                      ...prev,
                                      [secret.key]: e.target.value,
                                    }))
                                  }
                                  placeholder={secret.configured ? '••••••••' : 'Enter API key'}
                                  className="w-full bg-background border border-border rounded px-2 py-1.5 text-sm pr-8"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    setShowSecrets((prev) => ({
                                      ...prev,
                                      [secret.key]: !prev[secret.key],
                                    }))
                                  }
                                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                >
                                  {showSecrets[secret.key] ? (
                                    <EyeOff className="h-3.5 w-3.5" />
                                  ) : (
                                    <Eye className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              </div>
                              <Button
                                size="sm"
                                onClick={() => handleSaveSecret(secret)}
                                disabled={!secretInputs[secret.key]?.trim() || setSecret.isPending}
                              >
                                {setSecret.isPending ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  'Save'
                                )}
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Error message */}
                    {server.status === 'error' && server.error_message && (
                      <div className="mt-3 p-2 bg-red-500/10 rounded text-xs text-red-400">
                        {server.error_message}
                      </div>
                    )}

                    {/* Tools list (expandable) */}
                    {server.status === 'connected' && server.tools.length > 0 && (
                      <div className="mt-3">
                        <button
                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => setExpandedServer(isExpanded ? null : server.id)}
                        >
                          {isExpanded ? (
                            <ChevronUp className="h-3 w-3" />
                          ) : (
                            <ChevronDown className="h-3 w-3" />
                          )}
                          {server.tools.length} tools
                        </button>

                        {isExpanded && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {server.tools.map((tool) => (
                              <span
                                key={tool}
                                className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded"
                              >
                                {tool}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="mt-4 flex justify-end gap-2">
                      {/* Configure button for servers with secrets */}
                      {server.required_secrets && server.required_secrets.length > 0 && !isConfiguring && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setConfiguringServer(server.id)}
                        >
                          <Key className="h-3.5 w-3.5 mr-1.5" />
                          Configure
                        </Button>
                      )}

                      {server.status === 'connected' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => disconnectServer.mutate(server.id)}
                          disabled={disconnectServer.isPending}
                        >
                          {disconnectServer.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                          ) : (
                            <Plug className="h-3.5 w-3.5 mr-1.5" />
                          )}
                          Disconnect
                        </Button>
                      ) : (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => connectServer.mutate(server.id)}
                          disabled={isConnecting || !server.enabled || needsSecrets}
                          title={needsSecrets ? 'Configure API key first' : undefined}
                        >
                          {isConnecting ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                          ) : (
                            <PlugZap className="h-3.5 w-3.5 mr-1.5" />
                          )}
                          {isConnecting ? 'Connecting...' : 'Connect'}
                        </Button>
                      )}
                    </div>
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
