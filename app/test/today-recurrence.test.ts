import { describe, expect, it } from 'vitest'
import type { Recurrence } from '@shared/types'

import {
  DEFAULT_RECURRENCE_FORM,
  describeRecurrence,
  detachCopy,
  formFromRecurrence,
  recurrenceFromForm,
} from '@/components/todos/recurrence'

describe('describeRecurrence', () => {
  it('describes daily rules', () => {
    expect(describeRecurrence({ type: 'daily', interval: 1 })).toBe('Every day')
    expect(describeRecurrence({ type: 'daily', interval: 3 })).toBe('Every 3 days')
  })

  it('names weekly days in week order, not the order they were clicked', () => {
    expect(
      describeRecurrence({ type: 'weekly', interval: 1, days: ['fri', 'mon', 'wed'] })
    ).toBe('Mon, Wed, Fri')
  })

  it('calls a seven-day weekly rule what it actually is', () => {
    expect(
      describeRecurrence({
        type: 'weekly',
        interval: 1,
        days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      })
    ).toBe('Every day')
  })

  it('spells out a multi-week interval', () => {
    expect(describeRecurrence({ type: 'weekly', interval: 2, days: ['tue'] })).toBe(
      'Every 2 weeks on Tue'
    )
  })

  it('uses ordinals for monthly rules', () => {
    expect(describeRecurrence({ type: 'monthly', interval: 1, day_of_month: 1 })).toBe(
      'Monthly on the 1st'
    )
    expect(describeRecurrence({ type: 'monthly', interval: 1, day_of_month: 2 })).toBe(
      'Monthly on the 2nd'
    )
    expect(describeRecurrence({ type: 'monthly', interval: 1, day_of_month: 3 })).toBe(
      'Monthly on the 3rd'
    )
    expect(describeRecurrence({ type: 'monthly', interval: 1, day_of_month: 11 })).toBe(
      'Monthly on the 11th'
    )
    expect(describeRecurrence({ type: 'monthly', interval: 1, day_of_month: 21 })).toBe(
      'Monthly on the 21st'
    )
    expect(describeRecurrence({ type: 'monthly', interval: 3, day_of_month: 15 })).toBe(
      'Every 3 months on the 15th'
    )
  })

  it('renders nothing for a todo that does not repeat', () => {
    expect(describeRecurrence(null)).toBe('')
  })
})

describe('recurrenceFromForm', () => {
  it('builds a daily rule', () => {
    expect(recurrenceFromForm({ ...DEFAULT_RECURRENCE_FORM, type: 'daily', interval: 2 })).toEqual({
      rule: { type: 'daily', interval: 2 },
    })
  })

  it('normalizes the weekday order so the stored rule is canonical', () => {
    const built = recurrenceFromForm({
      ...DEFAULT_RECURRENCE_FORM,
      type: 'weekly',
      days: ['sun', 'mon'],
    })
    expect(built).toEqual({ rule: { type: 'weekly', interval: 1, days: ['mon', 'sun'] } })
  })

  it('refuses a weekly rule with no days, before the round trip rather than after it', () => {
    expect(
      recurrenceFromForm({ ...DEFAULT_RECURRENCE_FORM, type: 'weekly', days: [] })
    ).toEqual({ error: 'Pick at least one day.' })
  })

  it('refuses a day of the month outside 1–31', () => {
    expect(
      recurrenceFromForm({ ...DEFAULT_RECURRENCE_FORM, type: 'monthly', dayOfMonth: 0 })
    ).toEqual({ error: 'Pick a day between 1 and 31.' })
    expect(
      recurrenceFromForm({ ...DEFAULT_RECURRENCE_FORM, type: 'monthly', dayOfMonth: 32 })
    ).toEqual({ error: 'Pick a day between 1 and 31.' })
  })

  it('floors a zero or negative interval to 1 rather than storing a rule that cannot fire', () => {
    expect(recurrenceFromForm({ ...DEFAULT_RECURRENCE_FORM, interval: 0 })).toEqual({
      rule: { type: 'daily', interval: 1 },
    })
    expect(recurrenceFromForm({ ...DEFAULT_RECURRENCE_FORM, interval: -4 })).toEqual({
      rule: { type: 'daily', interval: 1 },
    })
  })
})

describe('detachCopy', () => {
  it('says the tasks survive, because a user expecting a cascade will be surprised', () => {
    expect(detachCopy(3)).toContain('The 3 tasks it already made stay exactly where they are')
    expect(detachCopy(3)).toContain('estimates are calibrated from')
  })

  it('reads as English for one instance', () => {
    expect(detachCopy(1)).toContain('The one task it already made stays on your list')
    expect(detachCopy(1)).not.toMatch(/tasks|they are/)
  })

  it('does not promise survivors when there are none', () => {
    expect(detachCopy(0)).toBe('Deleting the rule stops new copies. Nothing else is removed.')
    expect(detachCopy(-1)).toBe(detachCopy(0))
  })

  it('never claims anything is deleted beyond the rule', () => {
    for (const count of [0, 1, 2, 9]) {
      expect(detachCopy(count)).toMatch(/^Deleting the rule stops new copies\./)
    }
  })
})

describe('formFromRecurrence', () => {
  const rules: Recurrence[] = [
    { type: 'daily', interval: 2 },
    { type: 'weekly', interval: 3, days: ['mon', 'thu'] },
    { type: 'monthly', interval: 1, day_of_month: 15 },
  ]

  it('round trips every rule shape, so editing a template opens on what it is', () => {
    for (const rule of rules) {
      expect(recurrenceFromForm(formFromRecurrence(rule))).toEqual({ rule })
    }
  })

  it('opens a new template on the default form', () => {
    expect(formFromRecurrence(null)).toEqual(DEFAULT_RECURRENCE_FORM)
  })

  it('hands back a copy, so editing the form cannot mutate the default', () => {
    const form = formFromRecurrence(null)
    form.days.push('sun')
    expect(DEFAULT_RECURRENCE_FORM.days).toEqual(['mon', 'wed', 'fri'])
  })
})
