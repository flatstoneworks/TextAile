import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Settings,
  Info,
  Cpu,
  HardDrive,
  ExternalLink,
  Heart,
  Bell,
  CheckCircle,
  AlertCircle,
  Loader2,
  Eye,
  EyeOff,
  Send,
  Trash2,
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
  const queryClient = useQueryClient()
  const [gotifyUrl, setGotifyUrl] = useState('')
  const [gotifyToken, setGotifyToken] = useState('')
  const [showToken, setShowToken] = useState(false)

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

  const { data: notificationConfig } = useQuery({
    queryKey: ['notification-config'],
    queryFn: api.getNotificationConfig,
  })

  const updateNotifications = useMutation({
    mutationFn: () => api.updateNotificationConfig(gotifyUrl, gotifyToken),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-config'] })
      setGotifyUrl('')
      setGotifyToken('')
    },
  })

  const deleteNotifications = useMutation({
    mutationFn: api.deleteNotificationConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-config'] })
    },
  })

  const testNotification = useMutation({
    mutationFn: () => api.sendTestNotification(),
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

        {/* Notifications */}
        <section className="space-y-4">
          <h2 className="text-lg font-medium flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notifications
          </h2>
          <p className="text-sm text-muted-foreground">
            Configure Gotify for push notifications from TextAile agents
          </p>

          {/* Current status */}
          <div className="bg-card rounded-lg p-4 border border-border">
            <div className="flex items-center gap-3">
              {notificationConfig?.gotify_configured ? (
                <>
                  <div className="w-10 h-10 rounded-lg bg-green-500/20 text-green-400 flex items-center justify-center">
                    <CheckCircle className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">Notifications Configured</div>
                    <div className="text-sm text-muted-foreground">
                      {notificationConfig.gotify_url}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => testNotification.mutate()}
                      disabled={testNotification.isPending}
                    >
                      {testNotification.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                      ) : (
                        <Send className="h-4 w-4 mr-1.5" />
                      )}
                      Test
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deleteNotifications.mutate()}
                      disabled={deleteNotifications.isPending}
                    >
                      {deleteNotifications.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                      ) : (
                        <Trash2 className="h-4 w-4 mr-1.5" />
                      )}
                      Remove
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-10 h-10 rounded-lg bg-muted text-muted-foreground flex items-center justify-center">
                    <AlertCircle className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-medium">Not Configured</div>
                    <div className="text-sm text-muted-foreground">
                      Enter your Gotify server details below
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Configuration form */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="gotify-url">Gotify Server URL</Label>
              <input
                id="gotify-url"
                type="text"
                value={gotifyUrl}
                onChange={(e) => setGotifyUrl(e.target.value)}
                placeholder="http://spark.local:8070"
                className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="gotify-token">App Token</Label>
              <div className="relative">
                <input
                  id="gotify-token"
                  type={showToken ? 'text' : 'password'}
                  value={gotifyToken}
                  onChange={(e) => setGotifyToken(e.target.value)}
                  placeholder="Enter Gotify app token"
                  className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showToken ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Create an app token in Gotify: Apps → Create Application
              </p>
            </div>

            <Button
              onClick={() => updateNotifications.mutate()}
              disabled={!gotifyUrl || !gotifyToken || updateNotifications.isPending}
              className="w-full"
            >
              {updateNotifications.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Save Notification Settings
            </Button>

            {updateNotifications.isError && (
              <p className="text-sm text-red-400">
                {(updateNotifications.error as Error).message}
              </p>
            )}
            {testNotification.isSuccess && (
              <p className="text-sm text-green-400">Test notification sent</p>
            )}
            {testNotification.isError && (
              <p className="text-sm text-red-400">
                {(testNotification.error as Error).message}
              </p>
            )}
          </div>
        </section>

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
