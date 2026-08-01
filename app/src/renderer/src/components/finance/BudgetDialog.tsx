import { useEffect, useState } from 'react'
import type { BudgetCategory, Settings } from '@shared/types'

import { Button } from '@/components/Button'
import { Dialog } from '@/components/Dialog'
import { Eyebrow } from '@/components/Card'
import { Input, Select } from '@/components/Input'
import { readableMessage } from '@/lib/bridge'
import { saveBudgetCategories } from '@/store/finance'
import { updateSettings } from '@/store/settings'
import { nameIsTaken } from './budget'

interface DraftRow {
  name: string
  /** As typed. Blank means "tracked but uncapped", which is a real, supported choice. */
  limit: string
}

export interface BudgetDialogProps {
  open: boolean
  onClose: () => void
  settings: Settings | null
  onSaved?: (message: string) => void
}

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CNY', 'INR', 'CHF', 'SEK']

/**
 * The budget editor. This is the only place budget categories come from — there is no
 * built-in taxonomy anywhere in the app, and `settings.finance.categories` ships empty.
 *
 * Everything in `settings.finance` is editable here: the categories and their limits, the
 * currency, and which day of the month the budget period starts on (for a user whose
 * money arrives on the 15th). None of it is ever a code change.
 *
 * A blank limit is not an error — it means "track this, don't cap it". The row then has
 * nothing to be over, and renders as a plain amount rather than a bar.
 */
export function BudgetDialog({
  open,
  onClose,
  settings,
  onSaved,
}: BudgetDialogProps): React.JSX.Element {
  const [rows, setRows] = useState<DraftRow[]>([])
  const [currency, setCurrency] = useState('USD')
  const [startsOn, setStartsOn] = useState('1')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setRows(
      (settings?.finance.categories ?? []).map((category) => ({
        name: category.name,
        limit: category.limit === null ? '' : String(category.limit),
      }))
    )
    setCurrency(settings?.finance.currency ?? 'USD')
    setStartsOn(String(settings?.finance.month_starts_on ?? 1))
    setError(null)
    setSaving(false)
  }, [open, settings])

  const setRow = (index: number, patch: Partial<DraftRow>): void => {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)))
    setError(null)
  }

  const save = async (): Promise<void> => {
    const cleaned: BudgetCategory[] = []
    for (const row of rows) {
      const name = row.name.trim()
      if (name === '') continue // a blank row the user never filled in is just dropped
      if (nameIsTaken(name, cleaned)) {
        setError(`“${name}” is in the list twice. One line per category.`)
        return
      }
      const raw = row.limit.trim()
      if (raw !== '' && !/^\d*\.?\d+$/.test(raw)) {
        setError(`The limit for “${name}” should be a number, or blank for no limit.`)
        return
      }
      cleaned.push({ name, limit: raw === '' ? null : Number(raw) })
    }

    const day = Number(startsOn)
    if (!Number.isInteger(day) || day < 1 || day > 28) {
      setError('The month can start on any day from 1 to 28.')
      return
    }

    setSaving(true)
    try {
      await saveBudgetCategories(cleaned)
      await updateSettings({ finance: { currency, month_starts_on: day } })
      onSaved?.(cleaned.length === 0 ? 'Budget cleared.' : 'Budget saved.')
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
      size="md"
      title="Budget"
      description="Your categories, your limits. Nothing here is built in, and a purchase in a category you have not defined still logs."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={saving}>
            Save budget
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline gap-3">
            <Eyebrow className="flex-1">Category</Eyebrow>
            <Eyebrow className="w-[120px]">Monthly limit</Eyebrow>
            <span className="w-8" aria-hidden />
          </div>

          {rows.length === 0 && (
            <p className="text-muted text-sm">
              No categories yet. Add one whenever you feel like it — spending is tracked
              either way.
            </p>
          )}

          {rows.map((row, index) => (
            <div key={index} className="flex items-start gap-3">
              <Input
                className="flex-1"
                aria-label={`Category ${index + 1} name`}
                placeholder="groceries"
                value={row.name}
                onChange={(event) => setRow(index, { name: event.target.value })}
              />
              <Input
                className="w-[120px]"
                aria-label={`Category ${index + 1} monthly limit`}
                inputMode="decimal"
                placeholder="none"
                value={row.limit}
                onChange={(event) => setRow(index, { limit: event.target.value })}
              />
              <Button
                size="md"
                variant="ghost"
                aria-label={`Remove ${row.name.trim() || `category ${index + 1}`}`}
                className="w-8 px-0"
                onClick={() => {
                  setRows((current) => current.filter((_, i) => i !== index))
                  setError(null)
                }}
              >
                ×
              </Button>
            </div>
          ))}

          <div>
            <Button
              variant="soft"
              size="sm"
              onClick={() => setRows((current) => [...current, { name: '', limit: '' }])}
            >
              Add a category
            </Button>
          </div>

          {/* Gold, per the design system — a form problem is information, not damage. */}
          {error && <p className="text-accent-text text-xs">{error}</p>}
        </div>

        <div className="border-line flex gap-3 border-t pt-4">
          <Select
            label="Currency"
            className="flex-1"
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
          >
            {(CURRENCIES.includes(currency) ? CURRENCIES : [currency, ...CURRENCIES]).map(
              (code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              )
            )}
          </Select>
          <Input
            label="Month starts on"
            className="flex-1"
            inputMode="numeric"
            hint="Day 1–28, if your money arrives mid-month."
            value={startsOn}
            onChange={(event) => {
              setStartsOn(event.target.value)
              setError(null)
            }}
          />
        </div>
      </div>
    </Dialog>
  )
}
