import { Minus, Square, X } from 'lucide-react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { isTauri } from '@/lib/ipc'

type WindowAction = 'minimize' | 'maximize' | 'close'

export function WindowControls() {
  const run = (action: WindowAction) => {
    if (!isTauri()) return

    const appWindow = getCurrentWindow()
    if (action === 'minimize') void appWindow.minimize()
    if (action === 'maximize') void appWindow.toggleMaximize()
    if (action === 'close') void appWindow.close()
  }

  return (
    <div className="flex h-full shrink-0 items-stretch" aria-label="Controles da janela">
      <button
        type="button"
        className="flex w-12 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        onClick={() => run('minimize')}
        aria-label="Minimizar janela"
        title="Minimizar"
      >
        <Minus className="size-4" strokeWidth={1.5} />
      </button>
      <button
        type="button"
        className="flex w-12 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        onClick={() => run('maximize')}
        aria-label="Maximizar ou restaurar janela"
        title="Maximizar ou restaurar"
      >
        <Square className="size-3.5" strokeWidth={1.5} />
      </button>
      <button
        type="button"
        className="flex w-12 items-center justify-center text-muted-foreground transition-colors hover:bg-red-600 hover:text-white"
        onClick={() => run('close')}
        aria-label="Fechar janela"
        title="Fechar"
      >
        <X className="size-4" strokeWidth={1.5} />
      </button>
    </div>
  )
}
