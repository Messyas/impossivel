import { useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, Plus, Trash2 } from 'lucide-react'
import type { Roadmap, Task } from '@/lib/study-data'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

const SelectField = ({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) => (
  <Field>
    <FieldLabel>{label}</FieldLabel>
    <Select value={value} onValueChange={v => v && onChange(v)}>
      <SelectTrigger className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map(option => (
            <SelectItem key={option} value={option}>{option}</SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  </Field>
)

export function TaskCreateDialog({ onCreate, trigger }: { onCreate: (task: Task) => void; trigger?: React.ReactElement }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState('Hoje')
  const [priority, setPriority] = useState('Média')
  const [duration, setDuration] = useState('25 min')
  const [subject, setSubject] = useState('Cálculo')
  const [recurrence, setRecurrence] = useState('Nenhuma')

  const create = () => {
    if (!title.trim()) return
    const minutes = Number.parseInt(duration) || 25
    onCreate({
      id: Date.now(),
      title: title.trim(),
      group: date === 'Hoje' ? 'Hoje' : 'Próximas',
      subject: subject,
      duration: minutes,
      priority: priority as 'Alta' | 'Média' | 'Baixa',
      done: false,
      due: date,
    })
    setTitle('')
    setDescription('')
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger ?? <Button><Plus data-icon="inline-start" />Nova Tarefa</Button>} />
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Criar Nova Tarefa</DialogTitle>
          <DialogDescription>Cadastre a tarefa com prazos e disciplina associada para organizar seus estudos.</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[68vh] pr-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="task-title">Título da tarefa</FieldLabel>
              <Input id="task-title" autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="ex: Exercícios de Derivadas de Ordem Superior" />
            </Field>
            <Field>
              <FieldLabel htmlFor="task-description">Descrição / Contexto</FieldLabel>
              <Textarea id="task-description" value={description} onChange={e => setDescription(e.target.value)} placeholder="Detalhes opcionais ou critério de conclusão" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField label="Data / Prazo" value={date} onChange={setDate} options={['Hoje', 'Amanhã', 'Próxima semana', 'Sem data']} />
              <SelectField label="Prioridade" value={priority} onChange={setPriority} options={['Alta', 'Média', 'Baixa']} />
              <SelectField label="Duração Estimada" value={duration} onChange={setDuration} options={['10 min', '25 min', '45 min', '60 min', '90 min']} />
              <SelectField label="Disciplina / Assunto" value={subject} onChange={setSubject} options={['Cálculo', 'Rust', 'Inglês', 'Física', 'Algoritmos', 'Sistemas', 'Geral']} />
            </div>
            <SelectField label="Recorrência" value={recurrence} onChange={setRecurrence} options={['Nenhuma', 'Diária', 'Semanal', 'Mensal']} />
            <Collapsible>
              <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-sm font-medium">
                Opções avançadas <ChevronDown className="size-4" />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field><FieldLabel>Horário preferencial</FieldLabel><Input type="time" /></Field>
                  <Field><FieldLabel>Lembrete</FieldLabel><Input placeholder="10 minutos antes" /></Field>
                  <Field><FieldLabel>Tags</FieldLabel><Input placeholder="prova, importante" /></Field>
                  <Field><FieldLabel>Contexto de estudo</FieldLabel><Input placeholder="Mesa de estudos, biblioteca..." /></Field>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </FieldGroup>
        </ScrollArea>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
          <Button disabled={!title.trim()} onClick={create}>Criar Tarefa</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type StepDraft = { title: string; description: string; checklist: string[]; hours: string; mastery: boolean; difficulty: string }
const newStep = (title = 'Nova Etapa'): StepDraft => ({ title, description: '', checklist: ['Compreender os conceitos fundamentais'], hours: '4h', mastery: true, difficulty: 'Média' })

function StepEditor({ step, onChange }: { step: StepDraft; onChange: (s: StepDraft) => void }) {
  const [item, setItem] = useState('')
  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-muted/20 p-4">
      <Field><FieldLabel>Nome da etapa</FieldLabel><Input value={step.title} onChange={e => onChange({...step, title: e.target.value})} /></Field>
      <Field><FieldLabel>Descrição da etapa</FieldLabel><Textarea value={step.description} onChange={e => onChange({...step, description: e.target.value})} placeholder="O que deve ser compreendido nesta etapa?" /></Field>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">Checklist inicial</span>
        {step.checklist.map((x, i) => (
          <div key={`${x}-${i}`} className="flex items-center gap-2">
            <Input value={x} onChange={e => onChange({...step, checklist: step.checklist.map((v, j) => j === i ? e.target.value : v)})} />
            <Button size="icon" variant="ghost" aria-label="Remover item da checklist" onClick={() => onChange({...step, checklist: step.checklist.filter((_, j) => j !== i)})}>
              <Trash2 className="size-4 text-destructive" />
            </Button>
          </div>
        ))}
        <div className="flex gap-2">
          <Input value={item} onChange={e => setItem(e.target.value)} placeholder="Adicionar item na checklist" />
          <Button variant="outline" onClick={() => { if (item.trim()) { onChange({...step, checklist: [...step.checklist, item.trim()]}); setItem('') } }}>
            <Plus data-icon="inline-start" />Adicionar
          </Button>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field><FieldLabel>Tempo estimado de estudo</FieldLabel><Input value={step.hours} onChange={e => onChange({...step, hours: e.target.value})} /></Field>
        <SelectField label="Dificuldade inicial" value={step.difficulty} onChange={difficulty => onChange({...step, difficulty})} options={['Fácil', 'Média', 'Difícil']} />
      </div>
      <label className="flex items-center gap-3 text-sm">
        <Checkbox checked={step.mastery} onCheckedChange={v => onChange({...step, mastery: Boolean(v)})} />
        Acompanhar taxa de domínio nesta etapa
      </label>
    </div>
  )
}

export function RoadmapCreateDialog({ onCreate }: { onCreate: (roadmap: Roadmap) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [goal, setGoal] = useState('')
  const [weekly, setWeekly] = useState('5h / semana')
  const [status, setStatus] = useState('Ativo')
  const [steps, setSteps] = useState<StepDraft[]>([newStep('Conceitos Iniciais'), newStep('Prática e Aplicação'), newStep('Consolidação Avançada')])
  const [selected, setSelected] = useState(0)
  const [strategy, setStrategy] = useState('Intervalos fixos')
  const [intervals, setIntervals] = useState(['0', '1', '3', '7', '30', '90'])
  const [days, setDays] = useState(['Seg', 'Qua', 'Sex'])
  const [session, setSession] = useState('50 min')

  const updateStep = (i: number, step: StepDraft) => setSteps(v => v.map((s, j) => j === i ? step : s))
  const move = (i: number, d: number) => {
    const n = i + d
    if (n < 0 || n >= steps.length) return
    const copy = [...steps]
    ;[copy[i], copy[n]] = [copy[n], copy[i]]
    setSteps(copy)
    setSelected(n)
  }
  const create = () => {
    if (!name.trim()) return
    onCreate({
      name: name.trim(),
      code: `MAP${String(Date.now()).slice(-3)}`,
      progress: 0,
      hours: 0,
      streak: 0,
      next: steps[0]?.title ?? 'Primeira etapa',
      steps: steps.map((s, i) => ({ title: s.title || `Etapa ${i + 1}`, status: i === 0 ? 'active' : 'locked', mastery: 0 })),
    })
    setName('')
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button><Plus data-icon="inline-start" />Novo Roadmap</Button>} />
      <DialogContent className="flex max-h-[88vh] flex-col sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Criar Novo Roadmap de Aprendizagem</DialogTitle>
          <DialogDescription>Monte uma trilha deliberada de estudos com etapas e revisões.</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="general" className="min-h-0 flex-1">
          <TabsList className="w-full">
            <TabsTrigger value="general">Geral</TabsTrigger>
            <TabsTrigger value="steps">Etapas</TabsTrigger>
            <TabsTrigger value="reviews">Revisões</TabsTrigger>
            <TabsTrigger value="schedule">Cronograma</TabsTrigger>
          </TabsList>
          <ScrollArea className="mt-4 h-[55vh] pr-4">
            <TabsContent value="general">
              <FieldGroup>
                <Field><FieldLabel>Nome do Roadmap</FieldLabel><Input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="ex: Cálculo I, Rust Avançado, Inglês C1" /></Field>
                <Field><FieldLabel>Descrição da trilha</FieldLabel><Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Fundamentos e aplicações práticas." /></Field>
                <Field><FieldLabel>Objetivo final</FieldLabel><Textarea value={goal} onChange={e => setGoal(e.target.value)} placeholder="O que você será capaz de fazer ao concluir?" /></Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <SelectField label="Meta semanal de estudo" value={weekly} onChange={setWeekly} options={['3h / semana', '5h / semana', '10h / semana', 'Personalizado']} />
                  <SelectField label="Status inicial" value={status} onChange={setStatus} options={['Planejado', 'Ativo', 'Pausado']} />
                </div>
              </FieldGroup>
            </TabsContent>
            <TabsContent value="steps">
              <div className="flex flex-col gap-4">
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {steps.map((s, i) => (
                    <button key={i} onClick={() => setSelected(i)} className={`min-w-36 rounded-md border px-3 py-2 text-left text-sm ${selected === i ? 'bg-accent font-medium' : 'hover:bg-accent/60'}`}>
                      <span className="block truncate">{s.title}</span>
                      <span className="font-mono text-xs text-muted-foreground">ETAPA {i + 1}</span>
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => { setSteps(v => [...v, newStep()]); setSelected(steps.length) }}>
                    <Plus data-icon="inline-start" />Adicionar Etapa
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => move(selected, -1)} aria-label="Mover para cima"><ArrowUp className="size-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => move(selected, 1)} aria-label="Mover para baixo"><ArrowDown className="size-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => { setSteps(v => v.filter((_, i) => i !== selected)); setSelected(Math.max(0, selected - 1)) }} aria-label="Remover etapa">
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
                {steps[selected] && <StepEditor step={steps[selected]} onChange={s => updateStep(selected, s)} />}
              </div>
            </TabsContent>
            <TabsContent value="reviews">
              <FieldGroup>
                <SelectField label="Estratégia de revisão" value={strategy} onChange={setStrategy} options={['Intervalos fixos', 'Repetição espaçada adaptativa', 'Revisão conceitual', 'Manutenção semestral']} />
                {strategy === 'Intervalos fixos' && (
                  <div className="flex flex-col gap-3">
                    <span className="text-sm font-medium">Intervalos em dias</span>
                    <div className="flex flex-wrap items-center gap-2">
                      {intervals.map((x, i) => (
                        <div key={i} className="flex items-center rounded-md border">
                          <Input aria-label={`Intervalo ${i + 1}`} className="w-16 border-0" value={x} onChange={e => setIntervals(v => v.map((a, j) => j === i ? e.target.value : a))} />
                          <span className="pr-2 text-xs text-muted-foreground">d</span>
                          <Button size="icon" variant="ghost" aria-label="Remover intervalo" onClick={() => setIntervals(v => v.filter((_, j) => j !== i))}>
                            <Trash2 className="size-3 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <Button className="w-fit" variant="outline" onClick={() => setIntervals(v => [...v, '14'])}>
                      <Plus data-icon="inline-start" />Adicionar intervalo
                    </Button>
                  </div>
                )}
                <label className="flex items-center gap-3 text-sm">
                  <Checkbox defaultChecked />Aplicar esta estratégia a todas as etapas do roadmap
                </label>
              </FieldGroup>
            </TabsContent>
            <TabsContent value="schedule">
              <FieldGroup>
                <Field>
                  <FieldLabel>Dias preferenciais de estudo</FieldLabel>
                  <ToggleGroup multiple value={days} onValueChange={setDays}>
                    {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map(d => (
                      <ToggleGroupItem key={d} value={d}>{d}</ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </Field>
                <SelectField label="Duração típica de cada sessão" value={session} onChange={setSession} options={['25 min', '50 min', '90 min', 'Personalizado']} />
                <Field><FieldLabel>Horário preferencial</FieldLabel><Input type="time" className="max-w-48" /></Field>
              </FieldGroup>
            </TabsContent>
          </ScrollArea>
        </Tabs>
        <Separator />
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
          <Button disabled={!name.trim()} onClick={create}>Criar Roadmap</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function StepCreateDialog({ steps, onCreate }: { steps: Roadmap['steps']; onCreate: (step: Roadmap['steps'][number], after: string) => void }) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(newStep())
  const [after, setAfter] = useState(steps[steps.length - 1]?.title ?? '')

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm"><Plus data-icon="inline-start" />Adicionar Etapa</Button>} />
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Adicionar Nova Etapa</DialogTitle>
          <DialogDescription>Inclua uma fase focada de estudo neste roadmap.</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[62vh] pr-4">
          <FieldGroup>
            <SelectField label="Inserir após a etapa" value={after} onChange={setAfter} options={steps.map(s => s.title)} />
            <StepEditor step={step} onChange={setStep} />
          </FieldGroup>
        </ScrollArea>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
          <Button disabled={!step.title.trim()} onClick={() => { onCreate({ title: step.title.trim(), status: 'locked', mastery: 0 }, after); setStep(newStep()); setOpen(false) }}>
            Criar Etapa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

