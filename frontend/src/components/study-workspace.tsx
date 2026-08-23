import { useEffect, useState } from 'react'
import { BarChart3, BookOpen, CalendarDays, CheckSquare2, KeyRound, Pause, Play, RotateCcw, StickyNote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CalendarView, DashboardView, NotesView, RoadmapsView, TodoView } from '@/components/study-views'
import { AccountsView } from '@/components/accounts-view'
import { SettingsView } from '@/components/settings-view'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useUserPreferences } from '@/hooks/use-user-preferences'
import { useTranslation, type TranslationKey } from '@/lib/i18n'
import { AnimatedIcon } from '@/components/ui/animated-icon'
import { WindowControls } from '@/components/ui/window-controls'

const nav: { id: 'todo' | 'roadmaps' | 'calendar' | 'notes' | 'accounts' | 'dashboard'; labelKey: TranslationKey; icon: typeof CheckSquare2 }[] = [
  { id: 'todo', labelKey: 'nav.todo', icon: CheckSquare2 },
  { id: 'roadmaps', labelKey: 'nav.roadmaps', icon: BookOpen },
  { id: 'calendar', labelKey: 'nav.calendar', icon: CalendarDays },
  { id: 'notes', labelKey: 'nav.notes', icon: StickyNote },
  { id: 'accounts', labelKey: 'nav.accounts', icon: KeyRound },
  { id: 'dashboard', labelKey: 'nav.dashboard', icon: BarChart3 },
]

export type ViewId = (typeof nav)[number]['id'] | 'settings'

function formatTime(total: number) { const m = Math.floor(total / 60); const s = total % 60; return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}` }

function ViewPanel({ id, activeView, children }: { id: ViewId; activeView: ViewId; children: React.ReactNode }) {
  const active = id === activeView
  return <section id={`view-${id}`} hidden={!active} aria-hidden={!active} aria-labelledby={`nav-${id}`} className="w-full">
    {children}
  </section>
}

export function StudyWorkspace() {
  const [view, setView] = useState<ViewId>('todo')
  const [seconds, setSeconds] = useState(25 * 60)
  const [running, setRunning] = useState(false)
  const [focus, setFocus] = useState('Exercícios de derivadas')
  const { preferences } = useUserPreferences()
  const { t } = useTranslation()

  const initials = preferences.name
    ? preferences.name.split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
    : 'US'

  useEffect(() => { if (!running || seconds <= 0) return; const id = window.setInterval(() => setSeconds(v => v - 1), 1000); return () => window.clearInterval(id) }, [running, seconds])
  const startFocus = (title: string, minutes = 25) => { setFocus(title); setSeconds(minutes * 60); setRunning(true) }

  return <main className="min-h-screen overflow-x-hidden bg-background text-foreground">
    <header data-tauri-drag-region className="sticky top-0 z-40 border-b bg-background select-none">
      <div data-tauri-drag-region className="flex h-16 w-full items-center gap-6 pl-6 lg:pl-8">
        <div data-tauri-drag-region className="flex h-full shrink-0 items-center" aria-label="Study OS">
          <img src={`${import.meta.env.BASE_URL}logo-light-mode.svg`} alt="Study OS" className="size-[3.85rem] scale-[1.15] object-contain dark:hidden" />
          <img src={`${import.meta.env.BASE_URL}logo-dark-mode.svg`} alt="" className="hidden size-[3.85rem] scale-[1.15] object-contain dark:block" />
        </div>
        <nav data-tauri-drag-region aria-label="Navegação principal" className="flex h-full flex-1 items-center gap-1">
          {nav.map(item => (
            <button
              key={item.id}
              id={`nav-${item.id}`}
              type="button"
              aria-current={view === item.id ? 'page' : undefined}
              onClick={() => setView(item.id)}
              className={`nav-button flex h-full items-center gap-2 border-b-2 px-3 text-sm transition-colors ${
                view === item.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <AnimatedIcon><item.icon /></AnimatedIcon>
              {t(item.labelKey)}
            </button>
          ))}
        </nav>
        <Dialog>
          <DialogTrigger render={<Button variant="outline" className="h-10 min-w-52 justify-between font-mono" />}>
            <span className="flex items-center gap-2">
              <span className={`size-2 rounded-full ${running ? 'bg-primary animate-pulse' : 'bg-muted-foreground'}`} />
              {formatTime(seconds)}
            </span>
            <span className="max-w-28 truncate text-xs text-muted-foreground">{focus}</span>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t('header.focusTimer')}</DialogTitle>
              <DialogDescription>{t('header.focusSubtitle')}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col items-center gap-6 py-4">
              <div className="font-mono text-6xl font-medium tracking-tighter">{formatTime(seconds)}</div>
              <Select value={focus} onValueChange={(value) => value && setFocus(value)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {['Exercícios de derivadas','Ownership e borrowing','Daily vocabulary review','Revisão livre'].map(x => <SelectItem key={x} value={x}>{x}</SelectItem>)}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                {[25,50,90].map(m => (
                  <Button key={m} size="sm" variant="outline" onClick={() => { setSeconds(m*60); setRunning(false) }}>
                    {m}/{m === 25 ? 5 : m === 50 ? 10 : 20}
                  </Button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button onClick={() => setRunning(v => !v)}>
                  {running ? <Pause data-icon="inline-start" /> : <Play data-icon="inline-start" />}
                  {running ? t('header.pause') : t('header.start')}
                </Button>
                <Button variant="outline" onClick={() => { setRunning(false); setSeconds(25*60) }}>
                  <RotateCcw data-icon="inline-start" />
                  {t('header.reset')}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        <button
          type="button"
          aria-label={`Abrir perfil de ${preferences.name}`}
          onClick={() => setView('settings')}
          className="flex items-center gap-2.5 rounded-full px-2.5 py-1 text-left transition-colors hover:bg-accent/60 outline-offset-4 focus-visible:outline-2 focus-visible:outline-ring"
        >
          <span className="text-sm font-medium text-foreground max-w-36 truncate">{preferences.name}</span>
          <Avatar className="size-[36px]">
            <AvatarImage src={preferences.avatar || undefined} alt={`Foto de ${preferences.name}`} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </button>
        <WindowControls />
      </div>
    </header>
    <div className="w-full min-w-0 px-6 py-6 lg:px-8">
      <ViewPanel id="todo" activeView={view}><TodoView onFocus={startFocus} activeFocus={{ title: focus, seconds, running, toggleRunning: () => setRunning(v => !v) }} /></ViewPanel>
      <ViewPanel id="roadmaps" activeView={view}><RoadmapsView onFocus={startFocus} /></ViewPanel>
      <ViewPanel id="calendar" activeView={view}><CalendarView onFocus={startFocus} /></ViewPanel>
      <ViewPanel id="notes" activeView={view}><NotesView /></ViewPanel>
      <ViewPanel id="accounts" activeView={view}><AccountsView /></ViewPanel>
      <ViewPanel id="dashboard" activeView={view}><DashboardView /></ViewPanel>
      <ViewPanel id="settings" activeView={view}><SettingsView /></ViewPanel>
    </div>
  </main>
}
