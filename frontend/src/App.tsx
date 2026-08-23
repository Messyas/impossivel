import { useEffect, useState } from 'react'
import { StudyWorkspace } from "@/components/study-workspace";
import { useUserPreferences } from '@/hooks/use-user-preferences'

function LoadingScreen() {
  return (
    <main className="grid min-h-screen place-items-center bg-background text-foreground">
      <div className="relative grid size-40 place-items-center">
        <div className="absolute inset-0 animate-spin rounded-full border-2 border-muted border-t-primary" aria-hidden="true" />
        <div className="grid size-28 place-items-center rounded-full border bg-card p-4 shadow-sm">
          <img src={`${import.meta.env.BASE_URL}logo-light-mode.svg`} alt="Study OS" className="size-20 object-contain dark:hidden" />
          <img src={`${import.meta.env.BASE_URL}logo-dark-mode.svg`} alt="" className="hidden size-20 object-contain dark:block" />
        </div>
      </div>
    </main>
  )
}

export default function App() {
  const { isHydrated } = useUserPreferences()
  const [minimumDisplayTimeElapsed, setMinimumDisplayTimeElapsed] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setMinimumDisplayTimeElapsed(true), 650)
    return () => window.clearTimeout(timer)
  }, [])

  if (!isHydrated || !minimumDisplayTimeElapsed) return <LoadingScreen />

  return <StudyWorkspace />;
}
