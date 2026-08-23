import { useEffect, useState } from 'react'
import { ptBR } from 'date-fns/locale'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { BookOpen, Check, Circle, Clock3, FilePlus2, Loader2, MoreHorizontal, Pause, Play, Plus, RotateCcw, Search, StickyNote, Target, TimerReset, Trash2, ChevronLeft, ChevronRight as ChevronRightIcon } from 'lucide-react'
import { type Note, type Roadmap, type Task } from '@/lib/study-data'
import { useTasks, useRoadmaps, useNotes, useDashboardAnalytics } from '@/hooks/use-tauri-data'
import { useTranslation } from '@/lib/i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Calendar } from '@/components/ui/calendar'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { RoadmapCreateDialog, RoadmapEditDialog, TaskCreateDialog } from '@/components/creation-dialogs'
import { FocusSessionDialog } from '@/components/focus-session-dialog'
import { ReviewCalendarView } from '@/components/review-calendar-view'
import { InfiniteScrollSentinel } from '@/components/ui/infinite-scroll-sentinel'
import { DestructiveConfirmDialog } from '@/components/ui/destructive-confirm-dialog'
import { AnimatedIcon } from '@/components/ui/animated-icon'

function formatFocusTime(total:number) { const minutes=Math.floor(total/60); const seconds=total%60; return `${minutes.toString().padStart(2,'0')}:${seconds.toString().padStart(2,'0')}` }

const SectionTitle = ({ eyebrow, title, action }: { eyebrow: string; title: string; detail?: string; action?: React.ReactNode }) => <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end sm:gap-6"><div className="flex flex-col gap-2"><span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</span><h1 className="text-balance text-3xl font-semibold tracking-tight">{title}</h1></div>{action}</div>

export function TodoView({
  onFocus,
  activeFocus,
}: {
  onFocus: (title: string, minutes?: number) => void
  activeFocus?: {
    title: string
    seconds: number
    running: boolean
    toggleRunning: () => void
  }
}) {
  const { tasks, toggleTask, addTask, deleteTask, clearAllTasks, loadingMore, totalCount, hasMore, fetchNextPage } = useTasks()
  const { t } = useTranslation()
  const [activeTaskId, setActiveTaskId] = useState<number | string | null>(null)
  const completed = tasks.filter(t => t.done).length

  const handleStartFocus = (task: Task) => {
    setActiveTaskId(task.id)
    onFocus(task.title, task.duration)
  }

  return <>
    <SectionTitle
      eyebrow={t('todo.eyebrow')}
      title={t('todo.title')}
      detail={t('todo.detail')}
      action={
        <div className="flex items-center gap-6">
          <div className="hidden sm:flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <strong className="font-mono text-sm font-semibold text-foreground">{completed}/{totalCount}</strong>
              <span>tarefas</span>
            </span>
            <span aria-hidden="true" className="text-border">·</span>
            <span className="flex items-center gap-1.5">
              <strong className="font-mono text-sm font-semibold text-foreground">4h 10m</strong>
              <span>planejadas</span>
            </span>
            <span aria-hidden="true" className="text-border">·</span>
            <span className="flex items-center gap-1.5">
              <strong className="font-mono text-sm font-semibold text-foreground">2h 35m</strong>
              <span>foco hoje</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <DestructiveConfirmDialog
              title="Apagar todas as tarefas?"
              description="Esta ação apagará permanentemente todas as tarefas e não poderá ser desfeita."
              confirmLabel="Apagar tarefas"
              onConfirm={clearAllTasks}
              trigger={
                <Button
                  variant="outline"
                  size="sm"
                  className="text-muted-foreground hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive transition-colors"
                >
                  <Trash2 data-icon="inline-start" className="size-4" />
                  Limpar todas
                </Button>
              }
            />
            <TaskCreateDialog onCreate={t => addTask({ title: t.title, group: t.group, subject: t.subject, duration: t.duration, priority: t.priority, due: t.due })} />
          </div>
        </div>
      }
    />
    <div className="mt-4 flex w-full flex-col gap-2">
      {tasks.map(task => {
        const isFocused = activeTaskId === task.id || activeFocus?.title === task.title
        return <TaskRow key={task.id} task={task} isFocused={isFocused} activeFocus={activeFocus} onToggle={() => toggleTask(task)} onDelete={() => deleteTask(task)} onStartFocus={() => handleStartFocus(task)} />
      })}
      <InfiniteScrollSentinel hasMore={hasMore} loading={loadingMore} onLoadMore={fetchNextPage} />
    </div>
  </>
}

function TaskRow({
  task,
  isFocused,
  activeFocus,
  onToggle,
  onDelete,
  onStartFocus,
}: {
  task: Task
  isFocused?: boolean
  activeFocus?: {
    seconds: number
    running: boolean
    toggleRunning: () => void
  }
  onToggle: () => void
  onDelete: () => void
  onStartFocus: () => void
}) {
  const showFocusEffect = isFocused && !task.done
  const showFocusAnimation = showFocusEffect && Boolean(activeFocus?.running)

  return <Card className={`relative overflow-hidden py-0 transition-[box-shadow,opacity] ${showFocusAnimation ? 'ring-primary/30' : 'hover:ring-2 hover:ring-foreground/30'} ${task.done ? 'opacity-65' : ''}`}>
    {showFocusAnimation && (
      <svg className="pointer-events-none absolute inset-0 size-full text-primary" aria-hidden="true">
        <rect
          x="1"
          y="1"
          width="calc(100% - 2px)"
          height="calc(100% - 2px)"
          rx="11"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="8 6"
          className="animate-slow-dash"
        />
      </svg>
    )}
    <CardContent className="relative z-10 flex min-h-16 items-center gap-4 px-4">
      <Checkbox checked={task.done} onCheckedChange={onToggle} aria-label={`Concluir ${task.title}`} />
      <div className="min-w-0 flex-1">
        <div className={`truncate text-sm font-medium ${task.done ? 'text-muted-foreground line-through' : ''}`}>{task.title}</div>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground"><span>{task.subject}</span><span>·</span><Clock3 className="size-3" /><span>{task.duration}m</span><span>·</span><span>{task.due}</span></div>
      </div>
      <div className="flex w-24 shrink-0 items-center justify-end font-mono text-sm font-semibold tracking-tight text-foreground">
        {showFocusEffect && activeFocus ? (
          <span className="flex items-center gap-1.5">
            <span className={`size-2 rounded-full ${activeFocus.running ? 'bg-primary animate-pulse' : 'bg-muted-foreground'}`} />
            {formatFocusTime(activeFocus.seconds)}
          </span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center justify-center">
        {task.done ? (
          <Button
            size="icon"
            variant="ghost"
            disabled
            className="pointer-events-none opacity-40"
            aria-label={`Tarefa concluída: ${task.title}`}
          >
            <Play className="size-4 line-through text-muted-foreground" />
          </Button>
        ) : showFocusEffect && activeFocus ? (
          <Button
            size="icon"
            variant="ghost"
            className="nav-button"
            onClick={activeFocus.toggleRunning}
            aria-label={activeFocus.running ? "Pausar timer" : "Iniciar timer"}
          >
            <AnimatedIcon>
              {activeFocus.running ? <Pause /> : <Play />}
            </AnimatedIcon>
          </Button>
        ) : (
          <Button size="icon" variant="ghost" className="nav-button" onClick={onStartFocus} aria-label={`Focar em ${task.title}`}>
            <AnimatedIcon><Play /></AnimatedIcon>
          </Button>
        )}
      </div>
      <div className="flex w-16 shrink-0 justify-end">
        <Badge variant={task.priority === 'Alta' ? 'default' : 'secondary'}>{task.priority}</Badge>
      </div>
      <div className="flex shrink-0 items-center justify-center">
        <Button
          size="icon"
          variant="ghost"
          onClick={onDelete}
          className="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          aria-label={`Excluir ${task.title}`}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </CardContent>
  </Card>
}

export function RoadmapsView({ onFocus }: { onFocus: (title:string,minutes?:number)=>void }) {
  const { roadmaps: items, createRoadmap, updateRoadmap, updateStepProgress, deleteRoadmap, clearAllRoadmaps, loadingMore, hasMore, fetchNextPage } = useRoadmaps()
  const { t } = useTranslation()
  return <>
    <SectionTitle
      eyebrow={t('roadmaps.eyebrow')}
      title={t('roadmaps.title')}
      detail={t('roadmaps.detail')}
      action={
        <div className="flex items-center gap-2">
          <DestructiveConfirmDialog
            title="Apagar todos os roadmaps?"
            description="Esta ação apagará permanentemente todos os roadmaps e suas etapas. Não será possível desfazer."
            confirmLabel="Apagar roadmaps"
            onConfirm={clearAllRoadmaps}
            trigger={
              <Button variant="outline" size="sm" className="text-muted-foreground hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive transition-colors">
                <Trash2 data-icon="inline-start" className="size-4" />
                Limpar todos
              </Button>
            }
          />
          <RoadmapCreateDialog onCreate={roadmap => createRoadmap({ name: roadmap.name, code: roadmap.code, reviewIntervals: roadmap.reviewIntervals, steps: roadmap.steps })} />
        </div>
      }
    />
    <div className="flex flex-col gap-5">
      {items.map(r => <RoadmapExecutionCard key={r._dbId ?? r.name} roadmap={r} onDelete={() => deleteRoadmap(r)} onEdit={updateRoadmap} onStepSave={updateStepProgress} />)}
    </div>
    <InfiniteScrollSentinel hasMore={hasMore} loading={loadingMore} onLoadMore={fetchNextPage} labelEnd="Todos os roadmaps foram carregados" />
  </>
}

function RoadmapExecutionCard({ roadmap: r, onDelete, onEdit, onStepSave }: {
  roadmap: Roadmap
  onDelete: () => void
  onEdit: (roadmap: Roadmap) => void
  onStepSave: ReturnType<typeof useRoadmaps>['updateStepProgress']
}) {
  const { t } = useTranslation()
  const completedSteps = r.steps.filter(step => step.status === 'done').length
  const pendingSteps = r.steps.length - completedSteps
  const progress = r.steps.length ? Math.round(completedSteps * 100 / r.steps.length) : 0
  const statusLabel = (status: Roadmap['steps'][number]['status']) => status === 'done' ? 'Concluída' : status === 'in_progress' ? 'Em andamento' : status === 'incomplete' ? 'Incompleta' : status === 'locked' ? 'Bloqueada' : 'Disponível'

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <CardDescription className="truncate">{t('roadmaps.nextStage')}: {r.next}</CardDescription>
            <CardTitle className="mt-2 break-words text-xl">{r.name}</CardTitle>
          </div>
          <Button size="icon" variant="ghost" onClick={onDelete} className="size-8 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Excluir roadmap ${r.name}`}><Trash2 className="size-4" /></Button>
        </div>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(10rem,0.5fr)_minmax(10rem,0.5fr)] xl:gap-x-10">
          <div><div className="mb-2 flex justify-between text-xs"><span className="text-muted-foreground">{t('roadmaps.overallProgress')}</span><span className="font-mono">{progress}%</span></div><Progress value={progress} /></div>
          <Metric label={t('roadmaps.timeInvested')} value={`${r.hours.toFixed(1)}h`} />
          <Metric label="Etapas concluídas" value={`${completedSteps} de ${r.steps.length}`} />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground"><span>{t('roadmaps.nextStage')}: <strong className="font-medium text-foreground">{r.next}</strong></span><span>Etapas pendentes: <strong className="font-mono font-medium text-foreground">{pendingSteps}</strong></span><span>Revisões: <strong className="font-mono font-medium text-foreground">{(r.reviewIntervals ?? [0, 1, 3, 7]).join(', ')}d</strong></span></div>
        <div className="w-full max-w-full overflow-x-auto overscroll-x-contain pb-3">
          <div className="flex w-max min-w-max items-stretch gap-0 pr-4">
            {r.steps.map((step, index) => {
              const normalizedStatus = step.status === 'active' ? 'available' : step.status
              const locked = normalizedStatus === 'locked'
              const checks = step.checklist ?? ['Compreender os conceitos fundamentais']
              const checkState = step.checklistState ?? checks.map(() => normalizedStatus === 'done')
              const trigger = <button disabled={locked} className={`flex w-56 shrink-0 flex-col gap-3 rounded-lg border p-3 text-left transition-colors ${locked ? 'cursor-not-allowed opacity-60' : 'hover:border-primary/50 hover:bg-accent'} ${normalizedStatus === 'in_progress' ? 'border-primary bg-accent' : ''}`}>
                <div className="flex w-full items-center justify-between"><span className="font-mono text-[11px] text-muted-foreground">ETAPA {String(index + 1).padStart(2, '0')}</span>{normalizedStatus === 'done' ? <Check className="size-4" /> : normalizedStatus === 'in_progress' ? <Circle className="size-4 fill-current" /> : normalizedStatus === 'incomplete' ? <Pause className="size-4" /> : <Circle className="size-4 text-muted-foreground" />}</div>
                <div><div className="truncate text-sm font-medium">{step.title}</div><div className="mt-1 text-xs text-muted-foreground">{statusLabel(normalizedStatus)}</div></div>
                <Progress value={checks.length ? checkState.filter(Boolean).length * 100 / checks.length : 0} />
              </button>
              return <div key={step._dbId ?? `${step.title}-${index}`} className="flex items-center"><FocusSessionDialog title={step.title} subtitle={`${r.name} · Etapa ${index + 1}`} description={step.description} status={normalizedStatus === 'locked' ? 'available' : normalizedStatus} checklist={checks} checklistState={checkState} focusSeconds={step.focusSeconds} timerRemaining={step.timerRemaining} trigger={trigger} onSave={update => onStepSave(step, update)} />{index < r.steps.length - 1 && <span aria-hidden="true" className="h-px w-6 shrink-0 bg-border" />}</div>
            })}
          </div>
        </div>
        <div className="flex justify-end"><RoadmapEditDialog roadmap={r} onSave={onEdit} /></div>
      </CardContent>
    </Card>
  )
}

function RoadmapCard({ roadmap: r, onFocus, onDelete, onEdit }: { roadmap: Roadmap; onFocus:(t:string,m?:number)=>void; onDelete: () => void; onEdit: (roadmap: Roadmap) => void }) {
  const [step, setStep] = useState<Roadmap['steps'][number] | null>(null)
  const { t } = useTranslation()
  const completedSteps = r.steps.filter(step => step.status === 'done').length
  const pendingSteps = r.steps.length - completedSteps
  return <Card className="min-w-0 overflow-hidden"><CardHeader><div className="flex items-start justify-between gap-4"><div className="min-w-0"><CardDescription className="truncate">{t('roadmaps.nextStage')}: {r.next}</CardDescription></div><Button size="icon" variant="ghost" onClick={onDelete} className="size-8 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors" aria-label={`Excluir roadmap ${r.name}`}><Trash2 className="size-4" /></Button></div><Dialog><DialogTrigger render={<button type="button" className="text-left" />}><CardTitle className="break-words text-xl hover:underline">{r.name}</CardTitle></DialogTrigger><RoadmapDialog roadmap={r} onFocus={onFocus} onDelete={onDelete} /></Dialog></CardHeader><CardContent className="flex min-w-0 flex-col gap-5"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_minmax(10rem,0.5fr)_minmax(10rem,0.5fr)] xl:gap-x-10"><div><div className="mb-2 flex justify-between text-xs"><span className="text-muted-foreground">{t('roadmaps.overallProgress')}</span><span className="font-mono">{r.progress}%</span></div><Progress value={r.progress} /></div><Metric label={t('roadmaps.timeInvested')} value={`${r.hours}h`} /><Metric label="Etapas concluídas" value={`${completedSteps} de ${r.steps.length}`} /></div><div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground"><span>{t('roadmaps.nextStage')}: <strong className="font-medium text-foreground">{r.next}</strong></span><span>Etapas pendentes: <strong className="font-mono font-medium text-foreground">{pendingSteps}</strong></span></div><div className="w-full max-w-full overflow-x-auto overscroll-x-contain pb-3"><div className="flex w-max min-w-max items-stretch gap-0 pr-4">{r.steps.map((s,i) => <div key={s.title} className="flex items-center"><button onClick={() => setStep(s)} className={`flex w-56 shrink-0 flex-col gap-3 rounded-lg border p-3 text-left transition-colors hover:border-primary/50 hover:bg-accent ${s.status === 'active' ? 'border-primary bg-accent' : ''}`}><div className="flex w-full items-center justify-between"><span className="font-mono text-[11px] text-muted-foreground">{t('roadmaps.stage')} {String(i+1).padStart(2,'0')}</span>{s.status === 'done' ? <Check className="size-4" /> : s.status === 'active' ? <Circle className="size-4 fill-current" /> : <Circle className="size-4 text-muted-foreground" />}</div><div><div className="truncate text-sm font-medium">{s.title}</div><div className="mt-1 text-xs text-muted-foreground">{s.status === 'done' ? t('roadmaps.done') : s.status === 'active' ? t('roadmaps.inProgress') : t('roadmaps.locked')}</div></div><Progress value={s.status === 'done' ? 100 : 0} /></button>{i < r.steps.length - 1 && <span aria-hidden="true" className="h-px w-6 shrink-0 bg-border" />}</div>)}</div></div><div className="flex justify-end"><RoadmapEditDialog roadmap={r} onSave={onEdit} /></div></CardContent>{step && <Dialog open onOpenChange={open => !open && setStep(null)}><DialogContent><DialogHeader><DialogTitle>{step.title}</DialogTitle><DialogDescription>{r.name} · {t('roadmaps.stage')}</DialogDescription></DialogHeader><div className="grid grid-cols-3 gap-3"><Metric label="Status" value={step.status === 'done' ? 'Concluída' : step.status === 'active' ? 'Em andamento' : 'Bloqueada'} /><Metric label="Dificuldade" value="Média" /><Metric label="Confiança" value="Alta" /></div><Progress value={step.status === 'done' ? 100 : 0} /><div className="flex flex-col gap-3">{['Ler material-base','Resolver exercícios guiados','Completar revisão ativa'].map((x,i)=><label key={x} className="flex items-center gap-3 rounded-md border p-3 text-sm"><Checkbox defaultChecked={i===0} />{x}</label>)}</div><Textarea defaultValue="Anotar dúvidas, padrões e conexões desta etapa..." /><Button onClick={() => onFocus(step.title,50)}><Play data-icon="inline-start" />{t('roadmaps.startFocusSession')}</Button></DialogContent></Dialog>}</Card>
}

function Metric({ label, value }: {label:string;value:string}) { return <div className="flex flex-col gap-1"><span className="text-xs text-muted-foreground">{label}</span><span className="font-mono text-sm font-medium">{value}</span></div> }

function RoadmapDialog({roadmap:r,onFocus,onDelete}:{roadmap:Roadmap;onFocus:(t:string,m?:number)=>void;onDelete?:()=>void}) {
  const { t } = useTranslation()
  const [focusMode,setFocusMode]=useState(false); const [completed,setCompleted]=useState<string[]>(r.steps.filter(s=>s.status==='done').map(s=>s.title)); const [seconds,setSeconds]=useState(25*60); const [running,setRunning]=useState(false); useEffect(()=>{if(!running||seconds<=0)return;const id=window.setInterval(()=>setSeconds(v=>v-1),1000);return()=>window.clearInterval(id)},[running,seconds]); const toggle=(title:string)=>setCompleted(v=>v.includes(title)?v.filter(x=>x!==title):[...v,title]); return <DialogContent className={focusMode?'fixed inset-0 !left-0 !top-0 z-50 flex !h-screen !w-screen !max-w-none !translate-x-0 !translate-y-0 flex-col justify-center rounded-none border-0 bg-background p-6 sm:p-12':'sm:max-w-3xl'}>{focusMode ? <><DialogHeader><DialogTitle>{t('roadmaps.focusMode')} · {r.name}</DialogTitle><DialogDescription>{t('roadmaps.checklist')}</DialogDescription></DialogHeader><div className="grid gap-6 md:grid-cols-[1fr_220px]"><Card><CardHeader><CardDescription>{t('roadmaps.checklist')}</CardDescription><CardTitle className="text-lg">{completed.length} de {r.steps.length} {t('roadmaps.completedSessions')}</CardTitle></CardHeader><CardContent className="flex flex-col gap-3">{r.steps.map(s=><label key={s.title} className="flex items-center gap-3 rounded-md border p-3"><Checkbox checked={completed.includes(s.title)} onCheckedChange={()=>toggle(s.title)} /><span className={completed.includes(s.title)?'text-muted-foreground line-through':'text-sm'}>{s.title}</span></label>)}</CardContent></Card><Card className="h-fit"><CardHeader><CardDescription>{t('roadmaps.sessionTime')}</CardDescription><CardTitle className="font-mono text-4xl">{formatFocusTime(seconds)}</CardTitle></CardHeader><CardContent className="flex flex-col gap-3"><Button onClick={()=>setRunning(v=>!v)}>{running ? t('header.pause') : t('header.start')} {t('roadmaps.focusMode')}</Button><Button variant="outline" onClick={()=>{setRunning(false);setSeconds(25*60)}}><RotateCcw data-icon="inline-start" />{t('header.reset')}</Button><div className="flex items-center justify-center gap-2"><Button variant="outline" size="icon" aria-label="Diminuir 5 minutos" onClick={()=>setSeconds(v=>Math.max(60,v-5*60))}>−</Button><span className="text-xs text-muted-foreground">ajustar 5 min</span><Button variant="outline" size="icon" aria-label="Aumentar 5 minutos" onClick={()=>setSeconds(v=>v+5*60)}>+</Button></div></CardContent></Card></div><Button variant="outline" onClick={()=>setFocusMode(false)}>{t('roadmaps.backToRoadmap')}</Button></> : <><DialogHeader className="flex flex-row items-center justify-between pr-6"><div><DialogTitle>{r.name}</DialogTitle><DialogDescription>{t('roadmaps.detailedTracking')} {r.code}.</DialogDescription></div>{onDelete && <Button size="icon" variant="ghost" onClick={onDelete} className="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors" aria-label={`Excluir roadmap ${r.name}`}><Trash2 className="size-4" /></Button>}</DialogHeader><Tabs defaultValue="overview"><TabsList><TabsTrigger value="overview">{t('roadmaps.overview')}</TabsTrigger><TabsTrigger value="reviews">{t('roadmaps.reviews')}</TabsTrigger><TabsTrigger value="sessions">{t('roadmaps.sessions')}</TabsTrigger><TabsTrigger value="notes">{t('roadmaps.notes')}</TabsTrigger></TabsList><TabsContent value="overview" className="mt-5"><div className="grid gap-3 md:grid-cols-3"><Card><CardHeader><CardDescription>{t('roadmaps.overallProgress')}</CardDescription><CardTitle className="font-mono text-3xl">{r.progress}%</CardTitle></CardHeader></Card><Card><CardHeader><CardDescription>{t('roadmaps.completedSessions')}</CardDescription><CardTitle className="font-mono text-3xl">{Math.round(r.hours*1.4)}</CardTitle></CardHeader></Card><Card><CardHeader><CardDescription>{t('roadmaps.consistency')}</CardDescription><CardTitle className="font-mono text-3xl">{r.streak}d</CardTitle></CardHeader></Card></div><Button className="mt-5" onClick={()=>{setFocusMode(true);onFocus(r.next,25)}}><Play data-icon="inline-start" />{t('roadmaps.startFocusSession')}</Button></TabsContent><TabsContent value="reviews" className="mt-5"><Card><CardContent className="py-5 text-sm text-muted-foreground">2 revisões vencem esta semana. Próxima revisão em 1 dia.</CardContent></Card></TabsContent><TabsContent value="sessions" className="mt-5"><Card><CardContent className="py-5"><Button onClick={()=>onFocus(r.next,50)}><Play data-icon="inline-start" />Começar {r.next}</Button></CardContent></Card></TabsContent><TabsContent value="notes" className="mt-5"><Textarea defaultValue={`Notas gerais sobre ${r.name}...`} /></TabsContent></Tabs></>}</DialogContent>
}

const days = ['SEG 17','TER 18','QUA 19','QUI 20','SEX 21','SÁB 22','DOM 23']
const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']
const roadmapColors = ['bg-primary','bg-chart-2','bg-chart-3','bg-chart-4']

function YearOverview({ year, onYearChange }: { year:number; onYearChange:(year:number)=>void }) {
  const roadmapDates = [new Date(year, 1, 12), new Date(year, 3, 8), new Date(year, 6, 18), new Date(year, 9, 4)];
  const { roadmaps } = useRoadmaps()
  return <div className="flex flex-col gap-5"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><Button variant="outline" size="icon" onClick={()=>onYearChange(year-1)} aria-label="Ano anterior"><ChevronLeft /></Button><span className="min-w-20 text-center font-mono text-lg">{year}</span><Button variant="outline" size="icon" onClick={()=>onYearChange(year+1)} aria-label="Próximo ano"><ChevronRightIcon /></Button></div><Button variant="ghost" size="sm" onClick={()=>onYearChange(new Date().getFullYear())}>Hoje</Button></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{months.map((month,index)=><Card key={month} className="overflow-hidden"><CardHeader className="px-3 pb-1 pt-3"><CardTitle className="text-sm">{month}</CardTitle><CardDescription>{year}</CardDescription></CardHeader><CardContent className="px-2 pb-2"><Calendar mode="multiple" month={new Date(year,index,1)} selected={roadmapDates.filter(date=>date.getMonth()===index)} hideNavigation fixedWeeks showOutsideDays={false} className="mx-auto p-0" modifiers={{ roadmap: roadmapDates.filter(date=>date.getMonth()===index) }} modifiersClassNames={{ roadmap: 'bg-accent font-semibold text-foreground' }} locale={ptBR} /></CardContent></Card>)}</div><div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">Roadmaps</span>{roadmaps.map((roadmap,index)=><span key={roadmap.name} className="flex items-center gap-1.5"><span className={`size-2 rounded-full ${roadmapColors[index % roadmapColors.length]}`} />{roadmap.name}</span>)}</div></div>
}

function LegacyCalendarView({ onFocus }: { onFocus:(t:string,m?:number)=>void }) {
  const [mode,setMode]=useState('week'); const [year,setYear]=useState(new Date().getFullYear());
  const { roadmaps } = useRoadmaps()
  const { t } = useTranslation()
  return <><SectionTitle eyebrow={t('calendar.eyebrow')} title={t('calendar.title')} detail={t('calendar.detail')} action={<Tabs value={mode} onValueChange={setMode}><TabsList><TabsTrigger value="week">{t('calendar.week')}</TabsTrigger><TabsTrigger value="month">{t('calendar.month')}</TabsTrigger><TabsTrigger value="year">{t('calendar.year')}</TabsTrigger><TabsTrigger value="agenda">{t('calendar.agenda')}</TabsTrigger></TabsList></Tabs>} />{mode==='year' ? <YearOverview year={year} onYearChange={setYear} /> : mode==='week' ? <div className="max-w-full overflow-x-auto rounded-xl border"><div className="grid min-w-[1000px] grid-cols-7">{days.map((d,i)=><div key={d} className="min-h-[520px] border-r last:border-r-0"><div className={`border-b p-4 ${i===1?'bg-accent':''}`}><span className="font-mono text-xs">{d}</span></div><div className="flex flex-col gap-2 p-2">{i<5 && <Session title="Daily Review" time="08:00 · 1h" onClick={()=>onFocus('Daily Review',60)} />}{i===1 && <><Session title="Derivadas" time="10:00 · 50m" onClick={()=>onFocus('Derivadas',50)} /><Session title="Rust practice" time="14:30 · 50m" onClick={()=>onFocus('Rust practice',50)} /></>}{i===3 && <Session title="Physics list" time="16:00 · 90m" onClick={()=>onFocus('Physics list',90)} />}</div></div>)}</div></div> : mode==='month' ? <div className="grid grid-cols-7 overflow-hidden rounded-xl border">{Array.from({length:35},(_,i)=><div key={i} className="min-h-28 border-b border-r p-3 text-xs"><span className="font-mono text-muted-foreground">{i+1}</span>{[3,8,12,18,24,29].includes(i) && <div className="mt-4 rounded bg-accent p-2">Daily Review · 1h</div>}</div>)}</div> : <div className="flex flex-col gap-2">{days.slice(0,5).map((d,i)=><Card key={d} className="py-0"><CardContent className="flex items-center gap-5 py-4"><span className="w-20 font-mono text-xs">{d}</span><div className="flex-1"><div className="text-sm font-medium">Daily Review</div><div className="text-xs text-muted-foreground">Roadmaps ativos · prioridade média</div></div><Badge variant="outline">08:00–09:00</Badge><Button size="sm" onClick={()=>onFocus('Daily Review',60)}>{t('header.start')}</Button></CardContent></Card>)}</div>}<Card className="mt-6"><CardHeader><CardTitle className="text-base">{t('calendar.reviewStrategyTitle')}</CardTitle><CardDescription>{t('calendar.reviewStrategyDesc')}</CardDescription><CardAction><Dialog><DialogTrigger render={<Button variant="outline" size="sm">{t('calendar.configure')}</Button>} /><DialogContent><DialogHeader><DialogTitle>{t('calendar.reviewStrategyTitle')}</DialogTitle><DialogDescription>{t('calendar.reviewStrategySubtitle')}</DialogDescription></DialogHeader>{roadmaps.map(r=><div key={r.name} className="flex items-center gap-3"><span className="flex-1 text-sm">{r.name}</span><Input defaultValue="1, 3, 7, 14, 30" className="w-44 font-mono" /></div>)}<Button>{t('common.save')}</Button></DialogContent></Dialog></CardAction></CardHeader></Card></>
}

export function CalendarView({ onFocus: _onFocus }: { onFocus:(t:string,m?:number)=>void }) {
  return <ReviewCalendarView />
}

function Session({title,time,onClick}:{title:string;time:string;onClick:()=>void}) { return <button onClick={onClick} className="flex flex-col gap-1 rounded-md border bg-card p-3 text-left hover:bg-accent"><span className="text-xs font-medium">{title}</span><span className="font-mono text-[11px] text-muted-foreground">{time}</span></button> }


export function NotesView() {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftContent, setDraftContent] = useState('')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const { notes, loading, loadingMore, totalCount, hasMore, error, createNote, updateNote, deleteNote, clearAllNotes, fetchNextPage } = useNotes(debouncedQuery)

  const noteId = (note: Note) => note._dbId ?? String(note.id)
  const active = notes.find(note => noteId(note) === selectedId) ?? null

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 250)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    if (notes.length === 0) {
      setSelectedId(null)
      return
    }
    if (!selectedId || !notes.some(note => noteId(note) === selectedId)) {
      setSelectedId(noteId(notes[0]))
    }
  }, [notes, selectedId])

  useEffect(() => {
    if (!active) {
      setDraftTitle('')
      setDraftContent('')
      setSaveState('idle')
      return
    }
    setDraftTitle(active.title)
    setDraftContent(active.content)
    setSaveState('idle')
  }, [active?._dbId, active?.id])

  useEffect(() => {
    if (!active || (draftTitle === active.title && draftContent === active.content)) return
    setSaveState('saving')
    const timer = window.setTimeout(async () => {
      try {
        await updateNote(noteId(active), { title: draftTitle, content: draftContent })
        setSaveState('saved')
      } catch {
        setSaveState('error')
      }
    }, 600)
    return () => window.clearTimeout(timer)
  }, [active?._dbId, active?.id, draftTitle, draftContent])

  const handleCreate = async () => {
    setQuery('')
    setDebouncedQuery('')
    const created = await createNote()
    if (created) setSelectedId(noteId(created))
  }

  return (
    <>
      <SectionTitle
        eyebrow={t('notes.eyebrow')}
        title={t('notes.title')}
        detail={t('notes.detail')}
        action={
          <div className="flex items-center gap-2">
            {notes.length > 0 && !query && (
              <DestructiveConfirmDialog
                title="Apagar todas as notas?"
                description="Todas as notas serão apagadas permanentemente. Esta ação não pode ser desfeita."
                confirmLabel="Apagar notas"
                onConfirm={clearAllNotes}
                trigger={
                  <Button variant="outline" size="sm" className="text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 data-icon="inline-start" className="size-4" />
                    Limpar todas
                  </Button>
                }
              />
            )}
            <Button onClick={handleCreate}>
              <FilePlus2 data-icon="inline-start" className="size-4" />
              {t('notes.newNote')}
            </Button>
          </div>
        }
      />

      {error && (
        <div role="alert" className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && notes.length === 0 ? (
        <div className="flex min-h-[520px] items-center justify-center rounded-xl border bg-card/30 text-sm text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin" /> Carregando notas...
        </div>
      ) : notes.length === 0 && !query ? (
        <div className="flex min-h-[520px] flex-col items-center justify-center rounded-xl border border-dashed bg-card/20 px-6 text-center">
          <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <StickyNote className="size-7" />
          </div>
          <h2 className="text-xl font-semibold">Um lugar simples para lembrar</h2>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            Registre uma ideia, uma referência ou algo que você não quer esquecer. Só título e conteúdo.
          </p>
          <Button className="mt-6" onClick={handleCreate}>
            <FilePlus2 data-icon="inline-start" className="size-4" />
            Criar primeira nota
          </Button>
        </div>
      ) : (
        <div className="grid min-h-[620px] overflow-hidden rounded-xl border bg-card/20 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[350px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col border-r bg-card/50">
            <div className="border-b p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={event => setQuery(event.target.value)} placeholder={t('notes.searchPlaceholder')} className="pl-9" />
              </div>
              <div className="mt-3 flex items-center justify-between px-1 text-xs text-muted-foreground">
                <span>{totalCount} {totalCount === 1 ? 'nota' : 'notas'}</span>
                {query && <button type="button" className="font-medium text-foreground hover:underline" onClick={() => setQuery('')}>Limpar busca</button>}
              </div>
            </div>

            <ScrollArea className="h-[540px] flex-1">
              {notes.length === 0 ? (
                <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
                  <Search className="mb-3 size-5 text-muted-foreground" />
                  <p className="text-sm font-medium">Nenhuma nota encontrada</p>
                  <p className="mt-1 text-xs text-muted-foreground">Tente buscar por outro título ou conteúdo.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-1.5 p-3">
                  {notes.map(note => {
                    const id = noteId(note)
                    const isActive = id === selectedId
                    const preview = note.content.replace(/\s+/g, ' ').trim() || 'Nota vazia'
                    return (
                      <div key={id} className={`group flex items-start gap-1 rounded-lg border p-1 transition-colors ${isActive ? 'border-primary/40 bg-accent text-accent-foreground' : 'border-transparent hover:border-border hover:bg-accent/50'}`}>
                        <button type="button" onClick={() => setSelectedId(id)} className="min-w-0 flex-1 px-2 py-2 text-left">
                          <div className="truncate text-sm font-semibold leading-snug">{note.title || 'Sem título'}</div>
                          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{preview}</p>
                          <div className="mt-2 text-[11px] text-muted-foreground">{note.updated}</div>
                        </button>
                        <DestructiveConfirmDialog
                          title="Excluir esta nota?"
                          description={`“${note.title || 'Sem título'}” será apagada permanentemente.`}
                          confirmLabel="Excluir nota"
                          onConfirm={() => deleteNote(id)}
                          trigger={
                            <Button size="icon" variant="ghost" className="mt-1 size-7 shrink-0 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus:opacity-100 group-hover:opacity-100" aria-label={`Excluir nota ${note.title || 'sem título'}`}>
                              <Trash2 className="size-3.5" />
                            </Button>
                          }
                        />
                      </div>
                    )
                  })}
                  <InfiniteScrollSentinel hasMore={hasMore} loading={loadingMore} onLoadMore={fetchNextPage} labelEnd="Todas as notas foram carregadas" />
                </div>
              )}
            </ScrollArea>
          </aside>

          <section className="flex min-w-0 flex-1 flex-col bg-background">
            {active ? (
              <>
                <div className="flex h-14 items-center justify-between border-b px-6 lg:px-8">
                  <span className="text-xs text-muted-foreground">Atualizada {active.updated}</span>
                  <span aria-live="polite" className={`text-xs ${saveState === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {saveState === 'saving' ? 'Salvando...' : saveState === 'saved' ? 'Salvo' : saveState === 'error' ? 'Erro ao salvar' : ''}
                  </span>
                </div>
                <div className="flex w-full flex-1 flex-col px-7 py-8 lg:px-12 lg:py-10">
                  <Input
                    value={draftTitle}
                    maxLength={200}
                    onChange={event => setDraftTitle(event.target.value)}
                    onBlur={() => { if (!draftTitle.trim()) setDraftTitle('Sem título') }}
                    className="h-auto border-0 bg-transparent p-0 text-3xl font-semibold tracking-tight shadow-none focus-visible:ring-0 dark:bg-transparent lg:text-4xl"
                    placeholder="Título"
                    aria-label="Título da nota"
                  />
                  <Separator className="my-7" />
                  <Textarea
                    value={draftContent}
                    onChange={event => setDraftContent(event.target.value)}
                    className="min-h-[430px] w-full flex-1 resize-none border-0 bg-transparent p-0 text-base leading-7 shadow-none focus-visible:ring-0 dark:bg-transparent"
                    placeholder="Escreva o que você precisa lembrar..."
                    aria-label="Conteúdo da nota"
                  />
                </div>
              </>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center px-6 text-center text-muted-foreground">
                <StickyNote className="mb-3 size-6" />
                <p className="text-sm">Selecione uma nota para começar.</p>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  )
}

const focusData=[{d:'M',v:2.1},{d:'T',v:3.8},{d:'W',v:2.9},{d:'T',v:4.4},{d:'F',v:3.2},{d:'S',v:1.4},{d:'S',v:2.5}];
const subjectData=[{s:'Cálculo',v:8.5},{s:'Rust',v:6.2},{s:'Inglês',v:5.1},{s:'Física',v:3.8}];
const planData=[{d:'M',p:3,a:2.8},{d:'T',p:4,a:3.8},{d:'W',p:3,a:2.2},{d:'T',p:4,a:4.4},{d:'F',p:3,a:3.1},{d:'S',p:2,a:1.4},{d:'S',p:3,a:2.5}];
const chartConfig={v:{label:'Horas',color:'var(--chart-1)'},p:{label:'Planejado',color:'var(--chart-3)'},a:{label:'Realizado',color:'var(--chart-1)'}} satisfies ChartConfig

export function DashboardView(){
  const { roadmaps } = useRoadmaps()
  const { analytics } = useDashboardAnalytics()
  const { t } = useTranslation()

  const focusHours = Math.floor(analytics.focusTimeMinutes / 60)
  const focusMins = analytics.focusTimeMinutes % 60
  const focusFormatted = `${focusHours}h ${focusMins}m`

  return <><SectionTitle eyebrow={t('dashboard.eyebrow')} title={t('dashboard.title')} detail={t('dashboard.detail')} action={<Badge variant="outline">Aug 12–18</Badge>} /><div className="grid gap-3 md:grid-cols-4">{[[t('dashboard.focusTime'),focusFormatted,'+12%'],[t('roadmaps.completedSessions'),String(analytics.completedSessions),'+4'],[t('dashboard.executionRate'),`${analytics.executionRate}%`,'+6%'],[t('dashboard.reviewsOnTime'),`${analytics.reviewsOnTime}%`,'+3%']].map(x=><Card key={x[0]}><CardHeader><CardDescription>{x[0]}</CardDescription><CardTitle className="font-mono text-2xl">{x[1]}</CardTitle><CardAction><Badge variant="secondary">{x[2]}</Badge></CardAction></CardHeader></Card>)}</div><div className="mt-6 grid gap-5 lg:grid-cols-2"><ChartCard title={t('dashboard.dailyFocus')} desc={t('dashboard.netHoursPerDay')}><ChartContainer config={chartConfig} className="h-64 w-full"><AreaChart data={analytics.dailyFocus}><CartesianGrid vertical={false}/><XAxis dataKey="d" tickLine={false} axisLine={false}/><YAxis hide/><ChartTooltip content={<ChartTooltipContent/>}/><Area dataKey="v" type="monotone" fill="var(--color-v)" fillOpacity={0.16} stroke="var(--color-v)" /></AreaChart></ChartContainer></ChartCard><ChartCard title={t('dashboard.studyBySubject')} desc={t('dashboard.weekDistribution')}><ChartContainer config={chartConfig} className="h-64 w-full"><BarChart data={analytics.subjectStudy} layout="vertical"><CartesianGrid horizontal={false}/><XAxis type="number" hide/><YAxis dataKey="s" type="category" tickLine={false} axisLine={false} width={60}/><ChartTooltip content={<ChartTooltipContent/>}/><Bar dataKey="v" fill="var(--color-v)" radius={4}/></BarChart></ChartContainer></ChartCard><ChartCard title={t('dashboard.plannedVsActual')} desc={t('dashboard.dailyAdherence')}><ChartContainer config={chartConfig} className="h-64 w-full"><BarChart data={analytics.plannedVsActual}><CartesianGrid vertical={false}/><XAxis dataKey="d" tickLine={false} axisLine={false}/><YAxis hide/><ChartTooltip content={<ChartTooltipContent/>}/><Bar dataKey="p" fill="var(--color-p)" radius={3}/><Bar dataKey="a" fill="var(--color-a)" radius={3}/></BarChart></ChartContainer></ChartCard><Card><CardHeader><CardTitle className="text-base">{t('dashboard.roadmapProgress')}</CardTitle><CardDescription>{t('dashboard.accumulatedMastery')}</CardDescription></CardHeader><CardContent className="flex flex-col gap-5">{roadmaps.map(r=><div key={r.name}><div className="mb-2 flex justify-between text-sm"><span>{r.name}</span><span className="font-mono">{r.progress}%</span></div><Progress value={r.progress}/></div>)}</CardContent></Card></div></>
}

function ChartCard({title,desc,children}:{title:string;desc:string;children:React.ReactNode}){return <Card><CardHeader><CardTitle className="text-base">{title}</CardTitle><CardDescription>{desc}</CardDescription></CardHeader><CardContent>{children}</CardContent></Card>}
