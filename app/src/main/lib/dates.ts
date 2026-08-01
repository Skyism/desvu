import type { DateString, Weekday } from '@shared/types'

/**
 * Everything here works in **local** time. A `YYYY-MM-DD` in this app means the day the
 * user lived through, not a UTC instant — `new Date('2026-08-01')` parses as UTC midnight
 * and silently shifts a day backwards west of Greenwich, so it is never used.
 */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export const WEEKDAYS: readonly Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

export function isDateString(value: unknown): value is DateString {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  if (month < 1 || month > 12 || day < 1 || day > 31) return false
  const parsed = new Date(year, month - 1, day)
  return (
    parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day
  )
}

export function toDateString(date: Date): DateString {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function todayString(now: Date = new Date()): DateString {
  return toDateString(now)
}

/** Local midnight on the given day. */
export function parseDateString(value: DateString): Date {
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  return new Date(year, month - 1, day)
}

export function addDays(value: DateString, days: number): DateString {
  const date = parseDateString(value)
  date.setDate(date.getDate() + days)
  return toDateString(date)
}

/**
 * Add whole months, clamping the day to the length of the target month so that a
 * "the 31st of every month" rule lands on the 30th in April instead of leaking into May.
 */
export function addMonthsClamped(value: DateString, months: number, dayOfMonth: number): DateString {
  const base = parseDateString(value)
  const target = new Date(base.getFullYear(), base.getMonth() + months, 1)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate()
  target.setDate(Math.min(dayOfMonth, lastDay))
  return toDateString(target)
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. DST-safe. */
export function daysBetween(from: DateString, to: DateString): number {
  const a = parseDateString(from).getTime()
  const b = parseDateString(to).getTime()
  return Math.round((b - a) / 86_400_000)
}

export function weekdayOf(value: DateString): Weekday {
  const index = parseDateString(value).getDay()
  return WEEKDAYS[index] ?? 'sun'
}

/** `YYYY-MM` for the month a date falls in. */
export function monthKeyOf(value: DateString): string {
  return value.slice(0, 7)
}

export function isMonthKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}$/.test(value) && Number(value.slice(5, 7)) >= 1 &&
    Number(value.slice(5, 7)) <= 12
}

/** Local `HH:MM`, the format the Telegram bot stamps onto every Inbox line. */
export function timeHHMM(date: Date = new Date()): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/** Minutes since local midnight. */
export function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}

/** Monday-based week index, used to space out `weekly` recurrences with an interval > 1. */
export function weekIndex(value: DateString): number {
  // 1970-01-05 was a Monday, so whole weeks from there are Monday-aligned everywhere.
  return Math.floor(daysBetween('1970-01-05', value) / 7)
}
