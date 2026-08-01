import { useEffect, useId, useState } from 'react'
import type { BudgetCategory, Purchase } from '@shared/types'

import { Button } from '@/components/Button'
import { Dialog } from '@/components/Dialog'
import { Input } from '@/components/Input'
import { readableMessage } from '@/lib/bridge'
import { toDateString } from '@/lib/date'
import { editPurchase, logPurchase, removePurchase } from '@/store/finance'
import { categoryLabel, parseAmount } from './budget'

export interface PurchaseDialogProps {
  open: boolean
  onClose: () => void
  /** Null to log a new purchase; a record to edit one. */
  purchase?: Purchase | null
  /** Suggestions only. The field stays free text — an unknown category still logs. */
  categories: readonly BudgetCategory[]
  onSaved?: (message: string) => void
}

/**
 * Log or edit a purchase: amount, category, description, date.
 *
 * The category field is a free-text input with a `<datalist>` of the categories the user
 * has defined. Suggestions, never a whitelist — PRD F4 says a purchase in an unknown
 * category still logs, so there is deliberately no `<select>` here and no validation that
 * could reject a name.
 *
 * Amount is the only required field. Income and refunds are negative: type `-40`.
 */
export function PurchaseDialog({
  open,
  onClose,
  purchase = null,
  categories,
  onSaved,
}: PurchaseDialogProps): React.JSX.Element {
  const listId = useId()
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [date, setDate] = useState(toDateString())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setAmount(purchase ? String(purchase.amount) : '')
    setCategory(purchase?.category ?? '')
    setDescription(purchase?.description ?? '')
    setDate(purchase?.date ?? toDateString())
    setError(null)
    setSaving(false)
  }, [open, purchase])

  const save = async (): Promise<void> => {
    const parsed = parseAmount(amount)
    if (parsed === null) {
      setError('An amount is needed — a number like 12.40, or -40 for money coming in.')
      return
    }

    setSaving(true)
    try {
      if (purchase) {
        await editPurchase(purchase.id, { amount: parsed, category, description, date })
        onSaved?.('Purchase updated.')
      } else {
        await logPurchase({ amount: parsed, category, description, date })
        onSaved?.(
          category.trim() === ''
            ? 'Logged as uncategorised.'
            : `Logged to ${categoryLabel(category)}.`
        )
      }
      onClose()
    } catch (thrown) {
      // The dialog stays open with the text intact. Losing a capture to a failed write
      // is the worst thing this form could do.
      setError(readableMessage(thrown))
      setSaving(false)
    }
  }

  const discard = async (): Promise<void> => {
    if (!purchase) return
    setSaving(true)
    try {
      await removePurchase(purchase.id)
      onSaved?.('Purchase removed.')
      onClose()
    } catch (thrown) {
      setError(readableMessage(thrown))
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title={purchase ? 'Edit purchase' : 'Log a purchase'}
      description={
        purchase ? undefined : 'Income and refunds are negative — type a minus in front.'
      }
      footer={
        <>
          {purchase && (
            // The one red control on this surface, and it is red because it destroys a
            // record. Nothing about being over budget gets this treatment.
            <Button variant="destructive" size="sm" onClick={() => void discard()} disabled={saving}>
              Delete
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={saving}>
            {purchase ? 'Save' : 'Log it'}
          </Button>
        </>
      }
    >
      <div
        className="flex flex-col gap-4"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            void save()
          }
        }}
      >
        <div className="flex gap-3">
          <Input
            label="Amount"
            required
            className="flex-1"
            inputMode="decimal"
            placeholder="12.40"
            autoFocus
            value={amount}
            error={error ?? undefined}
            onChange={(event) => {
              setAmount(event.target.value)
              setError(null)
            }}
          />
          <Input
            label="Date"
            type="date"
            className="flex-1"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>

        <Input
          label="Category"
          list={listId}
          placeholder="groceries"
          hint={
            categories.length > 0
              ? 'Anything you like. A name that is not in your budget still logs.'
              : 'Optional. With no budget set, this logs as uncategorised.'
          }
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        />
        <datalist id={listId}>
          {categories.map((entry) => (
            <option key={entry.name} value={entry.name} />
          ))}
        </datalist>

        <Input
          label="Description"
          placeholder="lunch, Tepper"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
    </Dialog>
  )
}
