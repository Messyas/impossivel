export type Task = { id: number; title: string; group: 'Hoje' | 'Próximas'; subject: string; duration: number; priority: 'Alta' | 'Média' | 'Baixa'; done: boolean; due: string }

export const initialTasks: Task[] = [
  { id: 1, title: 'Exercícios de derivadas', group: 'Hoje', subject: 'Cálculo', duration: 50, priority: 'Alta', done: false, due: '10:00' },
  { id: 2, title: 'Revisar ownership e borrowing', group: 'Hoje', subject: 'Rust', duration: 25, priority: 'Média', done: true, due: '14:30' },
  { id: 3, title: 'Daily vocabulary review', group: 'Hoje', subject: 'Inglês', duration: 25, priority: 'Baixa', done: false, due: '18:00' },
  { id: 4, title: 'Lista de cinemática', group: 'Próximas', subject: 'Física', duration: 90, priority: 'Alta', done: false, due: 'Amanhã' },
  { id: 5, title: 'Capítulo 6 — Lifetimes', group: 'Próximas', subject: 'Rust', duration: 50, priority: 'Média', done: false, due: 'Qua, 20' },
]

export type RoadmapStepStatus = 'locked' | 'available' | 'active' | 'in_progress' | 'incomplete' | 'done'
export type RoadmapStep = {
  _dbId?: string
  title: string
  status: RoadmapStepStatus
  mastery: number
  description?: string
  checklist?: string[]
  checklistState?: boolean[]
  focusSeconds?: number
  timerRemaining?: number
  completedAt?: string
}
export type Roadmap = {
  _dbId?: string
  name: string
  code: string
  progress: number
  hours: number
  streak: number
  next: string
  reviewIntervals?: number[]
  steps: RoadmapStep[]
}

export type ReviewOccurrence = {
  id: string
  roadmapId: string
  roadmapName: string
  stepId: string
  stepTitle: string
  intervalDays: number
  dueDate: string
  status: 'pending' | 'in_progress' | 'incomplete' | 'done'
  checklist: string[]
  checklistState: boolean[]
  focusSeconds: number
  timerRemaining: number
  completedAt?: string
}
export const roadmaps: Roadmap[] = [
  { name: 'Cálculo I', code: 'MAT101', progress: 64, hours: 28, streak: 8, next: 'Aplicações de derivadas', steps: [{ title: 'Limites e continuidade', status: 'done', mastery: 92 }, { title: 'Definição de derivada', status: 'done', mastery: 84 }, { title: 'Regras de derivação', status: 'active', mastery: 68 }, { title: 'Aplicações de derivadas', status: 'locked', mastery: 0 }, { title: 'Integrais', status: 'locked', mastery: 0 }] },
  { name: 'Rust', code: 'DEV204', progress: 47, hours: 19, streak: 5, next: 'Lifetimes', steps: [{ title: 'Fundamentos', status: 'done', mastery: 88 }, { title: 'Ownership', status: 'done', mastery: 79 }, { title: 'Structs & enums', status: 'active', mastery: 61 }, { title: 'Lifetimes', status: 'locked', mastery: 0 }, { title: 'Concorrência', status: 'locked', mastery: 0 }] },
  { name: 'English C1', code: 'LAN310', progress: 72, hours: 42, streak: 14, next: 'Academic writing', steps: [{ title: 'Core vocabulary', status: 'done', mastery: 94 }, { title: 'Listening', status: 'done', mastery: 86 }, { title: 'Speaking drills', status: 'active', mastery: 74 }, { title: 'Academic writing', status: 'locked', mastery: 0 }, { title: 'Mock exam', status: 'locked', mastery: 0 }] },
  { name: 'Física I', code: 'PHY110', progress: 31, hours: 13, streak: 3, next: 'Leis de Newton', steps: [{ title: 'Grandezas e vetores', status: 'done', mastery: 82 }, { title: 'Cinemática', status: 'active', mastery: 57 }, { title: 'Leis de Newton', status: 'locked', mastery: 0 }, { title: 'Energia', status: 'locked', mastery: 0 }, { title: 'Momento', status: 'locked', mastery: 0 }] },
]

export type Note = { id: number; title: string; category: string; link: string; updated: string; content: string }
export const initialNotes: Note[] = [
  { id: 1, title: 'Regras de derivação', category: 'Cálculo', link: 'Cálculo I / Etapa 3', updated: 'há 12 min', content: '# Regras de derivação\n\n## Regra do produto\n\nSe **f** e **g** são diferenciáveis, então:\n\n(fg)′ = f′g + fg′\n\n## Pontos de atenção\n\n- Não distribuir a derivada sobre o produto.\n- Simplificar a expressão antes de derivar.\n- Verificar o domínio da função resultante.' },
  { id: 2, title: 'Ownership mental model', category: 'Rust', link: 'Rust / Ownership', updated: 'ontem', content: '# Ownership mental model\n\nCada valor em Rust possui uma variável chamada owner. Só pode existir um owner por vez. Quando o owner sai do escopo, o valor é descartado.' },
  { id: 3, title: 'C1 vocabulary — week 8', category: 'Inglês', link: 'English C1', updated: '2 dias', content: '# Vocabulary — week 8\n\n- **ubiquitous** — found everywhere\n- **nuanced** — characterized by subtle distinctions\n- **convey** — communicate or make known' },
]
