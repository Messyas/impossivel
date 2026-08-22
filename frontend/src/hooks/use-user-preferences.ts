import { useEffect, useState } from 'react'
import { safeInvoke, isTauri } from '@/lib/ipc'

export type Theme = 'system' | 'light' | 'dark'
export type Font = 'geist' | 'inter' | 'serif'
export type Locale = 'pt-BR' | 'en-US' | 'ru' | 'fr' | 'es' | 'ja' | 'zh' | 'ko'

export type UserPreferences = {
  name: string
  avatar: string
  theme: Theme
  font: Font
  locale: Locale
}

const STORAGE_KEY = 'app-user-preferences'
export const defaultUserPreferences: UserPreferences = {
  name: 'Alex Morgan',
  avatar: '',
  theme: 'system',
  font: 'geist',
  locale: 'pt-BR',
}

let globalPreferences: UserPreferences = defaultUserPreferences
let isLoaded = false
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((l) => l())
}

function applyPreferencesToDOM(prefs: UserPreferences) {
  const root = document.documentElement
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const applyTheme = () => {
    const isDark = prefs.theme === 'dark' || (prefs.theme === 'system' && media.matches)
    root.classList.toggle('dark', isDark)
    root.classList.toggle('light', !isDark)
  }
  applyTheme()
  root.dataset.font = prefs.font
  root.lang = prefs.locale
}

export function useUserPreferences() {
  const [preferences, setLocal] = useState<UserPreferences>(globalPreferences)
  const [isHydrated, setIsHydrated] = useState(isLoaded)

  useEffect(() => {
    const handleChange = () => {
      setLocal({ ...globalPreferences })
    }
    listeners.add(handleChange)

    if (!isLoaded) {
      isLoaded = true
      async function load() {
        let loaded = defaultUserPreferences
        if (isTauri()) {
          try {
            loaded = await safeInvoke<UserPreferences>('get_preferences', undefined, defaultUserPreferences)
          } catch (e) {
            console.error('Failed to load preferences from Tauri:', e)
          }
        } else {
          const stored = window.localStorage.getItem(STORAGE_KEY)
          if (stored) {
            try {
              loaded = { ...defaultUserPreferences, ...JSON.parse(stored) }
            } catch {
              window.localStorage.removeItem(STORAGE_KEY)
            }
          }
        }
        globalPreferences = loaded
        applyPreferencesToDOM(loaded)
        notify()
        setIsHydrated(true)
      }
      load()
    } else {
      setIsHydrated(true)
    }

    return () => {
      listeners.delete(handleChange)
    }
  }, [])

  const update = (patch: Partial<UserPreferences>) => {
    globalPreferences = { ...globalPreferences, ...patch }
    applyPreferencesToDOM(globalPreferences)
    notify()

    if (isTauri()) {
      safeInvoke('update_preferences', { preferences: globalPreferences }).catch(console.error)
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(globalPreferences))
    }
  }

  const reset = async () => {
    let res = defaultUserPreferences
    if (isTauri()) {
      try {
        res = await safeInvoke<UserPreferences>('reset_preferences', undefined, defaultUserPreferences)
      } catch (e) {
        console.error('Failed to reset preferences:', e)
      }
    }
    globalPreferences = res
    applyPreferencesToDOM(res)
    notify()
    if (!isTauri()) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(res))
    }
  }

  return { preferences, update, reset, isHydrated }
}
