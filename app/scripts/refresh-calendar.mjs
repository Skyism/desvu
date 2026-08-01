#!/usr/bin/env node
/**
 * Pull Google Calendar into `data/calendar.json`.
 *
 *   node scripts/refresh-calendar.mjs [--days 14] [--vault <dir>] [--quiet]
 *
 * `calendarRepository` reads that file and is read-only to it, exactly as
 * `data/SCHEMAS.md` describes. This is the writer.
 *
 * Runnable on its own, so `/sort-inbox`, a launchd job or a terminal can refresh the
 * calendar without the app being open. The app spawns this same script.
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { getAccessToken } from './google-config.mjs'

const VAULT_DIR_NAME = 'Dès vu'
const VAULT_MARKERS = ['PRD.md', path.join('data', 'SCHEMAS.md')]

const args = process.argv.slice(2)
const flag = (name, fallback = null) => {
  const i = args.indexOf(name)
  return i === -1 || i === args.length - 1 ? fallback : args[i + 1]
}
const quiet = args.includes('--quiet')
const log = (...parts) => {
  if (!quiet) console.log(...parts)
}

/** Same rules as `@shared/vault`: NFC/NFD tolerant, and a marker file is required. */
function resolveVault() {
  const explicit = flag('--vault') ?? process.env.DESVU_VAULT
  if (explicit) return explicit

  const same = (a, b) => a.normalize('NFC') === b.normalize('NFC')
  const parents = [
    path.join(homedir(), 'Documents'),
    path.join(homedir(), 'Library', 'Mobile Documents', 'iCloud~md~obsidian', 'Documents'),
  ]
  for (const parent of parents) {
    if (!existsSync(parent)) continue
    for (const entry of readdirSync(parent)) {
      if (!same(entry, VAULT_DIR_NAME)) continue
      const candidate = path.join(parent, entry)
      // A directory with a `data/` child is not enough — a stray once shadowed the vault.
      if (VAULT_MARKERS.some((m) => existsSync(path.join(candidate, m)))) return candidate
    }
  }
  throw new Error(`Could not find the "${VAULT_DIR_NAME}" vault. Set DESVU_VAULT or pass --vault.`)
}

export const pad = (n) => String(n).padStart(2, '0')

/** `2026-08-04T00:00:00-07:00` — the same shape Google returns for timed events. */
export function localIso(date) {
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const abs = Math.abs(offset)
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  )
}

/**
 * Google returns `dateTime` for timed events and a bare `date` for all-day ones.
 *
 * An all-day event is pinned to **local midnight with a local offset**, deliberately not
 * `toISOString()`. Two reasons. A bare `YYYY-MM-DD` handed to `new Date()` parses as UTC
 * and lands the event on the wrong day west of Greenwich. And converting to UTC would make
 * `calendar.json` mix two representations — offset form for timed events, `Z` form for
 * all-day ones — so the obvious `start.slice(0, 10)` would read as the local day for one
 * and the UTC day for the other. Agents and scripts read this file directly; one shape.
 */
export function toIso(slot, fallbackDate) {
  if (slot?.dateTime) return slot.dateTime
  const day = slot?.date ?? fallbackDate
  if (!day) return null
  const [y, m, d] = day.split('-').map(Number)
  return localIso(new Date(y, m - 1, d, 0, 0, 0))
}

export function toEvent(item) {
  const allDay = Boolean(item.start?.date)
  const start = toIso(item.start)
  const end = toIso(item.end)
  if (!start || !end) return null
  return {
    id: item.id,
    title: item.summary?.trim() || '(no title)',
    start,
    end,
    all_day: allDay,
    ...(item.location ? { location: item.location.trim() } : {}),
  }
}

async function listEvents(accessToken, days) {
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const to = new Date(from.getTime() + days * 24 * 60 * 60 * 1000)

  const events = []
  let pageToken
  do {
    const url = new URL(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events'
    )
    url.searchParams.set('timeMin', from.toISOString())
    url.searchParams.set('timeMax', to.toISOString())
    // Expands recurring events into real instances, which is what a day rail needs.
    url.searchParams.set('singleEvents', 'true')
    url.searchParams.set('orderBy', 'startTime')
    url.searchParams.set('maxResults', '250')
    if (pageToken) url.searchParams.set('pageToken', pageToken)

    const res = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } })
    const body = await res.json()
    if (!res.ok) {
      throw new Error(`Calendar API ${res.status}: ${body.error?.message ?? 'unknown error'}`)
    }
    for (const item of body.items ?? []) {
      // A declined invitation is not on your day.
      const me = (item.attendees ?? []).find((a) => a.self)
      if (me?.responseStatus === 'declined') continue
      if (item.status === 'cancelled') continue
      const event = toEvent(item)
      if (event) events.push(event)
    }
    pageToken = body.nextPageToken
  } while (pageToken)

  return events
}

async function main() {
  const vault = resolveVault()
  const days = Number(flag('--days', '14'))
  if (!Number.isFinite(days) || days < 1) throw new Error('--days must be a positive number')

  const accessToken = await getAccessToken()
  const events = await listEvents(accessToken, days)

  const target = path.join(vault, 'data', 'calendar.json')
  await mkdir(path.dirname(target), { recursive: true })

  // Atomic, like every other vault write — the directory syncs to iCloud underneath us.
  const temp = path.join(path.dirname(target), `.calendar.${process.pid}.tmp`)
  await writeFile(temp, `${JSON.stringify({ last_refresh: Date.now(), events }, null, 2)}\n`)
  await rename(temp, target)

  const today = new Date().toISOString().slice(0, 10)
  const todayCount = events.filter((e) => e.start.slice(0, 10) === today).length
  log(`✓ ${events.length} events over ${days} days (${todayCount} today) → ${target}`)
}

// Only run when invoked directly, so tests can import the helpers above.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`✗ ${error.message}`)
    process.exit(1)
  })
}
