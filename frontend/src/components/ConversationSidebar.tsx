import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Trash2,
  Download,
  FileJson,
  FileText,
  Upload,
  Settings2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { formatDate, truncate } from '@/lib/utils'
import type { ConversationSummary } from '@/api/client'

interface ConversationSidebarProps {
  conversations: ConversationSummary[]
  currentId?: string
  onNew: () => void
  onSelect: (id: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  onExport: (id: string, format: 'json' | 'markdown') => void
  onImport: (file: File) => void
  onSystemPrompt: (id: string) => void
}

export function ConversationSidebar({
  conversations,
  currentId,
  onNew,
  onSelect,
  onRename,
  onDelete,
  onExport,
  onImport,
  onSystemPrompt,
}: ConversationSidebarProps) {
  const navigate = useNavigate()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const handleStartRename = (conv: ConversationSummary) => {
    setEditingId(conv.id)
    setEditingName(conv.name)
  }

  const handleFinishRename = () => {
    if (editingId && editingName.trim()) {
      onRename(editingId, editingName.trim())
    }
    setEditingId(null)
    setEditingName('')
  }

  const handleDelete = () => {
    if (deleteId) {
      onDelete(deleteId)
      setDeleteId(null)
      if (deleteId === currentId) {
        navigate('/chat')
      }
    }
  }

  const handleImportClick = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        onImport(file)
      }
    }
    input.click()
  }

  const deleteConv = conversations.find((c) => c.id === deleteId)

  return (
    <>
      <div className="w-64 border-r border-border flex flex-col h-full bg-card/30">
        {/* Header */}
        <div className="p-3 flex items-center gap-2">
          <Button
            onClick={onNew}
            className="flex-1 justify-start gap-2"
            variant="secondary"
          >
            <Plus className="h-4 w-4" />
            New Chat
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleImportClick}
            title="Import conversation"
          >
            <Upload className="h-4 w-4" />
          </Button>
        </div>

        <Separator />

        {/* Conversation list */}
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {conversations.length === 0 ? (
              <div className="text-center text-muted-foreground text-sm py-8">
                No conversations yet
              </div>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={cn(
                    'group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors',
                    conv.id === currentId
                      ? 'bg-primary/20 text-foreground'
                      : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => {
                    if (editingId !== conv.id) {
                      onSelect(conv.id)
                    }
                  }}
                >
                  <MessageSquare className="h-4 w-4 flex-shrink-0" />

                  <div className="flex-1 min-w-0">
                    {editingId === conv.id ? (
                      <Input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={handleFinishRename}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleFinishRename()
                          if (e.key === 'Escape') {
                            setEditingId(null)
                            setEditingName('')
                          }
                        }}
                        autoFocus
                        className="h-6 text-sm py-0 px-1"
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <>
                        <div className="text-sm font-medium truncate">
                          {truncate(conv.name, 24)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDate(conv.updated_at)}
                        </div>
                      </>
                    )}
                  </div>

                  {/* System prompt indicator */}
                  {conv.system_prompt && (
                    <div
                      className="h-1.5 w-1.5 rounded-full bg-primary flex-shrink-0"
                      title="Has system prompt"
                    />
                  )}

                  {/* Actions dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          'h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity',
                          conv.id === currentId && 'opacity-100'
                        )}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => handleStartRename(conv)}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onSystemPrompt(conv.id)}>
                        <Settings2 className="h-4 w-4 mr-2" />
                        System Prompt
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => onExport(conv.id, 'json')}>
                        <FileJson className="h-4 w-4 mr-2" />
                        Export JSON
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onExport(conv.id, 'markdown')}>
                        <FileText className="h-4 w-4 mr-2" />
                        Export Markdown
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setDeleteId(conv.id)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Conversation</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteConv?.name}"? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
