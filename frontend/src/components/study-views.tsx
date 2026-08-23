import { useEffect, useState } from 'react'
import { ptBR } from 'date-fns/locale'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { BookOpen, Check, Circle, Clock3, FilePlus2, MoreHorizontal, Pause, Play, Plus, RotateCcw, Search, Target, TimerReset, Trash2, ChevronLeft, ChevronRight as ChevronRightIcon } from 'lucide-react'
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
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { RoadmapCreateDialog, StepCreateDialog, TaskCreateDialog } from '@/components/creation-dialogs'
import { InfiniteScrollSentinel } from '@/components/ui/infinite-scroll-sentinel'
import { DestructiveConfirmDialog } from '@/components/ui/destructive-confirm-dialog'
import { AnimatedIcon } from '@/components/ui/animated-icon'

function formatFocusTime(total:number) { const minutes=Math.floor(total/60); const seconds=total%60; return `${minutes.toString().padStart(2,'0')}:${seconds.toString().padStart(2,'0')}` }

const SectionTitle = ({ eyebrow, title, action }: { eyebrow: string; title: string; detail?: string; action?: React.ReactNode }) => <div className="mb-8 flex items-end justify-between gap-6"><div className="flex flex-col gap-2"><span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">{eyebrow}</span><h1 className="text-balance text-3xl font-semibold tracking-tight">{title}</h1></div>{action}</div>

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
  const { roadmaps: items, createRoadmap, addStep, deleteRoadmap, clearAllRoadmaps, loadingMore, hasMore, fetchNextPage } = useRoadmaps()
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
          <RoadmapCreateDialog onCreate={roadmap => createRoadmap({ name: roadmap.name, code: roadmap.code, steps: roadmap.steps })} />
        </div>
      }
    />
    <div className="flex flex-col gap-5">
      {items.map(r => <RoadmapCard key={r.name} roadmap={r} onFocus={onFocus} onDelete={() => deleteRoadmap(r)} onAddStep={(step,after)=> { const dbId = (r as unknown as { _dbId?: string })._dbId; if (dbId) addStep(dbId, step.title) }} />)}
    </div>
    <InfiniteScrollSentinel hasMore={hasMore} loading={loadingMore} onLoadMore={fetchNextPage} labelEnd="Todos os roadmaps foram carregados" />
  </>
}

function RoadmapCard({ roadmap: r, onFocus, onDelete, onAddStep }: { roadmap: Roadmap; onFocus:(t:string,m?:number)=>void; onDelete: () => void; onAddStep:(step:Roadmap['steps'][number],after:string)=>void }) {
  const [step, setStep] = useState<Roadmap['steps'][number] | null>(null)
  const { t } = useTranslation()
  return <Card className="overflow-hidden"><CardHeader><div className="flex items-start justify-between gap-4"><div><div className="mb-2 flex items-center gap-2"><Badge variant="outline" className="font-mono">{r.code}</Badge><span className="text-xs text-muted-foreground">{r.streak} {t('roadmaps.dayStreak')}</span></div><CardDescription>{t('roadmaps.nextStage')}: {r.next}</CardDescription></div><Button size="icon" variant="ghost" onClick={onDelete} className="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors" aria-label={`Excluir roadmap ${r.name}`}><Trash2 className="size-4" /></Button></div><Dialog><DialogTrigger render={<button type="button" className="text-left" />}><CardTitle className="text-xl hover:underline">{r.name}</CardTitle></DialogTrigger><RoadmapDialog roadmap={r} onFocus={onFocus} onDelete={onDelete} /></Dialog></CardHeader><CardContent className="flex flex-col gap-5"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="sm:col-span-2"><div className="mb-2 flex justify-between text-xs"><span className="text-muted-foreground">{t('roadmaps.overallProgress')}</span><span className="font-mono">{r.progress}%</span></div><Progress value={r.progress} /></div><Metric label={t('roadmaps.timeInvested')} value={`${r.hours}h`} /><Metric label={t('roadmaps.consistency')} value={`${r.streak}d`} /><Metric label={t('roadmaps.completedSessions')} value={`${Math.round(r.hours * 1.4)}`} /></div><div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs text-muted-foreground"><span>{t('roadmaps.nextStage')}: <strong className="font-medium text-foreground">{r.next}</strong></span><span>{t('roadmaps.averageMastery')}: <strong className="font-mono font-medium text-foreground">{r.steps.length > 0 ? Math.round(r.steps.reduce((sum, s) => sum + s.mastery, 0) / r.steps.length) : 0}%</strong></span></div><ScrollArea className="w-full whitespace-nowrap"><div className="flex w-max items-stretch gap-0 pb-3">{r.steps.map((s,i) => <div key={s.title} className="flex items-center"><button onClick={() => setStep(s)} className={`flex w-56 flex-col gap-3 rounded-lg border p-3 text-left transition-colors hover:border-primary/50 hover:bg-accent ${s.status === 'active' ? 'border-primary bg-accent' : ''}`}><div className="flex w-full items-center justify-between"><span className="font-mono text-[11px] text-muted-foreground">{t('roadmaps.stage')} {String(i+1).padStart(2,'0')}</span>{s.status === 'done' ? <Check className="size-4" /> : s.status === 'active' ? <Circle className="size-4 fill-current" /> : <Circle className="size-4 text-muted-foreground" />}</div><div><div className="truncate text-sm font-medium">{s.title}</div><div className="mt-1 text-xs text-muted-foreground">{s.status === 'done' ? t('roadmaps.done') : s.status === 'active' ? t('roadmaps.inProgress') : t('roadmaps.locked')}</div></div><Progress value={s.mastery} /></button>{i < r.steps.length - 1 && <span aria-hidden="true" className="h-px w-6 shrink-0 bg-border" />}</div>)}</div><ScrollBar orientation="horizontal" /></ScrollArea><div className="flex justify-end"><StepCreateDialog steps={r.steps} onCreate={onAddStep} /></div></CardContent>{step && <Dialog open onOpenChange={open => !open && setStep(null)}><DialogContent><DialogHeader><DialogTitle>{step.title}</DialogTitle><DialogDescription>{r.name} · {t('roadmaps.stage')}</DialogDescription></DialogHeader><div className="grid grid-cols-3 gap-3"><Metric label="Domínio" value={`${step.mastery}%`} /><Metric label="Dificuldade" value="Média" /><Metric label="Confiança" value="Alta" /></div><Progress value={step.mastery} /><div className="flex flex-col gap-3">{['Ler material-base','Resolver exercícios guiados','Completar revisão ativa'].map((x,i)=><label key={x} className="flex items-center gap-3 rounded-md border p-3 text-sm"><Checkbox defaultChecked={i===0} />{x}</label>)}</div><Textarea defaultValue="Anotar dúvidas, padrões e conexões desta etapa..." /><Button onClick={() => onFocus(step.title,50)}><Play data-icon="inline-start" />{t('roadmaps.startFocusSession')}</Button></DialogContent></Dialog>}</Card>
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

export function CalendarView({ onFocus }: { onFocus:(t:string,m?:number)=>void }) {
  const [mode,setMode]=useState('week'); const [year,setYear]=useState(new Date().getFullYear());
  const { roadmaps } = useRoadmaps()
  const { t } = useTranslation()
  return <><SectionTitle eyebrow={t('calendar.eyebrow')} title={t('calendar.title')} detail={t('calendar.detail')} action={<Tabs value={mode} onValueChange={setMode}><TabsList><TabsTrigger value="week">{t('calendar.week')}</TabsTrigger><TabsTrigger value="month">{t('calendar.month')}</TabsTrigger><TabsTrigger value="year">{t('calendar.year')}</TabsTrigger><TabsTrigger value="agenda">{t('calendar.agenda')}</TabsTrigger></TabsList></Tabs>} />{mode==='year' ? <YearOverview year={year} onYearChange={setYear} /> : mode==='week' ? <div className="max-w-full overflow-x-auto rounded-xl border"><div className="grid min-w-[1000px] grid-cols-7">{days.map((d,i)=><div key={d} className="min-h-[520px] border-r last:border-r-0"><div className={`border-b p-4 ${i===1?'bg-accent':''}`}><span className="font-mono text-xs">{d}</span></div><div className="flex flex-col gap-2 p-2">{i<5 && <Session title="Daily Review" time="08:00 · 1h" onClick={()=>onFocus('Daily Review',60)} />}{i===1 && <><Session title="Derivadas" time="10:00 · 50m" onClick={()=>onFocus('Derivadas',50)} /><Session title="Rust practice" time="14:30 · 50m" onClick={()=>onFocus('Rust practice',50)} /></>}{i===3 && <Session title="Physics list" time="16:00 · 90m" onClick={()=>onFocus('Physics list',90)} />}</div></div>)}</div></div> : mode==='month' ? <div className="grid grid-cols-7 overflow-hidden rounded-xl border">{Array.from({length:35},(_,i)=><div key={i} className="min-h-28 border-b border-r p-3 text-xs"><span className="font-mono text-muted-foreground">{i+1}</span>{[3,8,12,18,24,29].includes(i) && <div className="mt-4 rounded bg-accent p-2">Daily Review · 1h</div>}</div>)}</div> : <div className="flex flex-col gap-2">{days.slice(0,5).map((d,i)=><Card key={d} className="py-0"><CardContent className="flex items-center gap-5 py-4"><span className="w-20 font-mono text-xs">{d}</span><div className="flex-1"><div className="text-sm font-medium">Daily Review</div><div className="text-xs text-muted-foreground">Roadmaps ativos · prioridade média</div></div><Badge variant="outline">08:00–09:00</Badge><Button size="sm" onClick={()=>onFocus('Daily Review',60)}>{t('header.start')}</Button></CardContent></Card>)}</div>}<Card className="mt-6"><CardHeader><CardTitle className="text-base">{t('calendar.reviewStrategyTitle')}</CardTitle><CardDescription>{t('calendar.reviewStrategyDesc')}</CardDescription><CardAction><Dialog><DialogTrigger render={<Button variant="outline" size="sm">{t('calendar.configure')}</Button>} /><DialogContent><DialogHeader><DialogTitle>{t('calendar.reviewStrategyTitle')}</DialogTitle><DialogDescription>{t('calendar.reviewStrategySubtitle')}</DialogDescription></DialogHeader>{roadmaps.map(r=><div key={r.name} className="flex items-center gap-3"><span className="flex-1 text-sm">{r.name}</span><Input defaultValue="1, 3, 7, 14, 30" className="w-44 font-mono" /></div>)}<Button>{t('common.save')}</Button></DialogContent></Dialog></CardAction></CardHeader></Card></>
}

function Session({title,time,onClick}:{title:string;time:string;onClick:()=>void}) { return <button onClick={onClick} className="flex flex-col gap-1 rounded-md border bg-card p-3 text-left hover:bg-accent"><span className="text-xs font-medium">{title}</span><span className="font-mono text-[11px] text-muted-foreground">{time}</span></button> }

export function NotesView() {
  const { notes, createNote, updateNote, deleteNote, clearAllNotes } = useNotes()
  const { t } = useTranslation()
  const [selectedId, setSelectedId] = useState<number | string | null>(null)
  const [query, setQuery] = useState('')

  const active = notes.find(n => n.id === selectedId || (n as unknown as { _dbId?: string })._dbId === selectedId) ?? notes[0]
  const filtered = notes.filter(n => n.title.toLowerCase().includes(query.toLowerCase()))

  const handleUpdate = (patch: Partial<Note>) => {
    if (!active) return
    const dbId = (active as unknown as { _dbId?: string })._dbId || String(active.id)
    updateNote(dbId, patch)
  }

  const handleCreate = async () => {
    await createNote()
  }

  if (!active) return null

  return (
    <>
      <SectionTitle
        eyebrow={t('notes.eyebrow')}
        title={t('notes.title')}
        detail={t('notes.detail')}
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={clearAllNotes}
              className="text-muted-foreground hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive transition-colors"
            >
              <Trash2 data-icon="inline-start" className="size-4" />
              Limpar todas
            </Button>
            <Button onClick={handleCreate}>
              <FilePlus2 data-icon="inline-start" className="size-4" />
              {t('notes.newNote')}
            </Button>
          </div>
        }
      />
      <div className="grid min-h-[680px] overflow-hidden rounded-xl border lg:grid-cols-[340px_1fr] xl:grid-cols-[360px_1fr]">
        <aside className="border-r bg-card/40 flex flex-col">
          <div className="border-b p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={t('notes.searchPlaceholder')}
                className="pl-9"
              />
            </div>
          </div>
          <ScrollArea className="flex-1 h-[600px]">
            <div className="flex flex-col gap-2 p-3">
              {filtered.map(n => {
                const isActive = n.id === active.id || (n as unknown as { _dbId?: string })._dbId === (active as unknown as { _dbId?: string })._dbId
                return (
                  <div
                    key={n.id}
                    onClick={() => setSelectedId(n.id)}
                    className={`group relative flex items-start justify-between gap-3 rounded-xl border p-4 text-left transition-all cursor-pointer ${
                      isActive
                        ? 'border-primary/50 bg-accent/80 shadow-xs'
                        : 'border-border/40 bg-card/60 hover:border-border hover:bg-accent/40'
                    }`}
                  >
                    <div className="min-w-0 flex-1 flex flex-col gap-1.5">
                      <div className="truncate text-sm font-semibold text-foreground leading-snug">{n.title}</div>
                      <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
                        <span>{n.category}</span>
                        <span>{n.updated}</span>
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteNote((n as unknown as { _dbId?: string })._dbId || String(n.id))
                      }}
                      className="size-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all shrink-0 -mr-1 -mt-1"
                      aria-label={`Excluir nota ${n.title}`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        </aside>
        <section className="flex flex-col bg-background min-w-0 flex-1">
          <div className="flex items-center gap-3 border-b px-8 py-4 bg-muted/20">
            <Badge variant="outline" className="font-mono text-xs">{active.category}</Badge>
            {active.link && <span className="text-xs text-muted-foreground font-mono">· {active.link}</span>}
          </div>
          <div className="w-full flex-1 flex flex-col gap-6 p-8 lg:p-10">
            <Input
              value={active.title}
              onChange={e => handleUpdate({ title: e.target.value })}
              className="h-auto border-0 p-0 text-3xl lg:text-4xl font-bold tracking-tight shadow-none focus-visible:ring-0 text-foreground"
              placeholder="Título da nota..."
            />
            <div className="font-mono text-xs text-muted-foreground tracking-wider uppercase">
              {t('notes.updatedLabel')} {active.updated}
            </div>
            <Textarea
              value={active.content}
              onChange={e => handleUpdate({ content: e.target.value, updated: 'agora' })}
              className="min-h-[500px] flex-1 w-full resize-none border-0 p-0 font-mono text-sm leading-relaxed shadow-none focus-visible:ring-0 text-foreground/90"
              placeholder="Digite seu conteúdo..."
            />
          </div>
        </section>
      </div>
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
