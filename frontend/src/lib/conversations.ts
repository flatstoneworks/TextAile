/**
 * Conversation utilities and local state management
 */

const STORAGE_KEYS = {
  DRAFT_PREFIX: 'textaile_draft_',
  LAST_CONVERSATION: 'textaile_last_conversation',
  SETTINGS: 'textaile_settings',
}

/**
 * Save a draft message for a conversation
 */
export function saveDraft(conversationId: string, content: string): void {
  if (content.trim()) {
    localStorage.setItem(STORAGE_KEYS.DRAFT_PREFIX + conversationId, content)
  } else {
    localStorage.removeItem(STORAGE_KEYS.DRAFT_PREFIX + conversationId)
  }
}

/**
 * Get a saved draft for a conversation
 */
export function getDraft(conversationId: string): string {
  return localStorage.getItem(STORAGE_KEYS.DRAFT_PREFIX + conversationId) || ''
}

/**
 * Clear a draft
 */
export function clearDraft(conversationId: string): void {
  localStorage.removeItem(STORAGE_KEYS.DRAFT_PREFIX + conversationId)
}

/**
 * Save the last active conversation ID
 */
export function saveLastConversation(conversationId: string): void {
  localStorage.setItem(STORAGE_KEYS.LAST_CONVERSATION, conversationId)
}

/**
 * Get the last active conversation ID
 */
export function getLastConversation(): string | null {
  return localStorage.getItem(STORAGE_KEYS.LAST_CONVERSATION)
}

/**
 * User settings interface
 */
interface UserSettings {
  defaultModel?: string
  defaultTemperature?: number
  defaultMaxTokens?: number
  theme?: 'dark' | 'light'
}

/**
 * Save user settings
 */
export function saveSettings(settings: Partial<UserSettings>): void {
  const current = getSettings()
  const updated = { ...current, ...settings }
  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated))
}

/**
 * Get user settings
 */
export function getSettings(): UserSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.SETTINGS)
    return stored ? JSON.parse(stored) : {}
  } catch {
    return {}
  }
}

/**
 * Generate a conversation name from the first message
 */
export function generateConversationName(firstMessage: string): string {
  // Remove markdown, code blocks, and special characters
  const cleaned = firstMessage
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/[#*_~\[\]()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  // Take first ~50 characters at a word boundary
  if (cleaned.length <= 50) {
    return cleaned
  }

  const truncated = cleaned.substring(0, 50)
  const lastSpace = truncated.lastIndexOf(' ')

  if (lastSpace > 30) {
    return truncated.substring(0, lastSpace) + '...'
  }

  return truncated + '...'
}
