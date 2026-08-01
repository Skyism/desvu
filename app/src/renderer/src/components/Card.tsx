import type { HTMLAttributes, ReactNode } from 'react'

import { cn } from '@/lib/cn'

export type CardVariant = 'surface' | 'raised' | 'band'

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /**
   * `surface` — the default white/near-black card.
   * `raised`  — a warmer second surface, for a card sitting inside or beside another.
   * `band`    — a full-width tinted band with no shadow. Synthesis uses it.
   */
  variant?: CardVariant
  /** Cormorant card title. Sentence case. */
  title?: ReactNode
  /** Right-aligned, baseline-aligned with the title. Counts, dates, "August, so far". */
  meta?: ReactNode
  /** Controls under the meta slot, e.g. a filter or a small button. */
  actions?: ReactNode
  /** Turn off the standard padding when the content needs to bleed to the edges. */
  padded?: boolean
  children?: ReactNode
}

const VARIANT: Record<CardVariant, string> = {
  surface: 'bg-card border border-line shadow-card',
  raised: 'bg-card2 border border-line shadow-card',
  band: 'bg-band border border-line',
}

/**
 * The container everything else sits in. Radius, padding, hairline and shadow all come
 * from the comp; do not restyle them per surface.
 */
export function Card({
  variant = 'surface',
  title,
  meta,
  actions,
  padded = true,
  className,
  children,
  ...rest
}: CardProps): React.JSX.Element {
  const hasHeader = title != null || meta != null || actions != null

  return (
    <section
      className={cn(
        'rounded-card min-w-0',
        VARIANT[variant],
        padded && (variant === 'band' ? 'px-8 py-[30px]' : 'px-card-x py-card'),
        className
      )}
      {...rest}
    >
      {hasHeader && (
        <header className="mb-[18px] flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          {title != null && <h2 className="text-title font-display font-normal">{title}</h2>}
          <div className="flex items-baseline gap-3">
            {meta != null && <div className="text-xs text-muted whitespace-nowrap">{meta}</div>}
            {actions}
          </div>
        </header>
      )}
      {children}
    </section>
  )
}

/**
 * The 11px uppercase eyebrow used above groups inside a card. Pairs with
 * `<CategoryMarker showLabel>`, which renders the same treatment.
 */
export function Eyebrow({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('text-label tracking-label text-muted uppercase', className)}>{children}</div>
  )
}
