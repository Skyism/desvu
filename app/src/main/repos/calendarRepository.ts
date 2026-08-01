import { stat } from 'node:fs/promises'
import type { CalendarEvent, DateString } from '@shared/types'
import { dataPath } from '@shared/vault'
import { toDateString } from '../lib/dates'
import { CorruptFileError, isErrnoException } from '../lib/errors'
import { createJsonStore } from '../lib/json-store'

/**
 * Read-only view of `data/calendar.json`, which a refresh script owns (PRD I1).
 *
 * That script does not exist yet, so **a missing file is the normal case** and must read
 * as "no events", not as an error — the Today view has to render on a machine that has
 * never run a calendar refresh.
 *
 * Two on-disk shapes are accepted, because the script has not been written and pinning
 * its output format from here would be guessing: a bare array of events, or an object
 * with `events` plus a refresh timestamp.
 */
interface CalendarFile {
  events?: unknown
  last_refresh?: unknown
  lastRefresh?: unknown
  refreshed_at?: unknown
}

type CalendarContents = { events: CalendarEvent[]; lastRefresh: number | null }

const store = createJsonStore<unknown>(
  () => dataPath('calendar.json'),
  () => null,
  (parsed) => parsed
)

function coerceEvent(value: unknown): CalendarEvent | null {
  if (typeof value !== 'object' || value === null) return null
  const raw = value as Record<string, unknown>
  const start = typeof raw.start === 'string' ? raw.start : null
  const title = typeof raw.title === 'string' ? raw.title : null
  if (!start || !title) return null

  const event: CalendarEvent = {
    id: typeof raw.id === 'string' ? raw.id : `${start}-${title}`,
    title,
    start,
    end: typeof raw.end === 'string' ? raw.end : start,
    all_day: raw.all_day === true,
  }
  if (typeof raw.location === 'string') event.location = raw.location
  return event
}

async function readContents(): Promise<CalendarContents> {
  const parsed = await store.read()
  if (parsed === null || parsed === undefined) return { events: [], lastRefresh: null }

  if (Array.isArray(parsed)) {
    return { events: parsed.map(coerceEvent).filter((e): e is CalendarEvent => e !== null), lastRefresh: await fileMtime() }
  }

  if (typeof parsed !== 'object') {
    throw new CorruptFileError(store.filePath(), 'expected an array of events or an object')
  }

  const file = parsed as CalendarFile
  const events = Array.isArray(file.events)
    ? file.events.map(coerceEvent).filter((e): e is CalendarEvent => e !== null)
    : []

  const stamp = file.last_refresh ?? file.lastRefresh ?? file.refreshed_at
  let lastRefresh: number | null = null
  if (typeof stamp === 'number' && Number.isFinite(stamp)) lastRefresh = stamp
  else if (typeof stamp === 'string') {
    const parsedStamp = Date.parse(stamp)
    if (!Number.isNaN(parsedStamp)) lastRefresh = parsedStamp
  }

  return { events, lastRefresh: lastRefresh ?? (await fileMtime()) }
}

async function fileMtime(): Promise<number | null> {
  try {
    const info = await stat(store.filePath())
    return info.mtimeMs
  } catch (error) {
    if (isErrnoException(error) && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) return null
    throw error
  }
}

/** Local calendar day an ISO instant falls on. */
export function eventDate(isoString: string): DateString | null {
  const parsed = new Date(isoString)
  if (Number.isNaN(parsed.getTime())) return null
  return toDateString(parsed)
}

export const calendarRepository = {
  async forDate(date: DateString): Promise<CalendarEvent[]> {
    const { events } = await readContents()
    return events
      .filter((event) => {
        const startDay = eventDate(event.start)
        if (startDay === null) return false
        if (startDay === date) return true
        // Multi-day events count on every day they cover.
        const endDay = eventDate(event.end) ?? startDay
        return startDay <= date && date <= endDay
      })
      .sort((a, b) => a.start.localeCompare(b.start))
  },

  async lastRefresh(): Promise<number | null> {
    const { lastRefresh } = await readContents()
    return lastRefresh
  },

  /** Everything, for search and diagnostics. */
  async listAll(): Promise<CalendarEvent[]> {
    const { events } = await readContents()
    return events
  },
}

export type CalendarRepository = typeof calendarRepository
