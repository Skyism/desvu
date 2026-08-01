import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

export interface EmptyStateProps {
  /** Cormorant. A statement of fact, never a scold. */
  title: ReactNode
  /** One quiet line. Optional. */
  children?: ReactNode
  /** A single low-pressure action, if there is an obvious one. Optional. */
  action?: ReactNode
  /** Tighter spacing, for an empty card rather than an empty page. */
  compact?: boolean
  className?: string
}

/**
 * Empty is just empty.
 *
 * Nothing here may read as failure, backlog or nagging. No exclamation marks, no "you
 * haven't…", no counts of what is missing, no red, no illustration of a sad box. The
 * journal grid's caption — *"Empty is just empty."* — is the register for the whole app.
 *
 * Good:  "Nothing captured yet."      "No purchases logged in August."
 * Bad:   "You have 0 entries!"        "You haven't journaled in 6 days."
 */
export function EmptyState({
  title,
  children,
  action,
  compact = false,
  className,
}: EmptyStateProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 text-center',
        compact ? 'py-8' : 'py-16',
        className
      )}
    >
      <p className={cn('font-display text-ink2', compact ? 'text-lg' : 'text-hero')}>{title}</p>
      {children != null && <p className="text-muted max-w-[46ch] text-sm">{children}</p>}
      {action != null && <div className="mt-2">{action}</div>}
    </div>
  )
}
