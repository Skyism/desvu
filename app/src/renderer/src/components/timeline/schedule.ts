import type { CalendarEvent, DateString, Todo } from '@shared/types'

/**
 * The arithmetic behind the day rail. Pure — no React, no `bridge()`, no `Date.now()`
 * that is not passed in — so `test/today-schedule.test.ts` can exercise every branch.
 *
 * WHY A RAIL AT ALL. An earlier hero showed the answer as a sentence: "5h20m due ·
 * 3h10m free · over by 2h10m". It was rejected. The number tells you that you are over;
 * it does not tell you *which* task is the one that will not happen, and that is the
 * decision the morning is actually about. Drawing the day means the gaps are visible and
 * the tasks that could not be put anywhere fall out of the picture on their own.
 *
 * The rail is 8am → 11pm, which is the comp. The repository's free-time window runs
 * 8am → midnight, so the two disagree by up to an hour; see `packTodos` for how that is
 * kept from producing a contradiction on screen.
 */

/** Left edge of the rail: 08:00 local, in minutes since midnight. */
export const RAIL_START_MINUTE = 8 * 60
/** Right edge: 23:00 local. Taken from the comp (`DAY = { start: 8*60, end: 23*60 }`). */
export const RAIL_END_MINUTE = 23 * 60
export const RAIL_LENGTH_MINUTES = RAIL_END_MINUTE - RAIL_START_MINUTE

/** 8am · 11am · 2pm · 5pm · 8pm. 11pm is drawn right-aligned against the end. */
export const RAIL_TICKS: readonly number[] = [480, 660, 840, 1020, 1200] as const

export interface RailEvent {
  id: string
  title: string
  /** Minutes since local midnight, clamped into the day. */
  start: number
  end: number
}

export interface Gap {
  start: number
  end: number
}

export interface PlacedTodo {
  todo: Todo
  start: number
  end: number
  minutes: number
}

export interface Packing {
  placed: PlacedTodo[]
  /** Todos that had no gap wide enough on the visible rail. */
  unplaced: Todo[]
}

// ---------------------------------------------------------------------------
// conversions
// ---------------------------------------------------------------------------

export function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}

/** `YYYY-MM-DD` in local time. Kept local so a late-evening event is not filed tomorrow. */
function localDateString(date: Date): DateString {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Calendar events as rail coordinates.
 *
 * All-day events are dropped: they contribute zero committed minutes in the repository
 * (most are birthdays and deadlines, not time commitments), and a block spanning the
 * whole rail would say the opposite. A multi-day event is clamped to the visible day at
 * whichever end runs past it.
 */
export function toRailEvents(events: readonly CalendarEvent[], date: DateString): RailEvent[] {
  const rail: RailEvent[] = []

  for (const event of events) {
    if (event.all_day) continue

    const start = new Date(event.start)
    if (Number.isNaN(start.getTime())) continue
    const end = new Date(event.end)

    const startMinute = localDateString(start) < date ? 0 : minutesSinceMidnight(start)
    const endMinute =
      Number.isNaN(end.getTime()) || localDateString(end) > date
        ? 24 * 60
        : minutesSinceMidnight(end)

    rail.push({
      id: event.id,
      title: event.title,
      start: startMinute,
      end: Math.max(startMinute, endMinute),
    })
  }

  return rail.sort((a, b) => a.start - b.start || a.end - b.end)
}

// ---------------------------------------------------------------------------
// gaps and packing
// ---------------------------------------------------------------------------

/**
 * The stretches of the rail with nothing on them, from `from` onward. Overlapping events
 * are merged, so a double-booked hour closes the gap once rather than twice.
 */
export function freeGaps(
  events: readonly RailEvent[],
  from: number,
  until: number = RAIL_END_MINUTE
): Gap[] {
  const gaps: Gap[] = []
  let cursor = Math.max(RAIL_START_MINUTE, from)

  for (const event of [...events].sort((a, b) => a.start - b.start)) {
    if (event.end <= cursor) continue
    if (event.start > cursor) gaps.push({ start: cursor, end: Math.min(event.start, until) })
    cursor = Math.max(cursor, event.end)
    if (cursor >= until) break
  }

  if (cursor < until) gaps.push({ start: cursor, end: until })
  return gaps.filter((gap) => gap.end > gap.start)
}

/**
 * Lay todos into the gaps, first fit, in the order the day would actually be worked.
 *
 * The caller passes only the todos the repository says *do* fit (`dayLoad.overflow`
 * holds the rest), so the rail and the tray can never contradict each other: one list is
 * drawn, the other is listed, and nothing is in both or in neither. A todo that still
 * finds no room — the repository counts free time to midnight, the rail only draws to
 * 11pm — comes back in `unplaced` rather than being silently dropped, so the caller can
 * decide what to say about it.
 */
export function packTodos(
  todos: readonly Todo[],
  gaps: readonly Gap[],
  fallbackEstimate: number
): Packing {
  const cursors = gaps.map((gap) => ({ ...gap, cursor: gap.start }))
  const placed: PlacedTodo[] = []
  const unplaced: Todo[] = []

  for (const todo of todos) {
    const minutes = Math.max(1, todo.estimate_minutes ?? fallbackEstimate)
    const gap = cursors.find((candidate) => candidate.end - candidate.cursor >= minutes)
    if (!gap) {
      unplaced.push(todo)
      continue
    }
    placed.push({ todo, start: gap.cursor, end: gap.cursor + minutes, minutes })
    gap.cursor += minutes
  }

  return { placed, unplaced }
}

// ---------------------------------------------------------------------------
// geometry
// ---------------------------------------------------------------------------

/** A minute as a percentage across the rail, clamped to it. */
export function railLeft(minute: number): string {
  const fraction = (minute - RAIL_START_MINUTE) / RAIL_LENGTH_MINUTES
  return `${(Math.min(1, Math.max(0, fraction)) * 100).toFixed(2)}%`
}

/** A span from `start` to `end` as a percentage width, clipped to the rail. */
export function railWidth(start: number, end: number): string {
  const from = Math.min(Math.max(start, RAIL_START_MINUTE), RAIL_END_MINUTE)
  const to = Math.min(Math.max(end, RAIL_START_MINUTE), RAIL_END_MINUTE)
  return `${(Math.max(0, to - from) / RAIL_LENGTH_MINUTES * 100).toFixed(2)}%`
}

/** True when any part of the span is on the visible rail. */
export function isOnRail(start: number, end: number): boolean {
  return end > RAIL_START_MINUTE && start < RAIL_END_MINUTE
}

// ---------------------------------------------------------------------------
// the hero line
// ---------------------------------------------------------------------------

/** The next event that has not started yet, or null. */
export function nextEventAfter(events: readonly RailEvent[], nowMinute: number): RailEvent | null {
  return [...events].sort((a, b) => a.start - b.start).find((event) => event.start > nowMinute) ?? null
}

/** The one event happening right now, if any. */
export function currentEventAt(events: readonly RailEvent[], nowMinute: number): RailEvent | null {
  return events.find((event) => event.start <= nowMinute && nowMinute < event.end) ?? null
}
