import React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useTranslation } from '@/lib/i18n'

export interface PaginationControlsProps {
  page: number
  totalPages: number
  perPage: number
  hasMore: boolean
  onPageChange: (newPage: number) => void
  onPerPageChange?: (newPerPage: number) => void
}

export function PaginationControls({
  page,
  totalPages,
  perPage,
  hasMore,
  onPageChange,
  onPerPageChange,
}: PaginationControlsProps) {
  const { t } = useTranslation()

  // Generate visible page numbers
  const pages: (number | string)[] = []
  const maxVisible = 5
  if (totalPages <= maxVisible + 2) {
    for (let i = 1; i <= totalPages; i++) pages.push(i)
  } else {
    pages.push(1)
    if (page > 3) pages.push('...')
    const start = Math.max(2, page - 1)
    const end = Math.min(totalPages - 1, page + 1)
    for (let i = start; i <= end; i++) pages.push(i)
    if (page < totalPages - 2) pages.push('...')
    pages.push(totalPages)
  }

  return (
    <div className="flex flex-col gap-3 border-t px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center text-xs text-muted-foreground">
        {onPerPageChange && (
          <div className="flex items-center gap-2">
            <span>{t('pagination.perPage')}</span>
            <Select value={String(perPage)} onValueChange={v => onPerPageChange(Number(v))}>
              <SelectTrigger className="h-8 w-16 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1 sm:justify-end">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label={t('pagination.previous')}
        >
          <ChevronLeft className="size-4" />
          <span className="hidden sm:inline">{t('pagination.previous')}</span>
        </Button>

        {pages.map((p, idx) =>
          typeof p === 'number' ? (
            <Button
              key={p}
              variant={p === page ? 'default' : 'outline'}
              size="sm"
              className="size-8 p-0 font-mono text-xs"
              onClick={() => onPageChange(p)}
            >
              {p}
            </Button>
          ) : (
            <span key={`dots-${idx}`} className="px-1 text-xs text-muted-foreground">
              {p}
            </span>
          )
        )}

        <Button
          variant="outline"
          size="sm"
          disabled={!hasMore && page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label={t('pagination.next')}
        >
          <span className="hidden sm:inline">{t('pagination.next')}</span>
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}
