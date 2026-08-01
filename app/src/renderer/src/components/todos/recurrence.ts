import type { Recurrence, Weekday } from '@shared/types'

/**
 * Turning a recurrence rule into English, and a form back into a rule. Pure, so
 * `test/today-recurrence.test.ts` covers the wording and the round trip.
 */

export const WEEKDAYS: readonly Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const

export const WEEKDAY_LABEL: Record<Weekday, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
  sun: 'Sun',
}

function ordinal(day: number): string {
  const remainder10 = day % 10
  const remainder100 = day % 100
  if (remainder10 === 1 && remainder100 !== 11) return `${day}st`
  if (remainder10 === 2 && remainder100 !== 12) return `${day}nd`
  if (remainder10 === 3 && remainder100 !== 13) return `${day}rd`
  return `${day}th`
}

/**
 * `Every day` · `Mon, Wed, Fri` · `Every 2 weeks on Tue` · `Monthly on the 15th`.
 *
 * Sentence case, no "repeats" prefix — the card is already called Repeating, and saying
 * it twice on every row is noise.
 */
export function describeRecurrence(rule: Recurrence | null): string {
  if (rule === null) return ''

  if (rule.type === 'daily') {
    return rule.interval === 1 ? 'Every day' : `Every ${rule.interval} days`
  }

  if (rule.type === 'weekly') {
    const days = WEEKDAYS.filter((day) => rule.days.includes(day)).map((day) => WEEKDAY_LABEL[day])
    const named = days.length > 0 ? days.join(', ') : 'no days chosen'
    if (rule.interval === 1) return days.length === 7 ? 'Every day' : named
    return `Every ${rule.interval} weeks on ${named}`
  }

  const day = `the ${ordinal(rule.day_of_month)}`
  return rule.interval === 1 ? `Monthly on ${day}` : `Every ${rule.interval} months on ${day}`
}

/**
 * What "delete" actually does to a recurring task, said before the click.
 *
 * The repository **detaches** rather than cascading: every task the rule already produced
 * survives as an ordinary one-off, keeping half-finished work and the completed history
 * the T11 calibration is derived from. That is the right behaviour and the wrong default
 * expectation, so the number is named out loud — "the 3 tasks it already made" is the
 * part a user is about to be surprised by.
 */
export function detachCopy(instanceCount: number): string {
  if (instanceCount <= 0) {
    return 'Deleting the rule stops new copies. Nothing else is removed.'
  }
  if (instanceCount === 1) {
    return (
      'Deleting the rule stops new copies. The one task it already made stays on your ' +
      'list as an ordinary task — including if you are part-way through it.'
    )
  }
  return (
    `Deleting the rule stops new copies. The ${instanceCount} tasks it already made stay ` +
    'exactly where they are — anything half-finished, and the finished ones your ' +
    'estimates are calibrated from.'
  )
}

export interface RecurrenceForm {
  type: Recurrence['type']
  interval: number
  days: Weekday[]
  dayOfMonth: number
}

/**
 * Frozen, because it is a module-level object with an array in it and a shallow spread
 * would hand every dialog the *same* `days` array to push into. Build form state with
 * `defaultRecurrenceForm()` or `formFromRecurrence()`, never by spreading this.
 */
export const DEFAULT_RECURRENCE_FORM: Readonly<RecurrenceForm> = Object.freeze({
  type: 'daily',
  interval: 1,
  days: Object.freeze(['mon', 'wed', 'fri']) as Weekday[],
  dayOfMonth: 1,
})

/** A fresh, independently mutable copy of the default. */
export function defaultRecurrenceForm(): RecurrenceForm {
  return { type: 'daily', interval: 1, days: ['mon', 'wed', 'fri'], dayOfMonth: 1 }
}

/** A rule read back into form state, so editing a template opens on what it actually is. */
export function formFromRecurrence(rule: Recurrence | null): RecurrenceForm {
  const form = defaultRecurrenceForm()
  if (rule === null) return form
  if (rule.type === 'daily') return { ...form, type: 'daily', interval: rule.interval }
  if (rule.type === 'weekly') {
    return { ...form, type: 'weekly', interval: rule.interval, days: [...rule.days] }
  }
  return { ...form, type: 'monthly', interval: rule.interval, dayOfMonth: rule.day_of_month }
}

/**
 * Form state back into a rule, or a message saying what is missing. The repository would
 * reject a weekly rule with no days; catching it here means the user reads "Pick at least
 * one day" under the control rather than a validation error after a round trip.
 */
export function recurrenceFromForm(form: RecurrenceForm): { rule: Recurrence } | { error: string } {
  const interval = Math.max(1, Math.round(form.interval || 1))

  if (form.type === 'daily') return { rule: { type: 'daily', interval } }

  if (form.type === 'weekly') {
    const days = WEEKDAYS.filter((day) => form.days.includes(day))
    if (days.length === 0) return { error: 'Pick at least one day.' }
    return { rule: { type: 'weekly', interval, days } }
  }

  const dayOfMonth = Math.round(form.dayOfMonth)
  if (!Number.isFinite(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
    return { error: 'Pick a day between 1 and 31.' }
  }
  return { rule: { type: 'monthly', interval, day_of_month: dayOfMonth } }
}
