import { useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'

export interface InfiniteScrollSentinelProps {
  hasMore: boolean
  loading: boolean
  onLoadMore: () => void
  labelEnd?: string
}

export function InfiniteScrollSentinel({
  hasMore,
  loading,
  onLoadMore,
  labelEnd = 'Todos os itens foram carregados',
}: InfiniteScrollSentinelProps) {
  const sentinelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore || loading) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          onLoadMore()
        }
      },
      { rootMargin: '200px' }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, loading, onLoadMore])

  return (
    <div ref={sentinelRef} className="flex items-center justify-center py-6 text-xs text-muted-foreground">
      {loading ? (
        <div className="flex items-center gap-2 font-medium text-foreground">
          <Loader2 className="size-4 animate-spin text-primary" />
          <span>Carregando mais itens...</span>
        </div>
      ) : !hasMore ? (
        <span className="italic">{labelEnd}</span>
      ) : null}
    </div>
  )
}
