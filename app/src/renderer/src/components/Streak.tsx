import type { StreakInfo } from '@shared/types'

import { cn } from '@/lib/cn'
import { Dot } from './Badge'

export interface StreakBadgeProps {
  /** Null while loading, or when the read failed. Renders nothing either way. */
  streak: StreakInfo | null
  className?: string
}

/**
 * PRD J6 — streaks may count up but may NEVER be shown as broken.
 *
 * This component is structurally incapable of it, and that is the point:
 *
 *   · `StreakInfo` has no `broken` field and no way to derive one.
 *   · There is no branch that renders the number 0. When `current` is 0 the running
 *     streak simply stops being displayed — no "0 days", no "streak lost", no reset
 *     animation, no red.
 *   · `longest` is banked permanently and is the only thing shown once a run ends. It
 *     is framed as something owned, never as something fallen from.
 *   · When there is nothing to celebrate yet, this renders `null`. Absence, not a zero.
 *
 * The journal's median gap is 1 day and its longest is 24. The habit does not decay, it
 * switches off and is hard to restart — so the moment a streak ends is the exact moment
 * the user is deciding whether to come back. Count up, never count the loss.
 *
 * If you find yourself needing "days since", stop. That number does not belong in this
 * product.
 */
export function StreakBadge({ streak, className }: StreakBadgeProps): React.JSX.Element | null {
  if (!streak) return null

  const current = Math.max(0, Math.floor(streak.current))
  const longest = Math.max(0, Math.floor(streak.longest))

  if (current >= 1) {
    return (
      <span className={cn('text-ink2 inline-flex items-center gap-2 text-xs', className)}>
        <Dot tone="accent" />
        <span data-numeric>
          {current} day{current === 1 ? '' : 's'} running
        </span>
      </span>
    )
  }

  // Not running. Show what is banked, or nothing at all — never the absence itself.
  if (longest >= 2) {
    return (
      <span className={cn('text-muted inline-flex items-center gap-2 text-xs', className)}>
        <span data-numeric>Longest run · {longest} days</span>
      </span>
    )
  }

  return null
}
