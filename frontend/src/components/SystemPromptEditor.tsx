import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const PRESET_PROMPTS = [
  {
    id: 'helpful',
    name: 'Helpful Assistant',
    prompt: 'You are a helpful, harmless, and honest AI assistant. Answer questions accurately and concisely.',
  },
  {
    id: 'coding',
    name: 'Coding Expert',
    prompt: 'You are an expert programmer. Provide clean, well-documented code with clear explanations. Follow best practices and consider edge cases.',
  },
  {
    id: 'creative',
    name: 'Creative Writer',
    prompt: 'You are a creative writer with a vivid imagination. Craft engaging stories, poems, and creative content that captivates the reader.',
  },
  {
    id: 'tutor',
    name: 'Patient Tutor',
    prompt: 'You are a patient and encouraging tutor. Break down complex topics into simple explanations. Use examples and ask guiding questions to help the student understand.',
  },
  {
    id: 'analyst',
    name: 'Data Analyst',
    prompt: 'You are a data analyst. Provide thorough analysis with attention to detail. Present findings clearly and highlight key insights and recommendations.',
  },
  {
    id: 'concise',
    name: 'Concise Mode',
    prompt: 'Be extremely concise. Give short, direct answers without unnecessary elaboration. Skip pleasantries.',
  },
]

interface SystemPromptEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialPrompt?: string
  onSave: (prompt: string | null) => void
}

export function SystemPromptEditor({
  open,
  onOpenChange,
  initialPrompt = '',
  onSave,
}: SystemPromptEditorProps) {
  const [prompt, setPrompt] = useState(initialPrompt)

  useEffect(() => {
    setPrompt(initialPrompt)
  }, [initialPrompt, open])

  const handlePresetSelect = (presetId: string) => {
    const preset = PRESET_PROMPTS.find((p) => p.id === presetId)
    if (preset) {
      setPrompt(preset.prompt)
    }
  }

  const handleSave = () => {
    onSave(prompt.trim() || null)
    onOpenChange(false)
  }

  const handleClear = () => {
    setPrompt('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>System Prompt</DialogTitle>
          <DialogDescription>
            Set custom instructions for the AI. The system prompt helps guide the
            model's behavior and responses.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Preset selector */}
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">Presets:</span>
            <Select onValueChange={handlePresetSelect}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Load a preset..." />
              </SelectTrigger>
              <SelectContent>
                {PRESET_PROMPTS.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id}>
                    {preset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Prompt textarea */}
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Enter your system prompt here..."
            className="min-h-[200px] resize-y"
          />

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {prompt.length.toLocaleString()} characters
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              disabled={!prompt}
            >
              Clear
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
