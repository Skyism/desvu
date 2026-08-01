import type { CategorySpend } from '@shared/types'

import { cn } from '@/lib/cn'
import {
  barFraction,
  categoryLabel,
  formatLimit,
  formatMoney,
  formatSpendMeta,
  isOverLimit,
  overageNote,
  spentPercent,
} from './budget'

export interface BudgetBarProps {
  row: CategorySpend
  currency?: string
}

/**
 * One category's spend against its limit, ported from the comp's "Spending" card:
 * a 7px track on `--fill` with a gold bar and a `name … $184 / 250` row above it.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * OVER BUDGET IS GOLD. NEVER RED.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * This is the single most likely place in the whole app for the "red is destructive only"
 * rule to get broken, so it is broken here deliberately in the other direction. When a
 * category is over its limit:
 *
 *   · the bar stays `--accent` (gold) and fills the track exactly once — it does not
 *     change hue, it does not overflow, it does not pulse;
 *   · the label and the figure move to `--accent-text`, the AA-contrast gold-as-text
 *     token, so the row reads as *noticed* rather than as *wrong*;
 *   · the track lifts from `--fill` to `--soft`, so the whole row is gold-on-gold
 *     instead of gold-on-grey;
 *   · the overage is stated as a fact — "$62 over" — with no verb, no exclamation, and
 *     no instruction about what to do next.
 *
 * There is no `danger` tone in this file and no import that could supply one. `Badge` has
 * a `danger` tone; it is not used here and must not be. Being over budget is information
 * about the month, not damage to anything.
 */
export function BudgetBar({ row, currency = 'USD' }: BudgetBarProps): React.JSX.Element {
  const over = isOverLimit(row)
  const fraction = barFraction(row)
  const percent = spentPercent(row)
  const note = overageNote(row, currency)
  const label = categoryLabel(row.category)

  const valueText =
    row.limit === null
      ? `${label}, ${formatMoney(row.spent, currency)} spent, no limit set`
      : `${label}, ${formatMoney(row.spent, currency)} of ${formatLimit(row.limit)}${
          note ? `, ${note}` : ''
        }`

  return (
    <div className="flex flex-col gap-[7px]">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className={cn('min-w-0 truncate', over ? 'text-accent-text' : 'text-ink')}>
          {label}
        </span>
        <span
          data-numeric
          className={cn('whitespace-nowrap', over ? 'text-accent-text' : 'text-ink2')}
        >
          {formatSpendMeta(row, currency)}
          {note && <span className="text-accent-text"> · {note}</span>}
        </span>
      </div>

      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent === null ? undefined : Math.min(100, Math.max(0, percent))}
        aria-valuetext={valueText}
        className={cn('rounded-pill h-[7px] w-full overflow-hidden', over ? 'bg-soft' : 'bg-fill')}
      >
        <div
          className="bg-accent rounded-pill h-full"
          style={{ width: `${(fraction * 100).toFixed(2)}%` }}
        />
      </div>
    </div>
  )
}

export interface SpendLineProps {
  /** Rows with no limit: tracked-but-uncapped, off-budget, and uncategorised. */
  row: CategorySpend
  currency?: string
  /** Uncategorised and off-budget sit under a hairline, as in the comp. */
  muted?: boolean
}

/**
 * A category with no limit. There is nothing to be over, so there is no bar and no
 * comparison — just what was spent. This is what an unknown category looks like, and it
 * is a complete, unremarkable row: taxonomy never blocks capture (PRD F4).
 */
export function SpendLine({ row, currency = 'USD', muted = false }: SpendLineProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-3 text-sm',
        muted ? 'text-ink2' : 'text-ink'
      )}
    >
      <span className="min-w-0 truncate">{categoryLabel(row.category)}</span>
      <span data-numeric className={cn('whitespace-nowrap', muted ? undefined : 'text-ink2')}>
        {formatMoney(row.spent, currency)}
      </span>
    </div>
  )
}
