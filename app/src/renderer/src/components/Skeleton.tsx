import { cn } from '@/lib/cn'

export interface SkeletonProps {
  /** Any CSS length. Defaults to full width. */
  width?: string | number
  height?: string | number
  /** Match the radius of whatever this is standing in for. */
  radius?: 'field' | 'control' | 'panel' | 'card' | 'pill'
  className?: string
}

const RADIUS = {
  field: 'rounded-field',
  control: 'rounded-control',
  panel: 'rounded-panel',
  card: 'rounded-card',
  pill: 'rounded-pill',
} as const

/**
 * A placeholder while a vault read is in flight. Uses `--fill`, the same token as an
 * inert track, so a loading card reads as "not yet" rather than as a broken one.
 */
export function Skeleton({
  width = '100%',
  height = 14,
  radius = 'field',
  className,
}: SkeletonProps): React.JSX.Element {
  return (
    <span
      aria-hidden
      className={cn('bg-fill block animate-pulse', RADIUS[radius], className)}
      style={{ width, height }}
    />
  )
}

/** A few stacked lines, for a list or a paragraph that has not arrived yet. */
export function SkeletonLines({
  lines = 3,
  className,
}: {
  lines?: number
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('flex flex-col gap-2.5', className)} aria-hidden>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} width={index === lines - 1 ? '62%' : '100%'} />
      ))}
    </div>
  )
}
