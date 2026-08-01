import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from '@/lib/cn'

export type BadgeTone = 'neutral' | 'accent' | 'danger'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
  /** A dot, a CategoryMarker, a glyph. */
  leading?: ReactNode
  children: ReactNode
}

const TONE: Record<BadgeTone, string> = {
  neutral: 'bg-card text-ink2 border-line',
  accent: 'bg-soft text-accent-text border-accent-border',
  // Only for something that is about to be destroyed. Never for overdue, over budget,
  // or a missed day — those are gold or neutral. See the design brief.
  danger: 'bg-danger-bg text-danger border-danger-border',
}

export function Badge({
  tone = 'neutral',
  leading,
  className,
  children,
  ...rest
}: BadgeProps): React.JSX.Element {
  return (
    <span
      className={cn(
        'rounded-pill inline-flex items-center gap-2 border px-3.5 py-[7px] text-xs',
        TONE[tone],
        className
      )}
      {...rest}
    >
      {leading}
      {children}
    </span>
  )
}

/** The 6px status dot from the comp's header pills. */
export function Dot({
  tone = 'accent',
  className,
}: {
  tone?: 'accent' | 'soft' | 'faint'
  className?: string
}): React.JSX.Element {
  return (
    <span
      aria-hidden
      className={cn(
        'rounded-pill h-1.5 w-1.5 flex-none',
        tone === 'accent' && 'bg-accent',
        tone === 'soft' && 'bg-soft',
        tone === 'faint' && 'bg-faint',
        className
      )}
    />
  )
}
