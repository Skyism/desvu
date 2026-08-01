import type { DateString } from '@shared/types'

/** `YYYY-MM-DD` in the user's local timezone. Never derive this from `toISOString()`. */
export function toDateString(date: Date = new Date()): DateString {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const WEEKDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'long' })
const LONG_DATE = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/** The page eyebrow: `Saturday · 1 August 2026`. */
export function formatDayLine(date: Date = new Date()): string {
  return `${WEEKDAY.format(date)} · ${LONG_DATE.format(date)}`
}

/** `10:00`, `4:30pm`. Used by the Today rail. */
export function formatClock(date: Date): string {
  const hours = date.getHours()
  const minutes = date.getMinutes()
  const suffix = hours >= 12 ? 'pm' : 'am'
  const hour12 = hours % 12 === 0 ? 12 : hours % 12
  return minutes === 0
    ? `${hour12}${suffix}`
    : `${hour12}:${String(minutes).padStart(2, '0')}${suffix}`
}

/** `1h 25m`, `40m`, `2h`. Durations are always minutes in this app. */
export function formatMinutes(total: number): string {
  const minutes = Math.max(0, Math.round(total))
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (hours && rest) return `${hours}h ${rest}m`
  if (hours) return `${hours}h`
  return `${rest}m`
}
