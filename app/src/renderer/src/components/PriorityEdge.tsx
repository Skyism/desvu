import type { Priority } from '@shared/types'

import { cn } from '@/lib/cn'

export interface PriorityEdgeProps {
  priority: Priority
  /** Bar height in px. 16 in a todo row. */
  height?: number
  className?: string
}

/**
 * Priority is ordered data, so it gets position and one edge treatment — never hue,
 * because it shares every row with a category marker and must not compete with it.
 *
 *   · Sort by priority within a group. Order carries the ranking at zero pixel cost.
 *   · A 2px gold edge on the left of the row, for p0 and p1 only.
 *   · No p2 / p3 labels. Unmarked means normal; show only the estimate.
 *
 * Font weight alone was tried in the first comp (400 vs 500 at 12px) and is imperceptible.
 *
 * Decorative: p0 and p1 rows already carry a `p0 ·` / `p1 ·` text prefix in their meta,
 * so this is never the only signal and is hidden from assistive tech.
 */
export function PriorityEdge({
  priority,
  height = 16,
  className,
}: PriorityEdgeProps): React.JSX.Element {
  const marked = priority <= 1
  return (
    <span
      aria-hidden
      className={cn(
        'rounded-marker w-0.5 flex-none',
        marked ? 'bg-accent' : 'bg-transparent',
        className
      )}
      style={{ height }}
    />
  )
}
