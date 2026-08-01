import type { DateString, Recurrence } from '@shared/types'
import { addDays, addMonthsClamped, daysBetween, parseDateString, weekdayOf, weekIndex } from './dates'

/**
 * Occurrence arithmetic for the three recurrence shapes in `data/SCHEMAS.md`.
 *
 * Every function here is a *query* over an infinite series anchored at a date — nothing
 * is enumerated and nothing is stored. That is what makes "recurrence never backlogs"
 * cheap to honour: there is no list of missed instances to accumulate in the first place,
 * only a question ("what is the current occurrence?") asked fresh each time.
 */

function monthsBetween(from: DateString, to: DateString): number {
  const a = parseDateString(from)
  const b = parseDateString(to)
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
}

/** The first monthly occurrence on or after the anchor. */
function firstMonthly(anchor: DateString, dayOfMonth: number, interval: number): DateString {
  const candidate = addMonthsClamped(anchor, 0, dayOfMonth)
  return candidate < anchor ? addMonthsClamped(candidate, interval, dayOfMonth) : candidate
}

function monthlyAt(first: DateString, index: number, rule: Recurrence & { type: 'monthly' }): DateString {
  return addMonthsClamped(first, index * rule.interval, rule.day_of_month)
}

function isWeeklyOccurrence(
  rule: Recurrence & { type: 'weekly' },
  anchor: DateString,
  date: DateString
): boolean {
  if (date < anchor) return false
  if (!rule.days.includes(weekdayOf(date))) return false
  const offset = weekIndex(date) - weekIndex(anchor)
  return offset >= 0 && offset % rule.interval === 0
}

/** How far a weekly search has to reach before it can conclude there is nothing. */
function weeklyWindow(rule: Recurrence & { type: 'weekly' }): number {
  return 7 * rule.interval + 7
}

/**
 * The next occurrence strictly after `after`. `null` only when the rule is malformed.
 *
 * Callers pass `after = max(instanceDue, today)` on completion, which is what stops a
 * task completed a week late from spawning its replacement into the past.
 */
export function nextOccurrenceAfter(
  rule: Recurrence,
  anchor: DateString,
  after: DateString
): DateString | null {
  if (rule.type === 'daily') {
    if (anchor > after) return anchor
    const gap = daysBetween(anchor, after)
    const steps = Math.floor(gap / rule.interval) + 1
    return addDays(anchor, steps * rule.interval)
  }

  if (rule.type === 'weekly') {
    const start = anchor > after ? anchor : addDays(after, 1)
    for (let offset = 0; offset <= weeklyWindow(rule); offset += 1) {
      const candidate = addDays(start, offset)
      if (candidate > after && isWeeklyOccurrence(rule, anchor, candidate)) return candidate
    }
    return null
  }

  const first = firstMonthly(anchor, rule.day_of_month, rule.interval)
  if (first > after) return first
  const approximate = Math.max(0, Math.floor(monthsBetween(first, after) / rule.interval) - 1)
  for (let index = approximate; index <= approximate + 4; index += 1) {
    const candidate = monthlyAt(first, index, rule)
    if (candidate > after) return candidate
  }
  return null
}

/**
 * The most recent occurrence on or before `limit`, or `null` when the series has not
 * started yet. This is "which instance is the live one today" — asked every time the day
 * view is opened, which is why a week away rolls a chore forward instead of stacking
 * seven copies of it.
 */
export function latestOccurrenceOnOrBefore(
  rule: Recurrence,
  anchor: DateString,
  limit: DateString
): DateString | null {
  if (anchor > limit) return null

  if (rule.type === 'daily') {
    const steps = Math.floor(daysBetween(anchor, limit) / rule.interval)
    return addDays(anchor, steps * rule.interval)
  }

  if (rule.type === 'weekly') {
    for (let offset = 0; offset <= weeklyWindow(rule); offset += 1) {
      const candidate = addDays(limit, -offset)
      if (candidate < anchor) return null
      if (isWeeklyOccurrence(rule, anchor, candidate)) return candidate
    }
    return null
  }

  const first = firstMonthly(anchor, rule.day_of_month, rule.interval)
  if (first > limit) return null
  const approximate = Math.max(0, Math.floor(monthsBetween(first, limit) / rule.interval) + 1)
  for (let index = approximate; index >= 0; index -= 1) {
    const candidate = monthlyAt(first, index, rule)
    if (candidate <= limit) return candidate
  }
  return null
}
