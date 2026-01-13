import { useQuery } from '@tanstack/react-query'
import {
  Settings,
  Info,
  Cpu,
  HardDrive,
  ExternalLink,
  Github,
  Heart,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import * as api from '@/api/client'

export function SettingsPage() {
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: api.getHealth,
  })

  const { data: models = [] } = useQuery({
    queryKey: ['models'],
    queryFn: api.getModels,
  })

  const { data: cacheStats } = useQuery({
    queryKey: ['cache-status'],
    queryFn: api.getCacheStatus,
  })

  return (
    <ScrollArea className="h-[calc(100vh-48px)]">
      <div className="max-w-2xl mx-auto p-8 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Settings className="h-6 w-6" />
            Settings
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure TextAile preferences and view system information
          </p>
        </div>

        <Separator />

        {/* Default Model */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium">Defaults</h2>

          <div className="space-y-2">
            <Label htmlFor="default-model">Default Model</Label>
            <Select defaultValue={models[0]?.id}>
              <SelectTrigger id="default-model">
                <SelectValue placeholder="Select default model" />
              </SelectTrigger>
              <SelectContent>
                {models.map((model) => (
                  <SelectItem key={model.id} value={model.id}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              This model will be used for new conversations
            </p>
          </div>

          <div className="space-y-2">
            <Label>Default Temperature: 0.7</Label>
            <Slider
              defaultValue={[0.7]}
              max={2}
              step={0.1}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Higher values make output more random, lower values more focused
            </p>
          </div>

          <div className="space-y-2">
            <Label>Default Max Tokens: 2048</Label>
            <Slider
              defaultValue={[2048]}
              min={256}
              max={8192}
              step={256}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Maximum length of generated responses
            </p>
          </div>
        </section>

        <Separator />

        {/* System Information */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium">System Information</h2>

          <div className="grid gap-4">
            {/* GPU Status */}
            <div className="bg-card rounded-lg p-4 border border-border">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    health?.gpu_available
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-yellow-500/20 text-yellow-400'
                  }`}
                >
                  <Cpu className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-medium">
                    {health?.gpu_available ? 'GPU Accelerated' : 'CPU Mode'}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {health?.gpu_name || 'No GPU detected'}
                  </div>
                </div>
              </div>
            </div>

            {/* Cache Status */}
            <div className="bg-card rounded-lg p-4 border border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/20 text-primary flex items-center justify-center">
                  <HardDrive className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-medium">Model Cache</div>
                  <div className="text-sm text-muted-foreground">
                    {cacheStats?.total_size_gb.toFixed(1) ?? '0'} GB used across{' '}
                    {cacheStats?.num_repos ?? 0} models
                  </div>
                </div>
              </div>
            </div>

            {/* Version */}
            <div className="bg-card rounded-lg p-4 border border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center">
                  <Info className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-medium">TextAile</div>
                  <div className="text-sm text-muted-foreground">
                    Version {health?.version ?? '1.0.0'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <Separator />

        {/* About */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium">About</h2>

          <div className="text-sm text-muted-foreground space-y-3">
            <p>
              TextAile is a local LLM chat interface inspired by HollyWool. It
              provides a ChatGPT/Claude-like experience for running language
              models locally on your machine.
            </p>
            <p>
              Built with FastAPI, React, and the HuggingFace Transformers library.
              Supports streaming responses and multiple model architectures.
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button variant="outline" size="sm" asChild>
              <a
                href="https://huggingface.co"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                HuggingFace Hub
              </a>
            </Button>
          </div>
        </section>

        {/* Footer */}
        <div className="pt-8 text-center text-xs text-muted-foreground">
          <p className="flex items-center justify-center gap-1">
            Made with <Heart className="h-3 w-3 text-red-400" /> for local AI
          </p>
        </div>
      </div>
    </ScrollArea>
  )
}
