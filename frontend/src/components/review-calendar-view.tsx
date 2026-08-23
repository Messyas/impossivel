import { useMemo, useState } from 'react'
import { AlertCircle, CalendarDays, CheckCircle2, Clock3, Filter } from 'lucide-react'
import { ptBR } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Calendar } from '@/components/ui/calendar'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FocusSessionDialog } from '@/components/focus-session-dialog'
import { useReviews } from '@/hooks/use-tauri-data'
import type { ReviewOccurrence } from '@/lib/study-data'

function dateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function ReviewRow({ review, onSave }: { review: ReviewOccurrence; onSave: ReturnType<typeof useReviews>['updateReviewProgress'] }) {
  const today = dateKey(new Date())
  const overdue = review.status !== 'done' && review.dueDate < today
  return (
    <Card className="py-0">
      <CardContent className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full ${review.status === 'done' ? 'bg-primary text-primary-foreground' : overdue ? 'bg-destructive/10 text-destructive' : 'bg-muted'}`}>
            {review.status === 'done' ? <CheckCircle2 className="size-4" /> : overdue ? <AlertCircle className="size-4" /> : <Clock3 className="size-4" />}
          </span>
          <div className="min-w-0">
            <div className="truncate font-medium">{review.stepTitle}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{review.roadmapName}</span><span>·</span><span>{review.dueDate}</span><span>·</span><span>intervalo de {review.intervalDays}d</span>
            </div>
          </div>
        </div>
        <Badge variant={review.status === 'done' ? 'secondary' : overdue ? 'destructive' : 'outline'}>{review.status === 'done' ? 'Concluída' : overdue ? 'Atrasada' : review.status === 'incomplete' ? 'Incompleta' : 'Pendente'}</Badge>
        {review.status !== 'done' && <FocusSessionDialog
          title={review.stepTitle}
          subtitle={`Revisão · ${review.roadmapName} · intervalo de ${review.intervalDays} dias`}
          status={review.status}
          checklist={review.checklist}
          checklistState={review.checklistState}
          focusSeconds={review.focusSeconds}
          timerRemaining={review.timerRemaining}
          finishLabel="Concluir revisão"
          onSave={update => onSave(review, update)}
          trigger={<Button size="sm">{review.status === 'incomplete' ? 'Retomar revisão' : 'Iniciar revisão'}</Button>}
        />}
      </CardContent>
    </Card>
  )
}

export function ReviewCalendarView() {
  const { reviews, loading, updateReviewProgress } = useReviews()
  const [roadmapFilter, setRoadmapFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('pending')
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date())
  const [view, setView] = useState<'queue' | 'month'>('queue')
  const today = dateKey(new Date())
  const roadmapNames = [...new Set(reviews.map(review => review.roadmapName))]

  const filtered = useMemo(() => reviews.filter(review => {
    if (roadmapFilter !== 'all' && review.roadmapId !== roadmapFilter) return false
    if (statusFilter === 'pending' && review.status === 'done') return false
    if (statusFilter === 'done' && review.status !== 'done') return false
    if (view === 'month' && selectedDate && review.dueDate !== dateKey(selectedDate)) return false
    return true
  }), [reviews, roadmapFilter, statusFilter, view, selectedDate])

  const pending = reviews.filter(review => review.status !== 'done')
  const dueToday = pending.filter(review => review.dueDate === today).length
  const overdue = pending.filter(review => review.dueDate < today).length
  const upcoming = pending.filter(review => review.dueDate > today).length
  const reviewDates = reviews.filter(review => review.status !== 'done').map(review => new Date(`${review.dueDate}T12:00:00`))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">Fila de aprendizagem</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Revisões</h1><p className="mt-2 text-sm text-muted-foreground">Todas as revisões geradas pelas etapas concluídas, em uma única fila.</p></div>
        <div className="flex gap-2"><Button variant={view === 'queue' ? 'default' : 'outline'} size="sm" onClick={() => setView('queue')}>Fila</Button><Button variant={view === 'month' ? 'default' : 'outline'} size="sm" onClick={() => setView('month')}><CalendarDays data-icon="inline-start" />Calendário</Button></div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card size="sm"><CardHeader><CardDescription>Atrasadas</CardDescription><CardTitle className="font-mono text-2xl text-destructive">{overdue}</CardTitle></CardHeader></Card>
        <Card size="sm"><CardHeader><CardDescription>Para hoje</CardDescription><CardTitle className="font-mono text-2xl">{dueToday}</CardTitle></CardHeader></Card>
        <Card size="sm"><CardHeader><CardDescription>Próximas</CardDescription><CardTitle className="font-mono text-2xl">{upcoming}</CardTitle></CardHeader></Card>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card/40 p-3">
        <Filter className="size-4 text-muted-foreground" />
        <Select value={roadmapFilter} onValueChange={value => value && setRoadmapFilter(value)}><SelectTrigger className="min-w-48"><SelectValue placeholder="Todos os roadmaps" /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="all">Todos os roadmaps</SelectItem>{roadmapNames.map(name => { const item = reviews.find(review => review.roadmapName === name)!; return <SelectItem key={item.roadmapId} value={item.roadmapId}>{name}</SelectItem> })}</SelectGroup></SelectContent></Select>
        <Select value={statusFilter} onValueChange={value => value && setStatusFilter(value)}><SelectTrigger className="min-w-40"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="pending">Pendentes</SelectItem><SelectItem value="done">Concluídas</SelectItem><SelectItem value="all">Todas</SelectItem></SelectGroup></SelectContent></Select>
        {(roadmapFilter !== 'all' || statusFilter !== 'pending') && <button className="text-sm text-muted-foreground hover:text-foreground" onClick={() => { setRoadmapFilter('all'); setStatusFilter('pending') }}>Limpar filtros</button>}
      </div>

      {view === 'month' && <div className="grid gap-5 lg:grid-cols-[360px_1fr]"><Card><CardContent className="py-4"><Calendar mode="single" selected={selectedDate} onSelect={setSelectedDate} locale={ptBR} modifiers={{ review: reviewDates }} modifiersClassNames={{ review: 'bg-accent font-semibold text-foreground' }} className="mx-auto" /></CardContent></Card><div className="flex flex-col gap-2"><h2 className="font-semibold">Revisões de {selectedDate?.toLocaleDateString('pt-BR') ?? 'hoje'}</h2>{filtered.map(review => <ReviewRow key={review.id} review={review} onSave={updateReviewProgress} />)}</div></div>}

      {view === 'queue' && <div className="flex flex-col gap-2">{filtered.map(review => <ReviewRow key={review.id} review={review} onSave={updateReviewProgress} />)}</div>}
      {!loading && filtered.length === 0 && <div className="rounded-xl border border-dashed py-16 text-center"><CheckCircle2 className="mx-auto mb-3 size-8 text-muted-foreground" /><p className="font-medium">Nenhuma revisão nesta seleção</p><p className="mt-1 text-sm text-muted-foreground">Conclua uma etapa de roadmap para alimentar a fila.</p></div>}
    </div>
  )
}
