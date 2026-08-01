import { useEffect, useState } from 'react'
import type { Category, Priority, Todo, Weekday } from '@shared/types'

import { Button } from '@/components/Button'
import { Dialog } from '@/components/Dialog'
import { Input, Select } from '@/components/Input'
import { readableMessage } from '@/lib/bridge'
import { CATEGORY_LABEL, CATEGORY_ORDER } from '@/lib/category'
import { cn } from '@/lib/cn'
import { createTodo, removeTodo, updateTodo } from '@/store/todos'
import { PRIORITY_LABEL } from './grouping'
import {
  DEFAULT_RECURRENCE_FORM,
  WEEKDAYS,
  WEEKDAY_LABEL,
  describeRecurrence,
  formFromRecurrence,
  recurrenceFromForm,
  type RecurrenceForm,
} from './recurrence'

export interface RecurrenceDialogProps {
  open: boolean
  /** Null creates a new template; a template edits it. */
  template: Todo | null
  /** How many tasks this template has already produced, for the delete copy. */
  instanceCount: number
  defaultPriority: Priority
  defaultEstimate: number
  onClose: () => void
}

const PRIORITIES: Priority[] = [0, 1, 2, 3]

/**
 * PRD T10 — create, edit and delete a recurring task.
 *
 * A recurring task is a **template**: a rule, not a task. It never appears in any list,
 * and the one live copy it keeps on the list is an instance. Completing that instance
 * spawns exactly one replacement; missing it rolls the same copy forward rather than
 * stacking a week of guilt.
 *
 * The delete copy is the part worth reading twice. Deleting a template **detaches** its
 * instances instead of cascading — the repository clears `recurrence_parent` and every
 * task it ever created survives as an ordinary one-off. That is deliberate (a live
 * instance may be half-finished work, and the completed ones are the history feeding the
 * T11 calibration), but it is the opposite of what "delete" usually means, so the dialog
 * says it in plain words before the click rather than leaving it to be discovered.
 */
export function RecurrenceDialog({
  open,
  template,
  instanceCount,
  defaultPriority,
  defaultEstimate,
  onClose,
}: RecurrenceDialogProps): React.JSX.Element {
  const [text, setText] = useState('')
  const [category, setCategory] = useState<Category>('personal')
  const [priority, setPriority] = useState<Priority>(defaultPriority)
  const [estimate, setEstimate] = useState(String(defaultEstimate))
  const [form, setForm] = useState<RecurrenceForm>({ ...DEFAULT_RECURRENCE_FORM })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  useEffect(() => {
    if (!open) return
    setText(template?.text ?? '')
    setCategory(template?.category ?? 'personal')
    setPriority(template?.priority ?? defaultPriority)
    setEstimate(String(template?.estimate_minutes ?? defaultEstimate))
    setForm(formFromRecurrence(template?.recurrence ?? null))
    setError(null)
    setConfirmingDelete(false)
  }, [open, template, defaultPriority, defaultEstimate])

  const patch = (updates: Partial<RecurrenceForm>): void =>
    setForm((current) => ({ ...current, ...updates }))

  const toggleDay = (day: Weekday): void =>
    setForm((current) => ({
      ...current,
      days: current.days.includes(day)
        ? current.days.filter((existing) => existing !== day)
        : [...current.days, day],
    }))

  const save = async (): Promise<void> => {
    const trimmed = text.trim()
    if (!trimmed) {
      setError('Give it a name.')
      return
    }
    const built = recurrenceFromForm(form)
    if ('error' in built) {
      setError(built.error)
      return
    }
    const minutes = Number.parseInt(estimate, 10)
    const estimateMinutes = Number.isFinite(minutes) && minutes >= 0 ? minutes : defaultEstimate

    setBusy(true)
    setError(null)
    try {
      if (template) {
        await updateTodo(template.id, {
          text: trimmed,
          category,
          priority,
          estimate_minutes: estimateMinutes,
          recurrence: built.rule,
        })
      } else {
        await createTodo({
          text: trimmed,
          category,
          priority,
          estimate_minutes: estimateMinutes,
          recurrence: built.rule,
        })
      }
      onClose()
    } catch (thrown) {
      setError(readableMessage(thrown))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (): Promise<void> => {
    if (!template) return
    setBusy(true)
    setError(null)
    try {
      await removeTodo(template.id)
      onClose()
    } catch (thrown) {
      setError(readableMessage(thrown))
    } finally {
      setBusy(false)
    }
  }

  const preview = (() => {
    const built = recurrenceFromForm(form)
    return 'rule' in built ? describeRecurrence(built.rule) : null
  })()

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={template ? 'Repeating task' : 'New repeating task'}
      description="A rule, not a task. One copy at a time lands on the list; finishing it schedules the next."
      size="md"
      footer={
        <>
          {template && (
            <Button
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => (confirmingDelete ? void remove() : setConfirmingDelete(true))}
            >
              {confirmingDelete ? 'Delete the rule' : 'Delete'}
            </Button>
          )}
          <span className="flex-1" />
          <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" loading={busy} onClick={() => void save()}>
            {template ? 'Save' : 'Create'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input
          label="Task"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Read 15-451 lecture notes"
        />

        <div className="flex flex-wrap gap-3">
          <Select
            label="Category"
            value={category}
            onChange={(event) => setCategory(event.target.value as Category)}
            className="min-w-[140px] flex-1"
          >
            {CATEGORY_ORDER.map((option) => (
              <option key={option} value={option}>
                {CATEGORY_LABEL[option]}
              </option>
            ))}
          </Select>

          <Select
            label="Priority"
            value={priority}
            onChange={(event) => setPriority(Number(event.target.value) as Priority)}
            className="min-w-[160px] flex-1"
          >
            {PRIORITIES.map((option) => (
              <option key={option} value={option}>
                {PRIORITY_LABEL[option]}
              </option>
            ))}
          </Select>

          <Input
            label="Estimate"
            type="number"
            min={0}
            step={5}
            value={estimate}
            onChange={(event) => setEstimate(event.target.value)}
            className="w-[104px]"
            hint="minutes"
          />
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <Select
            label="Repeats"
            value={form.type}
            onChange={(event) => patch({ type: event.target.value as RecurrenceForm['type'] })}
            className="min-w-[150px] flex-1"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly, on days</option>
            <option value="monthly">Monthly, on a date</option>
          </Select>

          <Input
            label="Every"
            type="number"
            min={1}
            step={1}
            value={form.interval}
            onChange={(event) => patch({ interval: Number(event.target.value) })}
            className="w-[104px]"
            hint={form.type === 'daily' ? 'days' : form.type === 'weekly' ? 'weeks' : 'months'}
          />

          {form.type === 'monthly' && (
            <Input
              label="Day"
              type="number"
              min={1}
              max={31}
              value={form.dayOfMonth}
              onChange={(event) => patch({ dayOfMonth: Number(event.target.value) })}
              className="w-[104px]"
              hint="of the month"
            />
          )}
        </div>

        {form.type === 'weekly' && (
          <div className="flex flex-col gap-2">
            <span className="text-label tracking-label text-muted uppercase">On</span>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((day) => {
                const on = form.days.includes(day)
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleDay(day)}
                    className={cn(
                      'rounded-pill transition-quiet h-8 border px-3 text-xs',
                      on
                        ? 'bg-accent text-on-accent border-accent'
                        : 'bg-card text-ink2 border-line hover:bg-hover'
                    )}
                  >
                    {WEEKDAY_LABEL[day]}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {error !== null && <p className="text-accent-text text-xs">{error}</p>}

        {preview !== null && error === null && (
          <p className="text-estimate text-base">{preview}</p>
        )}

        {confirmingDelete && (
          <p className="text-muted text-sm">
            {instanceCount > 0
              ? `Deleting the rule stops new copies. The ${instanceCount} task${
                  instanceCount === 1 ? '' : 's'
                } it already made stay exactly where they are — including anything
                 half-finished, and the finished ones your estimates are calibrated from.`
              : 'Deleting the rule stops new copies. Nothing else is removed.'}
          </p>
        )}
      </div>
    </Dialog>
  )
}
