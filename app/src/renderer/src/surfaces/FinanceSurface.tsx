import { useState } from 'react'
import type { Purchase } from '@shared/types'

import { Button } from '@/components/Button'
import { Page } from '@/components/Page'
import { useToast } from '@/components/Toast'
import {
  BudgetDialog,
  PurchaseDialog,
  PurchaseLog,
  SpendingCard,
  monthKeyOf,
  monthLabel,
  shiftMonth,
} from '@/components/finance'
import { ROUTES } from '@/lib/routes'
import { useMonthSummary, usePurchases } from '@/store/finance'
import { useSettings } from '@/store/settings'

/**
 * PRD F1 · F2 · F3 · F4 — spending against the limits you set, month to date.
 *
 * Three things this surface is careful about:
 *
 *   F2  Budget categories and limits are defined in-app and start EMPTY. There is no
 *       hardcoded taxonomy anywhere in this tree. The zero-category state is designed
 *       (see `SpendingCard`), not a fallback.
 *   F4  A purchase in a category that is not in settings still logs, and shows on its own
 *       line. Uncategorised gets its own line too, always last.
 *   —   Over budget renders in GOLD. `Badge`'s `danger` tone is never used here; the only
 *       red on this surface is the delete button in the purchase dialog, which genuinely
 *       destroys a record.
 */
export function FinanceSurface(): React.JSX.Element {
  const [month, setMonth] = useState(monthKeyOf())
  const [budgetOpen, setBudgetOpen] = useState(false)
  const [purchaseOpen, setPurchaseOpen] = useState(false)
  const [editing, setEditing] = useState<Purchase | null>(null)
  const { toast } = useToast()

  const settings = useSettings()
  const summary = useMonthSummary(month)
  const purchases = usePurchases()

  const currency = settings.data?.finance.currency ?? 'USD'
  const categories = settings.data?.finance.categories ?? []
  const thisMonth = monthKeyOf()

  const openNew = (): void => {
    setEditing(null)
    setPurchaseOpen(true)
  }

  const openEdit = (purchase: Purchase): void => {
    setEditing(purchase)
    setPurchaseOpen(true)
  }

  return (
    <Page
      title={ROUTES.finance.title}
      eyebrow={monthLabel(month)}
      description={ROUTES.finance.description}
      actions={
        <Button size="md" shape="pill" variant="soft" onClick={openNew}>
          Log a purchase
        </Button>
      }
    >
      <SpendingCard
        month={month}
        summary={summary}
        settings={settings}
        onEditCategories={() => setBudgetOpen(true)}
        onPrevMonth={() => setMonth((current) => shiftMonth(current, -1))}
        onNextMonth={() => setMonth((current) => shiftMonth(current, 1))}
        canGoForward={month < thisMonth}
      />

      {/* On a genuinely blank day one — no categories, nothing ever logged — the log card
          would be a second empty box restating the first. It appears the moment there is
          either a category or a purchase, and never flashes in and back out, because both
          counts read 0 until the first successful load. */}
      {(categories.length > 0 || (purchases.data?.length ?? 0) > 0) && (
        <PurchaseLog
          purchases={purchases}
          currency={currency}
          month={month}
          onAdd={openNew}
          onEdit={openEdit}
        />
      )}

      <PurchaseDialog
        open={purchaseOpen}
        onClose={() => setPurchaseOpen(false)}
        purchase={editing}
        categories={categories}
        onSaved={(message) => toast(message, { tone: 'accent' })}
      />

      <BudgetDialog
        open={budgetOpen}
        onClose={() => setBudgetOpen(false)}
        settings={settings.data}
        onSaved={(message) => toast(message, { tone: 'accent' })}
      />
    </Page>
  )
}
