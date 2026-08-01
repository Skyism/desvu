import type { DateString } from '@shared/types'

/** Parse `YYYY-MM-DD` as a LOCAL date. `new Date('2026-08-01')` is UTC and drifts a day. */
export function parseDateString(value: DateString): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return null
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  )
  return Number.isNaN(date.getTime()) ? null : date
}

const SHORT_DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })
const SHORT_DATE_YEAR = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/**
 * `today` · `yesterday` · `4 days ago` · `12 Jul` · `12 Jul 2025`.
 *
 * Deliberately has no "N days since" register beyond a week — the app never counts a gap
 * back at the user (PRD J6). After seven days it simply states the date.
 */
export function relativeDay(value: DateString, now: Date = new Date()): string {
  const date = parseDateString(value)
  if (!date) return value

  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days > 1 && days < 7) return `${days} days ago`
  if (days === -1) return 'tomorrow'

  return date.getFullYear() === now.getFullYear()
    ? SHORT_DATE.format(date)
    : SHORT_DATE_YEAR.format(date)
}

/** The first sentence or so of a note body, for a list preview. */
export function previewOf(body: string, limit = 96): string {
  const flat = body
    .replace(/^---\n[\s\S]*?\n---\n/, '')
    .replace(/^#{1,6}\s+.*$/gm, '')
    .replace(/!?\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g, (_, target: string, alias: string) => alias || target)
    // `_` is deliberately not stripped: it lives inside identifiers far more often than
    // it marks emphasis, and `mm_malloc` → `mmmalloc` in a preview is worse than a stray
    // underscore in the rare `_italic_`.
    .replace(/[*`>#~=]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  // Slice by code point — three journal entries carry non-BMP emoji and a UTF-16 slice
  // would emit a lone surrogate.
  const points = [...flat]
  if (points.length <= limit) return flat
  return `${points.slice(0, limit).join('').trimEnd()}…`
}

/** `2026-W31` → `Week 31 · 2026`. Synthesis notes are named by ISO week, not by a day. */
export function formatWeekLabel(week: string): string {
  const match = /^(\d{4})-W(\d{1,2})$/i.exec(week.trim())
  if (!match) return week
  return `Week ${Number(match[2])} · ${match[1]}`
}

/** The Monday–Sunday span an ISO week covers, for the reading surface's eyebrow. */
export function isoWeekRange(week: string): string | null {
  const match = /^(\d{4})-W(\d{1,2})$/i.exec(week.trim())
  if (!match) return null
  const year = Number(match[1])
  const number = Number(match[2])
  if (!Number.isFinite(year) || number < 1 || number > 53) return null

  // ISO 8601: week 1 is the week containing 4 January.
  const fourth = new Date(year, 0, 4)
  const isoDay = (fourth.getDay() + 6) % 7
  const week1Monday = new Date(year, 0, 4 - isoDay)
  const monday = new Date(
    week1Monday.getFullYear(),
    week1Monday.getMonth(),
    week1Monday.getDate() + (number - 1) * 7
  )
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6)

  const sameMonth = monday.getMonth() === sunday.getMonth()
  const left = sameMonth
    ? String(monday.getDate())
    : SHORT_DATE.format(monday)
  return `${left} – ${SHORT_DATE_YEAR.format(sunday)}`
}

/** The ISO week string for a date, e.g. `2026-W31`. */
export function isoWeekOf(date: Date = new Date()): string {
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const isoDay = (target.getDay() + 6) % 7
  target.setDate(target.getDate() - isoDay + 3) // the Thursday of this week
  const firstThursday = new Date(target.getFullYear(), 0, 4)
  const firstIsoDay = (firstThursday.getDay() + 6) % 7
  firstThursday.setDate(firstThursday.getDate() - firstIsoDay + 3)
  const weeks = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86_400_000))
  return `${target.getFullYear()}-W${String(weeks).padStart(2, '0')}`
}
