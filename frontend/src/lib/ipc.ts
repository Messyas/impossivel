import { invoke } from '@tauri-apps/api/core'

/**
 * Helper to check if running inside Tauri webview
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * Safely invoke a Tauri command with fallback if running outside Tauri
 */
export async function safeInvoke<T>(cmd: string, args?: Record<string, unknown>, fallback?: T): Promise<T> {
  if (isTauri()) {
    try {
      return await invoke<T>(cmd, args)
    } catch (err) {
      console.error(`[Tauri IPC Error] Command '${cmd}' failed:`, err)
      if (fallback !== undefined) return fallback
      throw err
    }
  }
  if (fallback !== undefined) {
    return fallback
  }
  throw new Error(`[Tauri IPC] Command '${cmd}' called outside Tauri context without fallback`)
}
