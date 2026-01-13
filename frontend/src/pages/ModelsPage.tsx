import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Box,
  Download,
  Trash2,
  ExternalLink,
  HardDrive,
  Cpu,
  AlertCircle,
  CheckCircle,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import * as api from '@/api/client'

type CategoryFilter = 'all' | 'fast' | 'quality' | 'large' | 'specialized'
type StatusFilter = 'all' | 'cached' | 'not_cached'

const categoryLabels: Record<string, string> = {
  all: 'All Models',
  fast: 'Fast',
  quality: 'Quality',
  large: 'Large',
  specialized: 'Specialized',
}

export function ModelsPage() {
  const queryClient = useQueryClient()
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [deleteModelId, setDeleteModelId] = useState<string | null>(null)
  const [downloadingModels, setDownloadingModels] = useState<Set<string>>(new Set())

  // Queries
  const { data: models = [], isLoading } = useQuery({
    queryKey: ['models-detailed'],
    queryFn: api.getModelsDetailed,
    refetchInterval: 10000,
  })

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: api.getHealth,
    refetchInterval: 10000,
  })

  const { data: cacheStats } = useQuery({
    queryKey: ['cache-status'],
    queryFn: api.getCacheStatus,
    refetchInterval: 10000,
  })

  // Mutations
  const deleteCache = useMutation({
    mutationFn: api.deleteModelCache,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['models-detailed'] })
      queryClient.invalidateQueries({ queryKey: ['cache-status'] })
      setDeleteModelId(null)
    },
  })

  const downloadModel = useMutation({
    mutationFn: api.downloadModel,
    onMutate: (modelId) => {
      setDownloadingModels((prev) => new Set(prev).add(modelId))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['models-detailed'] })
      queryClient.invalidateQueries({ queryKey: ['cache-status'] })
    },
    onSettled: (_, __, modelId) => {
      setDownloadingModels((prev) => {
        const next = new Set(prev)
        next.delete(modelId)
        return next
      })
    },
  })

  // Filter models
  const filteredModels = models.filter((model) => {
    if (categoryFilter !== 'all' && model.category !== categoryFilter) {
      return false
    }
    if (statusFilter === 'cached' && !model.is_cached) {
      return false
    }
    if (statusFilter === 'not_cached' && model.is_cached) {
      return false
    }
    return true
  })

  // Group by category for display
  const modelsByCategory = filteredModels.reduce(
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

  const deleteModel = models.find((m) => m.id === deleteModelId)
  const cachedCount = models.filter((m) => m.is_cached).length

  return (
    <div className="h-[calc(100vh-48px)] flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold">Models</h1>
            <p className="text-sm text-muted-foreground">
              Browse and manage local LLM models
            </p>
          </div>

          {/* Cache stats */}
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-muted-foreground" />
              <span>
                {cacheStats?.total_size_gb.toFixed(1) ?? '0'} GB cached
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Box className="h-4 w-4 text-muted-foreground" />
              <span>{cachedCount} / {models.length} downloaded</span>
            </div>
            {health?.gpu_available ? (
              <div className="flex items-center gap-2 text-green-400">
                <Cpu className="h-4 w-4" />
                <span>{health.gpu_name}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-yellow-400">
                <AlertCircle className="h-4 w-4" />
                <span>CPU only</span>
              </div>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
            {(Object.keys(categoryLabels) as CategoryFilter[]).map((category) => (
              <Button
                key={category}
                variant="ghost"
                size="sm"
                className={cn(
                  'h-7 px-3 text-xs',
                  categoryFilter === category && 'bg-background shadow-sm'
                )}
                onClick={() => setCategoryFilter(category)}
              >
                {categoryLabels[category]}
              </Button>
            ))}
          </div>

          <Separator orientation="vertical" className="h-6" />

          <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
            {(['all', 'cached', 'not_cached'] as StatusFilter[]).map((status) => (
              <Button
                key={status}
                variant="ghost"
                size="sm"
                className={cn(
                  'h-7 px-3 text-xs',
                  statusFilter === status && 'bg-background shadow-sm'
                )}
                onClick={() => setStatusFilter(status)}
              >
                {status === 'all' && 'All'}
                {status === 'cached' && 'Downloaded'}
                {status === 'not_cached' && 'Not Downloaded'}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Model list */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredModels.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No models match your filters
            </div>
          ) : (
            Object.entries(modelsByCategory).map(([category, categoryModels]) => (
              <div key={category}>
                <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wide">
                  {categoryLabels[category] || category}
                </h2>
                {/* Responsive grid: 1 col on mobile, 2 on md, 3 on lg, 4 on xl */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {categoryModels.map((model) => {
                    const isDownloading = downloadingModels.has(model.id)

                    return (
                      <div
                        key={model.id}
                        className="bg-card rounded-xl p-4 border border-border hover:border-primary/50 transition-colors flex flex-col"
                      >
                        {/* Header with name and status */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 className="font-medium text-sm leading-tight">{model.name}</h3>
                          {model.is_cached ? (
                            <span className="flex-shrink-0 flex items-center gap-1 text-xs text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded">
                              <CheckCircle className="h-3 w-3" />
                            </span>
                          ) : isDownloading ? (
                            <span className="flex-shrink-0 flex items-center gap-1 text-xs text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                              <Loader2 className="h-3 w-3 animate-spin" />
                            </span>
                          ) : null}
                        </div>

                        {/* Description */}
                        <p className="text-xs text-muted-foreground mb-3 line-clamp-2 flex-1">
                          {model.description}
                        </p>

                        {/* Stats */}
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-3">
                          <span className="bg-muted px-1.5 py-0.5 rounded">
                            {model.is_cached && model.cache_size_gb
                              ? `${model.cache_size_gb} GB`
                              : `~${model.size_gb} GB`}
                          </span>
                          <span className="bg-muted px-1.5 py-0.5 rounded">
                            {(model.context_length / 1000).toFixed(0)}K ctx
                          </span>
                          {model.tags.slice(0, 2).map((tag) => (
                            <span
                              key={tag}
                              className="bg-primary/10 text-primary px-1.5 py-0.5 rounded"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>

                        {/* Badges */}
                        {model.requires_approval && (
                          <div className="mb-3">
                            <span className="text-xs text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded">
                              Requires HF approval
                            </span>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-2 mt-auto pt-2 border-t border-border">
                          {model.is_cached ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="flex-1 h-8 text-xs text-destructive hover:text-destructive"
                              onClick={() => setDeleteModelId(model.id)}
                              disabled={health?.current_model === model.id}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-1" />
                              Delete
                            </Button>
                          ) : (
                            <Button
                              variant="secondary"
                              size="sm"
                              className="flex-1 h-8 text-xs"
                              onClick={() => downloadModel.mutate(model.id)}
                              disabled={isDownloading || model.requires_approval}
                            >
                              {isDownloading ? (
                                <>
                                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                                  Downloading...
                                </>
                              ) : (
                                <>
                                  <Download className="h-3.5 w-3.5 mr-1" />
                                  Download
                                </>
                              )}
                            </Button>
                          )}
                          {model.requires_approval && model.approval_url && !model.is_cached && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs"
                              onClick={() => window.open(model.approval_url, '_blank')}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteModelId} onOpenChange={() => setDeleteModelId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Model Cache</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the cached files for "{deleteModel?.name}"?
              This will free up approximately {deleteModel?.cache_size_gb ?? deleteModel?.size_gb} GB.
              You'll need to download the model again to use it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteModelId(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteModelId && deleteCache.mutate(deleteModelId)}
              disabled={deleteCache.isPending}
            >
              {deleteCache.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
