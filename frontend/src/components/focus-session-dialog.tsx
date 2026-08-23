import { useEffect, useState } from 'react'
import { CheckCircle2, Pause, Play, RotateCcw, TimerReset } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'

type FocusStatus = 'pending' | 'available' | 'active' | 'in_progress' | 'incomplete' | 'done'

export type FocusSessionUpdate = {
  status: 'in_progress' | 'incomplete' | 'done'
  checklistState: boolean[]
  focusSeconds: number
  timerRemaining: number
}

function formatTime(total: number) {
  const minutes = Math.floor(Math.max(0, total) / 60)
  const seconds = Math.max(0, total) % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function FocusSessionDialog({
  title,
  subtitle,
  description,
  status,
  checklist,
  checklistState,
  focusSeconds = 0,
  timerRemaining = 1500,
  trigger,
  finishLabel = 'Terminar etapa',
  onSave,
}: {
  title: string
  subtitle: string
  description?: string
  status: FocusStatus
  checklist: string[]
  checklistState: boolean[]
  focusSeconds?: number
  timerRemaining?: number
  trigger: React.ReactElement
  finishLabel?: string
  onSave: (update: FocusSessionUpdate) => void | Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [focusMode, setFocusMode] = useState(false)
  const [running, setRunning] = useState(false)
  const [seconds, setSeconds] = useState(timerRemaining || 1500)
  const [spent, setSpent] = useState(0)
  const [checks, setChecks] = useState(checklistState.length === checklist.length ? checklistState : checklist.map(() => false))

  useEffect(() => {
    if (!open) return
    setSeconds(timerRemaining || 1500)
    setSpent(0)
    setChecks(checklistState.length === checklist.length ? checklistState : checklist.map(() => false))
    setFocusMode(false)
    setRunning(false)
  }, [open])

  useEffect(() => {
    if (!running || seconds <= 0) return
    const timer = window.setInterval(() => {
      setSeconds(value => Math.max(0, value - 1))
      setSpent(value => value + 1)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [running, seconds])

  useEffect(() => {
    if (seconds === 0) setRunning(false)
  }, [seconds])

  const completedCount = checks.filter(Boolean).length
  const allDone = checklist.length > 0 && completedCount === checklist.length

  const persist = async (nextStatus: FocusSessionUpdate['status']) => {
    await onSave({ status: nextStatus, checklistState: checks, focusSeconds: focusSeconds + spent, timerRemaining: seconds })
    setSpent(0)
  }

  const start = async () => {
    setFocusMode(true)
    setRunning(true)
    await persist('in_progress')
  }

  const pause = async () => {
    setRunning(false)
    await persist('incomplete')
  }

  const finish = async () => {
    setRunning(false)
    await persist('done')
    setOpen(false)
  }

  const handleOpenChange = async (nextOpen: boolean) => {
    if (!nextOpen && focusMode && status !== 'done') await persist('incomplete')
    setOpen(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent className={focusMode ? 'fixed inset-0 !left-0 !top-0 z-50 flex !h-screen !w-screen !max-w-none !translate-x-0 !translate-y-0 flex-col overflow-y-auto rounded-none border-0 bg-background p-6 sm:p-10' : 'sm:max-w-2xl'}>
        <DialogHeader>
          <DialogTitle>{focusMode ? `Modo foco · ${title}` : title}</DialogTitle>
          <DialogDescription>{subtitle}</DialogDescription>
        </DialogHeader>

        {!focusMode ? (
          <div className="flex flex-col gap-5">
            {description && <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>}
            <div className="grid gap-3 sm:grid-cols-3">
              <Card size="sm"><CardHeader><CardDescription>Estado</CardDescription><CardTitle>{status === 'incomplete' ? 'Incompleto' : status === 'done' ? 'Concluído' : 'Disponível'}</CardTitle></CardHeader></Card>
              <Card size="sm"><CardHeader><CardDescription>Checklist</CardDescription><CardTitle>{completedCount} de {checklist.length}</CardTitle></CardHeader></Card>
              <Card size="sm"><CardHeader><CardDescription>Tempo acumulado</CardDescription><CardTitle className="font-mono">{Math.floor(focusSeconds / 60)} min</CardTitle></CardHeader></Card>
            </div>
            <div className="flex flex-col gap-2">
              {checklist.map((item, index) => <div key={`${item}-${index}`} className="flex items-center gap-3 rounded-lg border p-3 text-sm"><Checkbox checked={checks[index] ?? false} disabled />{item}</div>)}
            </div>
            {status !== 'done' && <Button onClick={start}><Play data-icon="inline-start" />{status === 'incomplete' ? 'Retomar modo foco' : 'Iniciar modo foco'}</Button>}
          </div>
        ) : (
          <div className="mx-auto grid w-full max-w-5xl flex-1 content-center gap-6 lg:grid-cols-[1fr_340px]">
            <Card>
              <CardHeader>
                <CardDescription>Checklist da etapa</CardDescription>
                <CardTitle>{completedCount} de {checklist.length} concluídos</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {checklist.map((item, index) => (
                  <label key={`${item}-${index}`} className="flex cursor-pointer items-center gap-3 rounded-lg border p-4 text-sm transition-colors hover:bg-accent/50">
                    <Checkbox checked={checks[index] ?? false} onCheckedChange={value => setChecks(current => current.map((checked, itemIndex) => itemIndex === index ? Boolean(value) : checked))} />
                    <span className={checks[index] ? 'text-muted-foreground line-through' : ''}>{item}</span>
                  </label>
                ))}
                <Progress value={checklist.length ? completedCount * 100 / checklist.length : 0} className="mt-2" />
              </CardContent>
            </Card>

            <Card className="h-fit">
              <CardHeader className="text-center">
                <CardDescription>Tempo restante</CardDescription>
                <CardTitle className="font-mono text-5xl tracking-tighter">{formatTime(seconds)}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="grid grid-cols-3 gap-2">
                  {[5, 10, 25].map(minutes => <Button key={minutes} variant="outline" onClick={() => setSeconds(value => value + minutes * 60)}>+{minutes} min</Button>)}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={() => setSeconds(value => Math.max(60, value - 5 * 60))}>−5 min</Button>
                  <Button variant="outline" onClick={() => setSeconds(25 * 60)}><RotateCcw data-icon="inline-start" />25 min</Button>
                </div>
                {running ? <Button onClick={pause}><Pause data-icon="inline-start" />Pausar foco</Button> : <Button onClick={() => { setRunning(true); void persist('in_progress') }}><Play data-icon="inline-start" />Retomar</Button>}
                <Button variant="outline" disabled={!allDone} onClick={finish}><CheckCircle2 data-icon="inline-start" />{finishLabel}</Button>
                {!allDone && <p className="text-center text-xs text-muted-foreground"><TimerReset className="mr-1 inline size-3" />Conclua todos os itens para terminar.</p>}
              </CardContent>
            </Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
