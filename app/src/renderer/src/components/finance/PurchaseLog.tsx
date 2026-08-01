import type { Purchase } from '@shared/types'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { EmptyState } from '@/components/EmptyState'
import { SkeletonLines } from '@/components/Skeleton'
import { cn } from '@/lib/cn'
import type { VaultQuery } from '@/store/useVaultQuery'
// `dayHeading` ("Today" / "Yesterday" / "Sat 26 Jul") is generic and belongs in
// `@/lib/date`, which this agent does not own. It lives next door for now — see the
// report's storage/contract notes.
import { dayHeading } from '@/components/health/nutrition'
import { categoryLabel, formatMoney, groupPurchasesByDate, isUncategorised } from './budget'

export interface PurchaseLogProps {
  purchases: VaultQuery<Purchase[]>
  currency: string
  /** Only the purchases in this `YYYY-MM`, when set. */
  month?: string
  onAdd: () => void
  onEdit: (purchase: Purchase) => void
}

/**
 * The log: amount, category, description, date — grouped by day, newest first.
 *
 * A purchase with no category renders exactly like one with a category, in the same list,
 * at the same weight, tagged "Uncategorised". Nothing about it is marked as incomplete,
 * because it is not: capture is never blocked by taxonomy (PRD F4).
 */
export function PurchaseLog({
  purchases,
  currency,
  month,
  onAdd,
  onEdit,
}: PurchaseLogProps): React.JSX.Element {
  const rows = (purchases.data ?? []).filter(
    (purchase) => month === undefined || purchase.date.slice(0, 7) === month
  )
  const days = groupPurchasesByDate(rows)

  return (
    <Card
      title="Purchases"
      meta={purchases.data ? `${rows.length} logged` : undefined}
      actions={
        <Button size="sm" variant="ghost" onClick={onAdd}>
          Add
        </Button>
      }
    >
      {!purchases.settled && purchases.loading && <SkeletonLines lines={4} />}

      {purchases.error && (
        <p className="text-muted text-sm">
          The purchase log can&apos;t be read right now. Nothing was lost — it is all still
          in the vault.
        </p>
      )}

      {!purchases.error && purchases.settled && rows.length === 0 && (
        <EmptyState
          compact
          title="Nothing logged yet."
          action={
            <Button variant="soft" size="sm" onClick={onAdd}>
              Log a purchase
            </Button>
          }
        >
          Amount, and anything else you feel like adding.
        </EmptyState>
      )}

      {!purchases.error && days.length > 0 && (
        <div className="flex flex-col gap-5">
          {days.map((day) => (
            <div key={day.date} className="flex flex-col gap-2.5">
              <div className="text-label tracking-label text-muted flex items-baseline justify-between gap-3 uppercase">
                <span>{dayHeading(day.date)}</span>
                <span data-numeric>{formatMoney(day.total, currency)}</span>
              </div>
              <ul className="flex flex-col">
                {day.purchases.map((purchase) => (
                  <li key={purchase.id}>
                    <button
                      type="button"
                      onClick={() => onEdit(purchase)}
                      className="transition-quiet rounded-block hover:bg-hover -mx-2 flex w-full items-baseline gap-3 px-2 py-2 text-left"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {purchase.description.trim() === '' ? (
                          <span className="text-muted">No description</span>
                        ) : (
                          purchase.description
                        )}
                      </span>
                      <span
                        className={cn(
                          'text-xs whitespace-nowrap',
                          isUncategorised(purchase.category) || purchase.category.trim() === ''
                            ? 'text-muted'
                            : 'text-ink2'
                        )}
                      >
                        {categoryLabel(purchase.category)}
                      </span>
                      <span data-numeric className="text-ink2 w-[86px] text-right text-sm">
                        {formatMoney(purchase.amount, currency)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
