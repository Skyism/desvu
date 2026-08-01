import type { DateString, JournalEntry, Rating, UpsertJournalInput } from '@shared/types'

/**
 * The journal's pure logic. No React, no bridge, no DOM — so `test/journal-ui-*.test.ts`
 * can exercise all of it in vitest's node environment.
 *
 * Three properties of the real corpus (83 entries, measured — see PROGRESS.md) are load
 * bearing here, and every one of them has burned a naive implementation:
 *
 *   1. **Everything keys on `entry_date`, never `created_at`.** On 50 of 83 entries
 *      `created_at` post-dates `entry_date` by up to six days, because days get written
 *      up retroactively. A grid or a streak keyed on the timestamp misplaces ~60% of the
 *      corpus. There is no `created_at` read anywhere in this file, and there must not be.
 *   2. **Editing an existing day is a normal path.** 16 entries were revised after
 *      creation. `draftFromEntry` / `draftToInput` are built for reopening a day, not for
 *      a create-only form.
 *   3. **Three entries contain non-BMP emoji (💀, U+1F480).** `truncateByCodePoint` slices
 *      `[...text]`, never `text.slice()`, because a UTF-16 slice can cut a surrogate pair
 *      in half and emit a lone surrogate.
 *
 * And the rule that outranks all of them — **PRD J6**. Look at `GridDay`: a day is either
 * an entry or `null`. There is no `missed` field, no `gap`, no `daysSince`, no `broken`.
 * Nothing in this module computes a number that a UI could render as failure, because the
 * cheapest way to guarantee a screen never shames someone is to never hand it the number.
 */

// ---------------------------------------------------------------------------
// the scale
// ---------------------------------------------------------------------------

/**
 * 1–7, from the comp and PRD J0. Seven rather than five because 8 of the imported
 * entries rated above 5, and clamping would have flattened the top of every chart.
 */
export const RATINGS: readonly Rating[] = [1, 2, 3, 4, 5, 6, 7]

export function isRating(value: unknown): value is Rating {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 7
}

// ---------------------------------------------------------------------------
// the four prompts (PRD J3) — order is specified, do not reorder
// ---------------------------------------------------------------------------

export type ProseField = 'gratitude_text' | 'learned' | 'mood_word' | 'mood_context'

export interface Prompt {
  field: ProseField
  /** The question, shown in Cormorant above the field. It is an invitation, not a label. */
  question: string
  placeholder: string
  /** A mood word is one word; the rest are paragraphs. */
  kind: 'line' | 'paragraph'
}

export const PROMPTS: readonly Prompt[] = [
  {
    field: 'gratitude_text',
    question: "Something you're grateful for",
    placeholder: 'Anything at all. It does not have to be big.',
    kind: 'paragraph',
  },
  {
    field: 'learned',
    question: 'What did I learn about myself or the world today',
    placeholder: 'Or nothing, some days.',
    kind: 'paragraph',
  },
  {
    field: 'mood_word',
    question: 'One word for your mood',
    placeholder: 'restless, steady, tired…',
    kind: 'line',
  },
  {
    field: 'mood_context',
    question: 'Something that happened that made you feel that way',
    placeholder: 'The moment, not the analysis.',
    kind: 'paragraph',
  },
]

export const PROSE_FIELDS: readonly ProseField[] = PROMPTS.map((prompt) => prompt.field)

// ---------------------------------------------------------------------------
// local-date arithmetic
// ---------------------------------------------------------------------------

/**
 * `YYYY-MM-DD` in local time. Never `toISOString()` — that is UTC, and west of Greenwich
 * it files an 8pm entry under tomorrow.
 */
export function toDateString(date: Date = new Date()): DateString {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Parse `YYYY-MM-DD` at local midnight. `new Date('2026-08-01')` would be UTC midnight. */
export function parseDateString(date: DateString): Date {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function shiftDate(date: DateString, days: number): DateString {
  const parsed = parseDateString(date)
  parsed.setDate(parsed.getDate() + days)
  return toDateString(parsed)
}

const WEEKDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'long' })
const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long' })
const DAY_MONTH_YEAR = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/** `Wednesday 15 July` — the grid tooltip and the history row. */
export function formatDayShort(date: DateString): string {
  const parsed = parseDateString(date)
  return `${WEEKDAY.format(parsed)} ${DAY_MONTH.format(parsed)}`
}

/** `Wednesday · 15 July 2026` — a card title for a day that is not today. */
export function formatDayFull(date: DateString): string {
  const parsed = parseDateString(date)
  return `${WEEKDAY.format(parsed)} · ${DAY_MONTH_YEAR.format(parsed)}`
}

// ---------------------------------------------------------------------------
// truncation — the non-BMP trap
// ---------------------------------------------------------------------------

/**
 * Truncate to `max` **code points**.
 *
 * `'💀'.length === 2`: it is one code point stored as a surrogate pair. `text.slice(0, n)`
 * indexes UTF-16 units, so it can land between the two halves and produce a lone
 * surrogate — which renders as a replacement glyph and corrupts anything that copies it.
 * Three entries in the real corpus end in 💀, so this is not hypothetical.
 */
export function truncateByCodePoint(text: string, max: number): string {
  if (max <= 0) return ''
  const points = [...text]
  if (points.length <= max) return text
  return `${points.slice(0, max).join('').trimEnd()}…`
}

/**
 * The first thing the user actually wrote, for a history row. Falls back through the
 * prompts in the order they are asked. A rating-only day previews as an empty string, and
 * the caller renders that as nothing at all rather than as a placeholder apology.
 */
export function entryPreview(entry: JournalEntry, max = 140): string {
  for (const field of ['gratitude_text', 'learned', 'mood_context', 'mood_word'] as const) {
    const value = entry[field]?.trim()
    if (value) return truncateByCodePoint(collapseWhitespace(value), max)
  }
  return ''
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

export function hasProse(entry: JournalEntry): boolean {
  return PROSE_FIELDS.some((field) => (entry[field] ?? '').trim() !== '')
}

// ---------------------------------------------------------------------------
// the 30-day grid (PRD J6)
// ---------------------------------------------------------------------------

/**
 * One cell of the grid.
 *
 * Note what is **not** here. There is no `missed`, no `broken`, no `gap`, no `isPast`
 * paired with an absence. A day either has an entry or it does not, and "does not" is the
 * same shape as "not yet" — which is the whole of J6 expressed as a type. A future
 * component cannot render a wall of red because there is nothing here to colour red.
 */
export interface GridDay {
  date: DateString
  entry: JournalEntry | null
  isToday: boolean
}

export function indexByDate(entries: readonly JournalEntry[]): Map<DateString, JournalEntry> {
  const index = new Map<DateString, JournalEntry>()
  for (const entry of entries) {
    // Keyed on entry_date. `created_at` is the day it was typed, not the day it is about.
    const existing = index.get(entry.entry_date)
    // One entry per day is the repository's invariant; if a hand-edited file breaks it,
    // prefer the most recently updated rather than throwing at the render tree.
    if (!existing || entry.updated_at >= existing.updated_at) index.set(entry.entry_date, entry)
  }
  return index
}

/** The last `days` days ending today, oldest first — reading order, as in the comp. */
export function buildMonthGrid(
  entries: readonly JournalEntry[],
  today: DateString = toDateString(),
  days = 30
): GridDay[] {
  const index = indexByDate(entries)
  const grid: GridDay[] = []
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = shiftDate(today, -offset)
    grid.push({ date, entry: index.get(date) ?? null, isToday: offset === 0 })
  }
  return grid
}

/**
 * The accessible name of a grid cell. Every branch is neutral: a day with nothing in it
 * is "empty", which is a description, not a verdict. Never "missed", never "skipped",
 * never "you didn't".
 */
export function gridCellLabel(day: GridDay): string {
  const when = day.isToday ? `Today, ${formatDayShort(day.date)}` : formatDayShort(day.date)
  return day.entry ? `${when} — rated ${day.entry.rating} of 7` : `${when} — empty`
}

// ---------------------------------------------------------------------------
// history search
// ---------------------------------------------------------------------------

/**
 * Every term must appear somewhere in the entry — the same all-terms rule the vault-wide
 * search uses, so the two never disagree about whether a word is a hit. Dates are
 * searchable in the form the user reads them, so "july" and "monday" both work.
 */
export function entryHaystack(entry: JournalEntry): string {
  const parts: string[] = [entry.entry_date, formatDayFull(entry.entry_date)]
  for (const field of PROSE_FIELDS) {
    const value = entry[field]
    if (value) parts.push(value)
  }
  return parts.join(' ').toLowerCase()
}

export function filterEntries(
  entries: readonly JournalEntry[],
  query: string
): readonly JournalEntry[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return entries
  return entries.filter((entry) => {
    const haystack = entryHaystack(entry)
    return terms.every((term) => haystack.includes(term))
  })
}

/** Newest first, keyed on `entry_date` — the order the repository already returns. */
export function sortByDateDescending(entries: readonly JournalEntry[]): JournalEntry[] {
  return [...entries].sort((a, b) => b.entry_date.localeCompare(a.entry_date))
}

// ---------------------------------------------------------------------------
// the draft
// ---------------------------------------------------------------------------

export interface Draft {
  date: DateString
  /** Null before the first tap. A draft with no rating is not yet an entry. */
  rating: Rating | null
  gratitude_text: string
  learned: string
  mood_word: string
  mood_context: string
}

export function emptyDraft(date: DateString): Draft {
  return { date, rating: null, gratitude_text: '', learned: '', mood_word: '', mood_context: '' }
}

/** Reopening a day is the normal path (16 of 83 entries were revised). */
export function draftFromEntry(date: DateString, entry: JournalEntry | null): Draft {
  if (!entry) return emptyDraft(date)
  return {
    date,
    rating: entry.rating,
    gratitude_text: entry.gratitude_text ?? '',
    learned: entry.learned ?? '',
    mood_word: entry.mood_word ?? '',
    mood_context: entry.mood_context ?? '',
  }
}

export function draftHasProse(draft: Draft): boolean {
  return PROSE_FIELDS.some((field) => draft[field].trim() !== '')
}

/** Has the user typed something that is not on disk yet? Drives the save affordance. */
export function draftProseChanged(draft: Draft, entry: JournalEntry | null): boolean {
  return PROSE_FIELDS.some((field) => draft[field].trim() !== (entry?.[field] ?? '').trim())
}

/**
 * A field is only sent when it says something, or when it used to say something and now
 * does not (an explicit clear). PRD J0: a bare rating must not silently acquire four
 * empty strings on its way through the form.
 */
function proseValue(next: string, previous: string | undefined): string | undefined {
  const trimmed = next.trim()
  if (trimmed !== '') return trimmed
  if (previous !== undefined && previous.trim() !== '') return ''
  return undefined
}

/**
 * `null` when there is no rating yet — the rating is the one required field, so there is
 * nothing to write without it. Everything else is optional by construction.
 */
export function draftToInput(draft: Draft, entry: JournalEntry | null): UpsertJournalInput | null {
  if (draft.rating === null) return null
  const input: UpsertJournalInput = { entry_date: draft.date, rating: draft.rating }
  for (const field of PROSE_FIELDS) {
    const value = proseValue(draft[field], entry?.[field])
    if (value !== undefined) input[field] = value
  }
  return input
}

// ---------------------------------------------------------------------------
// copy
// ---------------------------------------------------------------------------

export const DISCLOSURE_OPEN = 'Say a little more ↓'
export const DISCLOSURE_CLOSED = 'Just the number is fine ↑'
export const GRID_CAPTION = 'Empty is just empty.'

/** "Tonight" for today, the day itself otherwise — so an edit is obviously an edit. */
export function reflectionTitle(date: DateString, today: DateString): string {
  return date === today ? 'Tonight' : formatDayFull(date)
}

/**
 * Past tense for a day that is over. Both readings say the same thing: the number on its
 * own is the whole entry.
 */
export function reflectionInvitation(date: DateString, today: DateString): string {
  return date === today
    ? 'How was today? A number is a whole entry.'
    : 'How was that day? A number is a whole entry.'
}

/**
 * A positive count only. The denominator — 211 days spanned, 39.3% adherence — is real and
 * is deliberately never rendered. "83 days written" is a thing you did. "83 of 211" is a
 * report card, and this product does not issue one.
 */
export function daysWrittenLabel(total: number): string {
  if (total <= 0) return ''
  return `${total} day${total === 1 ? '' : 's'} written`
}
