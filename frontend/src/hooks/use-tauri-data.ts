import { useEffect, useState, useCallback } from 'react'
import { safeInvoke, isTauri } from '@/lib/ipc'
import { Task, Roadmap, Note, ReviewOccurrence, initialTasks, roadmaps as seedRoadmaps, initialNotes } from '@/lib/study-data'

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
  status: 'done' | 'available' | 'active' | 'in_progress' | 'incomplete' | 'locked'
  mastery: number
  sort_order: number
  description: string
  checklist: string[]
  checklist_state: boolean[]
  focus_seconds: number
  timer_remaining: number
  completed_at?: string
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
  review_intervals: number[]
  steps: BackendRoadmapStep[]
}

interface BackendReviewOccurrence {
  id: string
  roadmap_id: string
  roadmap_name: string
  step_id: string
  step_title: string
  interval_days: number
  due_date: string
  status: ReviewOccurrence['status']
  checklist: string[]
  checklist_state: boolean[]
  focus_seconds: number
  timer_remaining: number
  completed_at?: string
}

interface BackendNote {
  id: string
  title: string
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
          reviewIntervals: r.review_intervals,
          steps: r.steps.map(s => ({
            _dbId: s.id,
            title: s.title,
            status: s.status === 'active' ? 'available' : s.status,
            mastery: s.mastery,
            description: s.description,
            checklist: s.checklist,
            checklistState: s.checklist_state,
            focusSeconds: s.focus_seconds,
            timerRemaining: s.timer_remaining,
            completedAt: s.completed_at,
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
          reviewIntervals: r.review_intervals,
          steps: r.steps.map(s => ({
            _dbId: s.id,
            title: s.title,
            status: s.status === 'active' ? 'available' : s.status,
            mastery: s.mastery,
            description: s.description,
            checklist: s.checklist,
            checklistState: s.checklist_state,
            focusSeconds: s.focus_seconds,
            timerRemaining: s.timer_remaining,
            completedAt: s.completed_at,
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

  const createRoadmap = async (payload: { name: string; code?: string; reviewIntervals?: number[]; steps: Roadmap['steps'] }) => {
    if (isTauri()) {
      await safeInvoke('create_roadmap', { payload: {
        name: payload.name,
        code: payload.code,
        review_intervals: payload.reviewIntervals ?? [0, 1, 3, 7],
        steps: payload.steps.map(step => ({ title: step.title, status: step.status, description: step.description, checklist: step.checklist, checklist_state: step.checklistState, focus_seconds: step.focusSeconds, timer_remaining: step.timerRemaining, completed_at: step.completedAt })),
      } }).catch(console.error)
      await reloadRoadmaps()
    } else {
      const newRoadmap: Roadmap = {
        name: payload.name,
        code: payload.code || 'CUSTOM',
        progress: 0,
        hours: 0,
        streak: 0,
        next: payload.steps[0]?.title || 'Primeira etapa',
        reviewIntervals: payload.reviewIntervals ?? [0, 1, 3, 7],
        steps: payload.steps.map((s, idx) => ({
          ...s,
          status: idx === 0 ? 'available' : 'locked',
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

  const updateRoadmap = async (roadmap: Roadmap & { _dbId?: string }) => {
    const dbId = roadmap._dbId
    setRoadmapsList(prev => prev.map(item => ((item as Roadmap & { _dbId?: string })._dbId === dbId || (!dbId && item.name === roadmap.name)) ? roadmap : item))
    if (isTauri() && dbId) {
      await safeInvoke('update_roadmap', {
        payload: {
          id: dbId,
          name: roadmap.name,
          code: roadmap.code,
          review_intervals: roadmap.reviewIntervals ?? [0, 1, 3, 7],
          steps: roadmap.steps.map(step => ({ id: step._dbId, title: step.title, status: step.status, description: step.description, checklist: step.checklist, checklist_state: step.checklistState, focus_seconds: step.focusSeconds, timer_remaining: step.timerRemaining, completed_at: step.completedAt })),
        },
      }).catch(console.error)
      await reloadRoadmaps()
    }
  }

  const updateStepProgress = async (step: Roadmap['steps'][number], patch: { status: Roadmap['steps'][number]['status']; checklistState: boolean[]; focusSeconds: number; timerRemaining: number }) => {
    const stepId = step._dbId
    if (isTauri() && stepId) {
      await safeInvoke('update_step_progress', { payload: { step_id: stepId, status: patch.status, checklist_state: patch.checklistState, focus_seconds: patch.focusSeconds, timer_remaining: patch.timerRemaining } }).catch(console.error)
      await reloadRoadmaps()
      window.dispatchEvent(new Event('reviews:changed'))
      return
    }
    setRoadmapsList(prev => prev.map(roadmap => ({
      ...roadmap,
      steps: roadmap.steps.map(item => item === step ? { ...item, ...patch } : item),
    })))
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

  return { roadmaps: roadmapsList, setRoadmapsList, loading, loadingMore, page, totalCount, totalPages, hasMore, fetchNextPage, createRoadmap, updateRoadmap, updateStepProgress, addStep, deleteRoadmap, clearAllRoadmaps, reloadRoadmaps }
}

export function useReviews() {
  const [reviews, setReviews] = useState<ReviewOccurrence[]>([])
  const [loading, setLoading] = useState(true)

  const reloadReviews = useCallback(async () => {
    if (!isTauri()) { setLoading(false); return }
    const result = await safeInvoke<BackendReviewOccurrence[]>('get_review_occurrences', {}, [])
    setReviews(result.map(review => ({
      id: review.id, roadmapId: review.roadmap_id, roadmapName: review.roadmap_name,
      stepId: review.step_id, stepTitle: review.step_title, intervalDays: review.interval_days,
      dueDate: review.due_date, status: review.status, checklist: review.checklist,
      checklistState: review.checklist_state, focusSeconds: review.focus_seconds,
      timerRemaining: review.timer_remaining, completedAt: review.completed_at,
    })))
    setLoading(false)
  }, [])

  useEffect(() => {
    reloadReviews()
    const refresh = () => { void reloadReviews() }
    window.addEventListener('reviews:changed', refresh)
    return () => window.removeEventListener('reviews:changed', refresh)
  }, [reloadReviews])

  const updateReviewProgress = async (review: ReviewOccurrence, patch: Pick<ReviewOccurrence, 'status' | 'checklistState' | 'focusSeconds' | 'timerRemaining'>) => {
    setReviews(prev => prev.map(item => item.id === review.id ? { ...item, ...patch } : item))
    if (isTauri()) {
      await safeInvoke('update_review_progress', { payload: { review_id: review.id, status: patch.status, checklist_state: patch.checklistState, focus_seconds: patch.focusSeconds, timer_remaining: patch.timerRemaining } }).catch(console.error)
      await reloadReviews()
    }
  }

  return { reviews, loading, reloadReviews, updateReviewProgress }
}

// ── Notes Hook ─────────────────────────────────────────────────────────────

function mapBackendNote(note: BackendNote): Note {
  const rawDate = note.updated_at.includes('T') ? note.updated_at : `${note.updated_at.replace(' ', 'T')}Z`
  const parsedDate = new Date(rawDate)
  return {
    id: note.id,
    _dbId: note.id,
    title: note.title,
    updated: Number.isNaN(parsedDate.getTime()) ? 'recentemente' : parsedDate.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
    content: note.content,
  }
}

export function useNotes(search = '') {
  const [browserNotes, setBrowserNotes] = useState<Note[]>(initialNotes)
  const [notes, setNotes] = useState<Note[]>(() => isTauri() ? [] : initialNotes)
  const [loading, setLoading] = useState(() => isTauri())
  const [loadingMore, setLoadingMore] = useState(false)
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(initialNotes.length)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const perPage = 30

  const reloadNotes = useCallback(async () => {
    setError(null)
    if (!isTauri()) {
      const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR')
      const filtered = normalizedSearch
        ? browserNotes.filter(note => `${note.title}\n${note.content}`.toLocaleLowerCase('pt-BR').includes(normalizedSearch))
        : browserNotes
      setNotes(filtered)
      setTotalCount(filtered.length)
      setHasMore(false)
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const response = await safeInvoke<BackendPaginatedResponse<BackendNote>>(
        'get_notes',
        { query: { page: 1, per_page: perPage, search } },
      )
      setNotes(response.items.map(mapBackendNote))
      setTotalCount(response.total_count)
      setHasMore(response.has_more)
      setPage(1)
    } catch (cause) {
      console.error('Error fetching notes from SQLite:', cause)
      setError('Não foi possível carregar as notas.')
    } finally {
      setLoading(false)
    }
  }, [browserNotes, search])

  useEffect(() => {
    void reloadNotes()
  }, [reloadNotes])

  const fetchNextPage = useCallback(async () => {
    if (!isTauri() || !hasMore || loadingMore) return
    setLoadingMore(true)
    const nextPage = page + 1
    try {
      const response = await safeInvoke<BackendPaginatedResponse<BackendNote>>(
        'get_notes',
        { query: { page: nextPage, per_page: perPage, search } },
      )
      setNotes(previous => {
        const ids = new Set(previous.map(note => note._dbId ?? String(note.id)))
        return [...previous, ...response.items.map(mapBackendNote).filter(note => !ids.has(note._dbId ?? String(note.id)))]
      })
      setPage(nextPage)
      setHasMore(response.has_more)
    } catch (cause) {
      console.error('Error fetching more notes:', cause)
      setError('Não foi possível carregar mais notas.')
    } finally {
      setLoadingMore(false)
    }
  }, [hasMore, loadingMore, page, search])

  const createNote = async (): Promise<Note | undefined> => {
    setError(null)
    try {
      const note = isTauri()
        ? mapBackendNote(await safeInvoke<BackendNote>('create_note'))
        : { id: Date.now(), title: 'Nova nota', updated: 'agora', content: '' }
      if (!isTauri()) setBrowserNotes(previous => [note, ...previous])
      setNotes(previous => [note, ...previous])
      setTotalCount(previous => previous + 1)
      return note
    } catch (cause) {
      console.error('Error creating note:', cause)
      setError('Não foi possível criar a nota.')
    }
  }

  const updateNote = async (dbId: string, patch: Pick<Partial<Note>, 'title' | 'content'>) => {
    const localPatch = { ...patch, updated: 'agora' }
    setNotes(previous => previous.map(note => (note._dbId ?? String(note.id)) === dbId ? { ...note, ...localPatch } : note))
    if (!isTauri()) {
      setBrowserNotes(previous => previous.map(note => (note._dbId ?? String(note.id)) === dbId ? { ...note, ...localPatch } : note))
      return
    }
    try {
      await safeInvoke('update_note', { payload: { id: dbId, ...patch } })
      setError(null)
    } catch (cause) {
      console.error('Error updating note:', cause)
      setError('A última alteração não pôde ser salva.')
      await reloadNotes()
      throw cause
    }
  }

  const deleteNote = async (dbId: string) => {
    setError(null)
    try {
      if (isTauri()) await safeInvoke('delete_note', { id: dbId })
      else setBrowserNotes(previous => previous.filter(note => (note._dbId ?? String(note.id)) !== dbId))
      setNotes(previous => previous.filter(note => (note._dbId ?? String(note.id)) !== dbId))
      setTotalCount(previous => Math.max(0, previous - 1))
    } catch (cause) {
      console.error('Error deleting note:', cause)
      setError('Não foi possível excluir a nota.')
      throw cause
    }
  }

  const clearAllNotes = async () => {
    setError(null)
    try {
      if (isTauri()) await safeInvoke('clear_all_notes', {})
      else setBrowserNotes([])
      setNotes([])
      setTotalCount(0)
      setHasMore(false)
      setPage(1)
    } catch (cause) {
      console.error('Error clearing notes:', cause)
      setError('Não foi possível apagar as notas.')
      throw cause
    }
  }

  return { notes, loading, loadingMore, totalCount, hasMore, error, createNote, updateNote, deleteNote, clearAllNotes, fetchNextPage, reloadNotes }
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
