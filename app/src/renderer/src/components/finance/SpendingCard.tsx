import type { CategorySpend, Settings } from '@shared/types'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { EmptyState } from '@/components/EmptyState'
import { Skeleton, SkeletonLines } from '@/components/Skeleton'
import type { VaultQuery } from '@/store/useVaultQuery'
import { BudgetBar, SpendLine } from './BudgetBar'
import { formatMoney, groupSpend, monthMeta } from './budget'

export interface SpendingCardProps {
  month: string
  summary: VaultQuery<CategorySpend[]>
  settings: VaultQuery<Settings>
  /** Opens the budget-category editor. The only call to action a first run gets. */
  onEditCategories: () => void
  /** Month stepper, rendered in the card actions slot. */
  onPrevMonth?: () => void
  onNextMonth?: () => void
  canGoForward?: boolean
}

/**
 * The comp's "Spending" card: bars for the categories that have limits, then a hairline,
 * then the lines that have no limit to be measured against — off-budget categories and
 * uncategorised. Ported, not redesigned.
 *
 * Four states in the order the design system requires: not-yet → failed → empty → data.
 */
export function SpendingCard({
  month,
  summary,
  settings,
  onEditCategories,
  onPrevMonth,
  onNextMonth,
  canGoForward = false,
}: SpendingCardProps): React.JSX.Element {
  const currency = settings.data?.finance.currency ?? 'USD'
  const categories = settings.data?.finance.categories ?? []
  const rows = summary.data ?? []
  const groups = groupSpend(rows, categories.map((category) => category.name))

  const settled = summary.settled && settings.settled
  const error = summary.error ?? settings.error
  const hasCategories = categories.length > 0
  const hasSpend = rows.length > 0

  return (
    <Card
      title="Spending"
      meta={monthMeta(month)}
      actions={
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={onPrevMonth}
            aria-label="Previous month"
            disabled={!onPrevMonth}
          >
            ‹
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onNextMonth}
            aria-label="Next month"
            disabled={!canGoForward}
          >
            ›
          </Button>
          <Button size="sm" variant="ghost" onClick={onEditCategories}>
            Budget
          </Button>
        </div>
      }
    >
      {!settled && (summary.loading || settings.loading) && (
        <div className="flex flex-col gap-[15px]">
          {[0, 1, 2].map((index) => (
            <div key={index} className="flex flex-col gap-[7px]">
              <SkeletonLines lines={1} />
              <Skeleton height={7} radius="pill" />
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="text-muted text-sm">
          Spending can&apos;t be read right now. Nothing was lost — every purchase is still
          in the vault.
        </p>
      )}

      {/* Day one. No categories, no purchases. This is a real state, not an afterthought:
          it says what the surface is and offers exactly one door, without implying that
          having no budget yet is a problem to be fixed. */}
      {!error && settled && !hasCategories && !hasSpend && (
        <EmptyState
          title="No budget set yet."
          action={
            // One door, not three. The page header already carries "Log a purchase", so
            // repeating it here would make a blank day-one screen feel like a to-do list.
            <Button variant="soft" onClick={onEditCategories}>
              Add a category
            </Button>
          }
        >
          Categories and their monthly limits are yours to define — there are none built in.
          Purchases log fine without one.
        </EmptyState>
      )}

      {!error && settled && (hasCategories || hasSpend) && (
        <div className="flex flex-col gap-[15px]">
          {groups.budgeted.map((row) => (
            <BudgetBar key={row.category} row={row} currency={currency} />
          ))}

          {groups.uncapped.map((row) => (
            <SpendLine key={row.category} row={row} currency={currency} />
          ))}

          {(groups.offBudget.length > 0 || groups.uncategorised) && (
            <div className="border-line flex flex-col gap-[13px] border-t pt-[13px]">
              {groups.offBudget.map((row) => (
                <SpendLine key={row.category} row={row} currency={currency} muted />
              ))}
              {/* Its own line, always last. Money that has not been sorted is still money
                  and must never be dropped from the total. */}
              {groups.uncategorised && (
                <SpendLine row={groups.uncategorised} currency={currency} muted />
              )}
            </div>
          )}

          <div className="border-line text-muted flex items-baseline justify-between gap-3 border-t pt-[13px] text-xs">
            {/* Budgeted spend against budgeted limits. Comparing the month's NET — which
                includes income and off-budget categories — to three grocery limits would
                not be a real comparison. */}
            <span data-numeric>
              {groups.totalLimit === null
                ? 'No limits set'
                : `${formatMoney(groups.budgetedSpent, currency)} of ${formatMoney(groups.totalLimit, currency)} planned`}
            </span>
            <span data-numeric>
              {formatMoney(groups.totalSpent, currency)} {groups.hasIncome ? 'net' : 'total'}
            </span>
          </div>

          {/* Purchases exist but nothing has been budgeted. An offer, not a nag. */}
          {!hasCategories && (
            <p className="text-muted text-xs">
              Everything is off-budget until you define a category.{' '}
              <button
                type="button"
                onClick={onEditCategories}
                className="text-accent-text hover:text-ink underline underline-offset-2"
              >
                Set one up
              </button>
              .
            </p>
          )}
        </div>
      )}
    </Card>
  )
}
