import { useEffect, useState } from 'react'
import type { Meal, MealSlot } from '@shared/types'

import { Button } from '@/components/Button'
import { Checkbox } from '@/components/Checkbox'
import { Dialog } from '@/components/Dialog'
import { Input, Select, Textarea } from '@/components/Input'
import { readableMessage } from '@/lib/bridge'
import { editMeal, logMeal, removeMeal } from '@/store/health'
import {
  MEAL_SLOTS,
  MEAL_SLOT_LABEL,
  parseOptionalNumber,
  slotForHour,
  toDateString,
} from './nutrition'

export interface MealDialogProps {
  open: boolean
  onClose: () => void
  meal?: Meal | null
  onSaved?: (message: string) => void
}

/**
 * Log or edit a meal: free text, a slot, and — optionally — calories and protein.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * A SAVE IS NEVER BLOCKED ON A NUMBER.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * "chipotle bowl" with both number fields blank is a complete, useful entry and saves on
 * the first Enter. Requiring numbers is exactly how food logs die, so there is no
 * required-field marker on calories or protein, no validation that fires on blank, and no
 * warning about an incomplete entry. The only thing that can stop a save is text that is
 * not a number at all — and that message says what to type, not what is missing.
 *
 * `estimated` is a checkbox rather than something the form infers, because the flag means
 * a specific thing (the sort skill guessed) and the user may be transcribing a guess the
 * agent already made. It drives italic Cormorant in every list.
 */
export function MealDialog({
  open,
  onClose,
  meal = null,
  onSaved,
}: MealDialogProps): React.JSX.Element {
  const [description, setDescription] = useState('')
  const [slot, setSlot] = useState<MealSlot>('lunch')
  const [date, setDate] = useState(toDateString(new Date()))
  const [calories, setCalories] = useState('')
  const [protein, setProtein] = useState('')
  const [estimated, setEstimated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setDescription(meal?.description ?? '')
    setSlot(meal?.meal ?? slotForHour(new Date().getHours()))
    setDate(meal?.date ?? toDateString(new Date()))
    setCalories(meal?.calories != null ? String(meal.calories) : '')
    setProtein(meal?.protein_g != null ? String(meal.protein_g) : '')
    setEstimated(meal?.estimated ?? false)
    setError(null)
    setSaving(false)
  }, [open, meal])

  const save = async (): Promise<void> => {
    const parsedCalories = parseOptionalNumber(calories)
    const parsedProtein = parseOptionalNumber(protein)
    if (!parsedCalories.ok || !parsedProtein.ok) {
      setError('Calories and protein should be plain numbers — or left blank.')
      return
    }
    if (description.trim() === '') {
      setError('A few words about what it was is enough.')
      return
    }

    setSaving(true)
    try {
      const draft = {
        date,
        meal: slot,
        description,
        calories: parsedCalories.value,
        protein_g: parsedProtein.value,
        // A number the user typed is not an estimate unless they say so.
        estimated: estimated && (parsedCalories.value !== null || parsedProtein.value !== null),
      }
      if (meal) {
        await editMeal(meal.id, draft)
        onSaved?.('Meal updated.')
      } else {
        await logMeal(draft)
        onSaved?.('Meal logged.')
      }
      onClose()
    } catch (thrown) {
      setError(readableMessage(thrown))
      setSaving(false)
    }
  }

  const discard = async (): Promise<void> => {
    if (!meal) return
    setSaving(true)
    try {
      await removeMeal(meal.id)
      onSaved?.('Meal removed.')
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
      title={meal ? 'Edit meal' : 'Log a meal'}
      description={meal ? undefined : 'Numbers are optional. Leave them blank and it still counts.'}
      footer={
        <>
          {meal && (
            <Button variant="destructive" size="sm" onClick={() => void discard()} disabled={saving}>
              Delete
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={saving}>
            {meal ? 'Save' : 'Log it'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Textarea
          label="What was it"
          rows={2}
          autoFocus
          placeholder="chipotle bowl, chicken"
          value={description}
          error={error ?? undefined}
          onChange={(event) => {
            setDescription(event.target.value)
            setError(null)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              void save()
            }
          }}
        />

        <div className="flex gap-3">
          <Select
            label="Meal"
            className="flex-1"
            value={slot}
            onChange={(event) => setSlot(event.target.value as MealSlot)}
          >
            {MEAL_SLOTS.map((option) => (
              <option key={option} value={option}>
                {MEAL_SLOT_LABEL[option]}
              </option>
            ))}
          </Select>
          <Input
            label="Date"
            type="date"
            className="flex-1"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>

        <div className="flex gap-3">
          <Input
            label="Calories"
            className="flex-1"
            inputMode="numeric"
            placeholder="optional"
            value={calories}
            onChange={(event) => {
              setCalories(event.target.value)
              setError(null)
            }}
          />
          <Input
            label="Protein (g)"
            className="flex-1"
            inputMode="numeric"
            placeholder="optional"
            value={protein}
            onChange={(event) => {
              setProtein(event.target.value)
              setError(null)
            }}
          />
        </div>

        <Checkbox
          checked={estimated}
          onChange={(event) => setEstimated(event.target.checked)}
          label={
            <span className="text-muted text-xs">
              These numbers are an estimate — show them in{' '}
              <span className="text-estimate">italics</span>.
            </span>
          }
        />
      </div>
    </Dialog>
  )
}
