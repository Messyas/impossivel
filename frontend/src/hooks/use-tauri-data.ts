import { useEffect, useState, useCallback } from 'react'
import { safeInvoke, isTauri } from '@/lib/ipc'
import { Task, Roadmap, Note, initialTasks, roadmaps as seedRoadmaps, initialNotes } from '@/lib/study-data'

// Backend Rust struct models for conversion
interface BackendTask {
  id: string
  title: string
  group_name: string
  subject: string
  duration: number
  priority: string
  done: boolean
  due: string
  created_at: string
  updated_at: string
}

interface BackendRoadmapStep {
  id: string
  roadmap_id: string
  title: string
  status: 'done' | 'active' | 'locked'
  mastery: number
  sort_order: number
}

interface BackendRoadmap {
  id: string
  name: string
  code: string
  progress: number
  hours: number
  streak: number
  next_step?: string
  created_at: string
}

interface BackendRoadmapWithSteps {
  id: string
  name: string
  code: string
  progress: number
  hours: number
  streak: number
  next_step?: string
  created_at: string
  steps: BackendRoadmapStep[]
}

interface BackendNote {
  id: string
  title: string
  category: string
  link: string
  content: string
  created_at: string
  updated_at: string
}

interface BackendCredential {
  id: string
  account_id: string
  label: string
  type: string
  secret_masked: string
  active: boolean
  created_at: string
}

interface BackendAccount {
  id: string
  service: string
  label: string
  email: string
  username?: string
  purpose: string
  status: string
  free_tier: string
  last_used: string
  plan: string
  in_use: boolean
  notes?: string
  tags: string[]
  credits?: string
  created_at: string
  credentials: BackendCredential[]
}

export type FrontendAccount = {
  id: string
  service: string
  label: string
  email: string
  username?: string
  purpose: string
  status: string
  freeTier: string
  lastUsed: string
  plan: string
  inUse: boolean
  notes?: string
  tags: string[]
  credits?: string
  credentials: { id: string; label: string; type: string; value: string; active: boolean }[]
}

const browserCredentialSecrets = new Map<string, string>()

export interface BackendPaginatedResponse<T> {
  items: T[]
  next_cursor: string | null
  prev_cursor: string | null
  has_more: boolean
  total_count: number
  page: number
  total_pages: number
  per_page: number
}

// ── Tasks Hook (Infinite Scroll) ──────────────────────────────────────────

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [page, setPage] = useState(1)
  const [perPage] = useState(20)
  const [totalCount, setTotalCount] = useState(initialTasks.length)
  const [totalPages, setTotalPages] = useState(1)
  const [hasMore, setHasMore] = useState(true)

  const reloadTasks = useCallback(async () => {
    if (!isTauri()) return
    try {
      const res = await safeInvoke<BackendPaginatedResponse<BackendTask>>('get_tasks', { query: { page: 1, per_page: perPage } }, null as any)
      if (res && res.items) {
        const mapped: Task[] = res.items.map((t, idx) => ({
          id: idx + 1,
          _dbId: t.id,
          title: t.title,
          group: t.group_name as 'Hoje' | 'Próximas',
          subject: t.subject,
          duration: t.duration,
          priority: t.priority as 'Alta' | 'Média' | 'Baixa',
          done: t.done,
          due: t.due,
        } as Task & { _dbId: string }))
        setTasks(mapped)
        setTotalCount(res.total_count)
        setTotalPages(res.total_pages)
        setHasMore(res.has_more)
        setPage(1)
      }
    } catch (e) {
      console.error('Error fetching tasks from SQLite:', e)
    } finally {
      setLoading(false)
    }
  }, [perPage])

  const fetchNextPage = useCallback(async () => {
    if (!isTauri() || !hasMore || loadingMore) return
    setLoadingMore(true)
    const nextPage = page + 1
    try {
      const res = await safeInvoke<BackendPaginatedResponse<BackendTask>>('get_tasks', { query: { page: nextPage, per_page: perPage } }, null as any)
      if (res && res.items) {
        const mapped: Task[] = res.items.map((t, idx) => ({
          id: (nextPage - 1) * perPage + idx + 1,
          _dbId: t.id,
          title: t.title,
          group: t.group_name as 'Hoje' | 'Próximas',
          subject: t.subject,
          duration: t.duration,
          priority: t.priority as 'Alta' | 'Média' | 'Baixa',
          done: t.done,
          due: t.due,
        } as Task & { _dbId: string }))
        setTasks(prev => {
          const existingIds = new Set(prev.map(item => (item as unknown as { _dbId?: string })._dbId || item.id))
          const fresh = mapped.filter(item => !existingIds.has((item as unknown as { _dbId?: string })._dbId || item.id))
          return [...prev, ...fresh]
        })
        setPage(nextPage)
        setHasMore(res.has_more)
      }
    } catch (e) {
      console.error('Error fetching next page of tasks:', e)
    } finally {
      setLoadingMore(false)
    }
  }, [page, perPage, hasMore, loadingMore])

  useEffect(() => {
    reloadTasks()
  }, [reloadTasks])

  const toggleTask = async (task: Task & { _dbId?: string }) => {
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, done: !t.done } : t))
    if (isTauri() && task._dbId) {
      await safeInvoke('toggle_task', { id: task._dbId }).catch(console.error)
    }
  }

  const addTask = async (newTaskPayload: { title: string; group?: string; subject?: string; duration?: number; priority?: string; due?: string }) => {
    if (isTauri()) {
      await safeInvoke('create_task', { payload: newTaskPayload }).catch(console.error)
      await reloadTasks()
    } else {
      const newTask: Task = {
        id: Date.now(),
        title: newTaskPayload.title,
        group: (newTaskPayload.group || 'Hoje') as 'Hoje' | 'Próximas',
        subject: newTaskPayload.subject || 'Inbox',
        duration: newTaskPayload.duration || 25,
        priority: (newTaskPayload.priority || 'Média') as 'Alta' | 'Média' | 'Baixa',
        done: false,
        due: newTaskPayload.due || 'Hoje',
      }
      setTasks(prev => [newTask, ...prev])
    }
  }

  const deleteTask = async (task: Task & { _dbId?: string }) => {
    setTasks(prev => prev.filter(t => t.id !== task.id))
    if (isTauri() && task._dbId) {
      await safeInvoke('delete_task', { id: task._dbId }).catch(console.error)
    }
  }

  const clearAllTasks = async () => {
    setTasks([])
    setTotalCount(0)
    if (isTauri()) {
      await safeInvoke('clear_all_tasks', {}).catch(console.error)
    }
  }

  return { tasks, setTasks, loading, loadingMore, page, totalCount, totalPages, hasMore, fetchNextPage, toggleTask, addTask, deleteTask, clearAllTasks, reloadTasks }
}

// ── Roadmaps Hook (Infinite Scroll) ────────────────────────────────────────

export function useRoadmaps() {
  const [roadmapsList, setRoadmapsList] = useState<Roadmap[]>(seedRoadmaps)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [page, setPage] = useState(1)
  const [perPage] = useState(10)
  const [totalCount, setTotalCount] = useState(seedRoadmaps.length)
  const [totalPages, setTotalPages] = useState(1)
  const [hasMore, setHasMore] = useState(true)

  const reloadRoadmaps = useCallback(async () => {
    if (!isTauri()) return
    try {
      const res = await safeInvoke<BackendPaginatedResponse<BackendRoadmapWithSteps>>('get_roadmaps', { query: { page: 1, per_page: perPage } }, null as any)
      if (res && res.items) {
        const mapped: Roadmap[] = res.items.map(r => ({
          _dbId: r.id,
          name: r.name,
          code: r.code,
          progress: r.progress,
          hours: r.hours,
          streak: r.streak,
          next: r.next_step || 'Não iniciado',
          steps: r.steps.map(s => ({
            _dbId: s.id,
            title: s.title,
            status: s.status,
            mastery: s.mastery,
          })),
        } as unknown as Roadmap))
        setRoadmapsList(mapped)
        setTotalCount(res.total_count)
        setTotalPages(res.total_pages)
        setHasMore(res.has_more)
        setPage(1)
      }
    } catch (e) {
      console.error('Error fetching roadmaps from SQLite:', e)
    } finally {
      setLoading(false)
    }
  }, [perPage])

  const fetchNextPage = useCallback(async () => {
    if (!isTauri() || !hasMore || loadingMore) return
    setLoadingMore(true)
    const nextPage = page + 1
    try {
      const res = await safeInvoke<BackendPaginatedResponse<BackendRoadmapWithSteps>>('get_roadmaps', { query: { page: nextPage, per_page: perPage } }, null as any)
      if (res && res.items) {
        const mapped: Roadmap[] = res.items.map(r => ({
          _dbId: r.id,
          name: r.name,
          code: r.code,
          progress: r.progress,
          hours: r.hours,
          streak: r.streak,
          next: r.next_step || 'Não iniciado',
          steps: r.steps.map(s => ({
            _dbId: s.id,
            title: s.title,
            status: s.status,
            mastery: s.mastery,
          })),
        } as unknown as Roadmap))
        setRoadmapsList(prev => {
          const existingIds = new Set(prev.map(item => (item as unknown as { _dbId?: string })._dbId || item.name))
          const fresh = mapped.filter(item => !existingIds.has((item as unknown as { _dbId?: string })._dbId || item.name))
          return [...prev, ...fresh]
        })
        setPage(nextPage)
        setHasMore(res.has_more)
      }
    } catch (e) {
      console.error('Error fetching next page of roadmaps:', e)
    } finally {
      setLoadingMore(false)
    }
  }, [page, perPage, hasMore, loadingMore])

  useEffect(() => {
    reloadRoadmaps()
  }, [reloadRoadmaps])

  const createRoadmap = async (payload: { name: string; code?: string; steps: { title: string }[] }) => {
    if (isTauri()) {
      await safeInvoke('create_roadmap', { payload }).catch(console.error)
      await reloadRoadmaps()
    } else {
      const newRoadmap: Roadmap = {
        name: payload.name,
        code: payload.code || 'CUSTOM',
        progress: 0,
        hours: 0,
        streak: 0,
        next: payload.steps[0]?.title || 'Primeira etapa',
        steps: payload.steps.map((s, idx) => ({
          title: s.title,
          status: idx === 0 ? 'active' : 'locked',
          mastery: 0,
        })),
      }
      setRoadmapsList(prev => [...prev, newRoadmap])
    }
  }

  const addStep = async (roadmapDbId: string, title: string) => {
    if (isTauri()) {
      await safeInvoke('add_roadmap_step', { payload: { roadmap_id: roadmapDbId, title } }).catch(console.error)
      await reloadRoadmaps()
    }
  }

  const deleteRoadmap = async (roadmap: Roadmap & { _dbId?: string }) => {
    const dbId = (roadmap as unknown as { _dbId?: string })._dbId
    setRoadmapsList(prev => prev.filter(r => r.name !== roadmap.name && (r as unknown as { _dbId?: string })._dbId !== dbId))
    if (isTauri() && dbId) {
      await safeInvoke('delete_roadmap', { id: dbId }).catch(console.error)
    }
  }

  const clearAllRoadmaps = async () => {
    setRoadmapsList([])
    setTotalCount(0)
    if (isTauri()) {
      await safeInvoke('clear_all_roadmaps', {}).catch(console.error)
    }
  }

  return { roadmaps: roadmapsList, setRoadmapsList, loading, loadingMore, page, totalCount, totalPages, hasMore, fetchNextPage, createRoadmap, addStep, deleteRoadmap, clearAllRoadmaps, reloadRoadmaps }
}

// ── Notes Hook ─────────────────────────────────────────────────────────────

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>(initialNotes)
  const [loading, setLoading] = useState(true)

  const reloadNotes = useCallback(async () => {
    if (!isTauri()) return
    try {
      const res = await safeInvoke<BackendNote[]>('get_notes', undefined, [])
      if (res.length > 0) {
        const mapped: Note[] = res.map((n, idx) => ({
          id: (idx + 1),
          _dbId: n.id,
          title: n.title,
          category: n.category,
          link: n.link,
          updated: n.updated_at ? new Date(n.updated_at).toLocaleDateString() : 'hoje',
          content: n.content,
        } as Note & { _dbId: string }))
        setNotes(mapped)
      }
    } catch (e) {
      console.error('Error fetching notes from SQLite:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reloadNotes()
  }, [reloadNotes])

  const createNote = async () => {
    if (isTauri()) {
      await safeInvoke('create_note').catch(console.error)
      await reloadNotes()
    } else {
      const newNote: Note = {
        id: Date.now(),
        title: 'Nova nota',
        category: 'Inbox',
        link: 'Sem vínculo',
        updated: 'agora',
        content: '# Nova nota\n\nDigite seu conteúdo...',
      }
      setNotes(prev => [newNote, ...prev])
    }
  }

  const updateNote = async (dbId: string, patch: { title?: string; category?: string; content?: string }) => {
    if (isTauri()) {
      await safeInvoke('update_note', { payload: { id: dbId, ...patch } }).catch(console.error)
      await reloadNotes()
    } else {
      setNotes(prev => prev.map(n => (n as unknown as { _dbId?: string })._dbId === dbId || String(n.id) === dbId ? { ...n, ...patch } : n))
    }
  }

  const deleteNote = async (dbId: string) => {
    if (isTauri()) {
      await safeInvoke('delete_note', { id: dbId }).catch(console.error)
      await reloadNotes()
    } else {
      setNotes(prev => prev.filter(n => (n as unknown as { _dbId?: string })._dbId !== dbId && String(n.id) !== dbId))
    }
  }

  const clearAllNotes = async () => {
    setNotes([])
    if (isTauri()) {
      await safeInvoke('clear_all_notes', {}).catch(console.error)
    }
  }

  return { notes, setNotes, loading, createNote, updateNote, deleteNote, clearAllNotes, reloadNotes }
}

// ── Accounts Hook ──────────────────────────────────────────────────────────

export function useAccounts() {
  const [accounts, setAccounts] = useState<FrontendAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(20)
  const [cursor, setCursor] = useState<string | null>(null)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [totalCount, setTotalCount] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [hasMore, setHasMore] = useState(false)

  const reloadAccounts = useCallback(async () => {
    if (!isTauri()) return
    try {
      const res = await safeInvoke<BackendPaginatedResponse<BackendAccount>>('get_accounts', { query: { page, per_page: perPage, cursor: cursor || undefined } }, null as any)
      if (res && res.items) {
        const mapped: FrontendAccount[] = res.items.map(a => ({
          id: a.id,
          service: a.service,
          label: a.label,
          email: a.email,
          username: a.username,
          purpose: a.purpose,
          status: a.status,
          freeTier: a.free_tier,
          lastUsed: a.last_used,
          plan: a.plan,
          inUse: a.in_use,
          notes: a.notes,
          tags: a.tags,
          credits: a.credits,
          credentials: a.credentials.map(c => ({
            id: c.id,
            label: c.label,
            type: c.type,
            value: c.secret_masked,
            active: c.active,
          })),
        }))
        setAccounts(mapped)
        setNextCursor(res.next_cursor)
        setTotalCount(res.total_count)
        setTotalPages(res.total_pages)
        setHasMore(res.has_more)
      }
    } catch (e) {
      console.error('Error fetching accounts from SQLite:', e)
    } finally {
      setLoading(false)
    }
  }, [page, perPage, cursor])

  useEffect(() => {
    reloadAccounts()
  }, [reloadAccounts])

  const createAccount = async (payload: {
    id?: string
    service: string
    label: string
    email: string
    username?: string
    purpose?: string
    status?: string
    freeTier?: string
    plan?: string
    inUse?: boolean
    notes?: string
    tags?: string[]
    credits?: string
    password?: string
  }) => {
    if (payload.id) {
      setAccounts(prev => prev.map(a => a.id === payload.id ? {
        ...a,
        service: payload.service,
        label: payload.label,
        email: payload.email,
        username: payload.username,
        purpose: payload.purpose || a.purpose,
        status: payload.status || a.status,
        freeTier: payload.freeTier || a.freeTier,
        plan: payload.plan || a.plan,
        inUse: payload.inUse !== undefined ? payload.inUse : a.inUse,
        notes: payload.notes !== undefined ? payload.notes : a.notes,
        credits: payload.credits !== undefined ? payload.credits : a.credits,
        credentials: payload.password ? (() => {
          const currentPassword = a.credentials.find(credential => credential.type.toLowerCase() === 'password')
          const credentialId = currentPassword?.id || `cred-${Date.now()}`
          browserCredentialSecrets.set(credentialId, payload.password)
          const nextPassword = { id: credentialId, label: 'Senha', type: 'Password', value: '••••••••', active: true }
          return [...a.credentials.filter(credential => credential.type.toLowerCase() !== 'password'), nextPassword]
        })() : a.credentials,
      } : a))
    }
    if (isTauri()) {
      const saved = await safeInvoke<BackendAccount | null>('create_account', {
        payload: {
          id: payload.id,
          service: payload.service,
          label: payload.label,
          email: payload.email,
          username: payload.username,
          purpose: payload.purpose,
          status: payload.status,
          free_tier: payload.freeTier,
          plan: payload.plan,
          in_use: payload.inUse,
          notes: payload.notes,
          tags: payload.tags,
          credits: payload.credits,
        },
      }, null).catch(error => {
        console.error(error)
        return null
      })
      const accountId = saved?.id || payload.id
      if (payload.password && accountId) {
        await safeInvoke('add_credential', {
          payload: {
            account_id: accountId,
            label: 'Senha',
            cred_type: 'Password',
            secret: payload.password,
          },
        }).catch(console.error)
        const previousPassword = accounts
          .find(account => account.id === payload.id)
          ?.credentials.find(credential => credential.type.toLowerCase() === 'password')
        if (previousPassword) {
          await safeInvoke('remove_credential', { id: previousPassword.id }).catch(console.error)
        }
      }
      await reloadAccounts()
    } else if (!payload.id) {
      const passwordCredentialId = `cred-${Date.now()}`
      if (payload.password) browserCredentialSecrets.set(passwordCredentialId, payload.password)
      const newAcc: FrontendAccount = {
        id: `acc-${Date.now()}`,
        service: payload.service,
        label: payload.label,
        email: payload.email,
        username: payload.username,
        purpose: payload.purpose || 'Development',
        status: payload.status || 'Active',
        freeTier: payload.freeTier || 'Unknown',
        lastUsed: 'Never',
        plan: payload.plan || 'Free',
        inUse: payload.inUse || false,
        notes: payload.notes || '',
        tags: payload.tags || [],
        credits: payload.credits || '',
        credentials: payload.password
          ? [{ id: passwordCredentialId, label: 'Senha', type: 'Password', value: '••••••••', active: true }]
          : [],
      }
      setAccounts(prev => [newAcc, ...prev])
    }
  }

  const archiveAccount = async (id: string) => {
    setAccounts(prev => prev.filter(a => a.id !== id))
    if (isTauri()) {
      await safeInvoke('archive_account', { id }).catch(console.error)
    }
  }

  const toggleAccountUse = async (id: string) => {
    setAccounts(prev => prev.map(a => a.id === id ? { ...a, inUse: !a.inUse } : a))
    if (isTauri()) {
      await safeInvoke('toggle_account_use', { id }).catch(console.error)
    }
  }

  const addCredential = async (accountId: string, label: string, credType: string, secret: string) => {
    if (isTauri()) {
      await safeInvoke('add_credential', {
        payload: {
          account_id: accountId,
          label,
          cred_type: credType,
          secret,
        },
      }).catch(console.error)
      await reloadAccounts()
    }
  }

  const revealCredential = async (credentialId: string): Promise<string> => {
    if (isTauri()) {
      return await safeInvoke<string>('reveal_credential', { id: credentialId }, '••••••••')
    }
    return browserCredentialSecrets.get(credentialId) || '••••••••'
  }

  const deleteAccount = async (id: string) => {
    setAccounts(prev => prev.filter(a => a.id !== id))
    if (isTauri()) {
      await safeInvoke('delete_account', { id }).catch(console.error)
    }
  }

  const clearAllAccounts = async () => {
    setAccounts([])
    setTotalCount(0)
    if (isTauri()) {
      await safeInvoke('clear_all_accounts', {}).catch(console.error)
    }
  }

  const removeCredential = async (credentialId: string) => {
    if (isTauri()) {
      await safeInvoke('remove_credential', { id: credentialId }).catch(console.error)
      await reloadAccounts()
    }
  }

  return {
    accounts,
    setAccounts,
    loading,
    page,
    setPage,
    perPage,
    setPerPage,
    cursor,
    setCursor,
    nextCursor,
    totalCount,
    totalPages,
    hasMore,
    createAccount,
    archiveAccount,
    deleteAccount,
    clearAllAccounts,
    toggleAccountUse,
    addCredential,
    revealCredential,
    removeCredential,
    reloadAccounts,
  }
}

// ── Dashboard Pre-calculated Analytics Hook ───────────────────────────────

export interface DashboardAnalyticsData {
  focusTimeMinutes: number
  completedSessions: number
  executionRate: number
  reviewsOnTime: number
  dailyFocus: { d: string; v: number }[]
  subjectStudy: { s: string; v: number }[]
  plannedVsActual: { d: string; p: number; a: number }[]
  updatedAt: string
}

export function useDashboardAnalytics() {
  const [analytics, setAnalytics] = useState<DashboardAnalyticsData>({
    focusTimeMinutes: 1218,
    completedSessions: 27,
    executionRate: 86,
    reviewsOnTime: 92,
    dailyFocus: [{d:'M',v:2.1},{d:'T',v:3.8},{d:'W',v:2.9},{d:'T',v:4.4},{d:'F',v:3.2},{d:'S',v:1.4},{d:'S',v:2.5}],
    subjectStudy: [{s:'Cálculo',v:8.5},{s:'Rust',v:6.2},{s:'Inglês',v:5.1},{s:'Física',v:3.8}],
    plannedVsActual: [{d:'M',p:3,a:2.8},{d:'T',p:4,a:3.8},{d:'W',p:3,a:2.2},{d:'T',p:4,a:4.4},{d:'F',p:3,a:3.1},{d:'S',p:2,a:1.4},{d:'S',p:3,a:2.5}],
    updatedAt: 'now',
  })
  const [loading, setLoading] = useState(true)

  const reloadAnalytics = useCallback(async () => {
    if (!isTauri()) return
    try {
      const res = await safeInvoke<{
        focus_time_minutes: number
        completed_sessions: number
        execution_rate: number
        reviews_on_time: number
        daily_focus_json: string
        subject_study_json: string
        planned_vs_actual_json: string
        updated_at: string
      }>('get_dashboard_analytics', undefined, null as any)

      if (res) {
        setAnalytics({
          focusTimeMinutes: res.focus_time_minutes,
          completedSessions: res.completed_sessions,
          executionRate: res.execution_rate,
          reviewsOnTime: res.reviews_on_time,
          dailyFocus: JSON.parse(res.daily_focus_json),
          subjectStudy: JSON.parse(res.subject_study_json),
          plannedVsActual: JSON.parse(res.planned_vs_actual_json),
          updatedAt: res.updated_at,
        })
      }
    } catch (e) {
      console.error('Failed to load pre-calculated analytics from SQLite:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    reloadAnalytics()
  }, [reloadAnalytics])

  return { analytics, loading, reloadAnalytics }
}
