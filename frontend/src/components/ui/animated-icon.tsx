import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

export function AnimatedIcon({
  children,
  className,
}: {
  children: React.ReactElement
  className?: string
}) {
  const iconRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const shapes = iconRef.current?.querySelectorAll('path, line, polyline, polygon, circle, rect, ellipse')
    shapes?.forEach((shape) => shape.setAttribute('pathLength', '1'))
  }, [])

  return <span ref={iconRef} className={cn('icon', className)}>{children}</span>
}
