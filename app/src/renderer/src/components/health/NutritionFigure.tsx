import { cn } from '@/lib/cn'
import { formatMacros } from './nutrition'

export interface NutritionFigureProps {
  calories: number | null
  protein: number | null
  /** Set by the sort skill when it guessed the numbers rather than reading them. */
  estimated: boolean
  className?: string
}

/**
 * `340 cal · 12g` — and the typography *is* the disclaimer.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * ESTIMATED → italic Cormorant.  MEASURED → DM Sans.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * An agent-estimated figure is set in italic Cormorant via `.text-estimate`, exactly as
 * in the approved comp. That is the whole disclaimer: a guess and a measurement are
 * distinguishable at a glance, with no badge, no asterisk, and no legend to read. (The
 * `~` prefix is belt-and-braces for anyone reading a screenshot at low resolution.)
 *
 * Italic in this app is always Cormorant — there is no DM Sans italic cut — so an italic
 * number and an estimated number are the same thing by construction.
 *
 * Renders NOTHING when there are no numbers. A meal logged as "chipotle bowl" with no
 * calories is a complete entry; it does not get an em-dash placeholder implying that
 * something is missing.
 */
export function NutritionFigure({
  calories,
  protein,
  estimated,
  className,
}: NutritionFigureProps): React.JSX.Element | null {
  const text = formatMacros(calories, protein, estimated)
  if (text === null) return null

  return (
    <span
      data-estimated={estimated || undefined}
      className={cn(
        'whitespace-nowrap',
        estimated ? 'text-estimate text-base' : 'text-ink2 text-xs',
        className
      )}
    >
      {estimated && <span className="sr-only">Estimated: </span>}
      <span data-numeric>{text}</span>
    </span>
  )
}

/**
 * The one-line footnote from the comp, shown under a list that contains any estimate.
 * Present only when there is actually an estimate on screen to explain.
 */
export function EstimateNote({ className }: { className?: string }): React.JSX.Element {
  return (
    <p className={cn('text-muted text-micro leading-[1.5]', className)}>
      <span className="text-estimate">Italic figures</span> are the agent&apos;s estimate, not a
      measurement.
    </p>
  )
}
