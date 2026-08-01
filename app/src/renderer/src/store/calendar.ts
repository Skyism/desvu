import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  CalendarEvent,
  CalendarRefreshResult,
  CalendarStatus,
  DateString,
} from '@shared/types'

import { bridge } from '@/lib/bridge'
import { useVaultQuery, type VaultQuery } from './useVaultQuery'
import { invalidateVault } from './vault'

/**
 * `data/calendar.json` is written by `scripts/refresh-calendar.mjs`, and read-only to the
 * app. **A missing file is still the normal case** — before the calendar is connected, and
 * for anyone who never connects it — so the repository returns an empty list rather than
 * throwing, and the Today rail reads as an open day rather than as a failure.
 */
export function useCalendarForDate(date: DateString): VaultQuery<CalendarEvent[]> {
  return useVaultQuery(() => bridge().calendar.forDate(date), [date])
}

// ---------------------------------------------------------------------------
// sync
// ---------------------------------------------------------------------------

export interface CalendarSyncState {
  status: CalendarStatus | null
  refreshing: boolean
  lastResult: CalendarRefreshResult | null
}

/**
 * Refreshes once when the app opens, plus a manual control.
 *
 * On open because the Today rail's whole job is answering "is today realistic?", and it
 * cannot do that against yesterday's schedule. Manual because the moment you most want a
 * refresh is right after you have added something.
 */
export function useCalendarSync(): CalendarSyncState & {
  refresh: () => Promise<void>
  dismiss: () => void
} {
  const [state, setState] = useState<CalendarSyncState>({
    status: null,
    refreshing: false,
    lastResult: null,
  })
  const mounted = useRef(true)
  const refreshedOnOpen = useRef(false)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const readStatus = useCallback(async () => {
    try {
      const status = await bridge().calendar.status()
      if (mounted.current) setState((s) => ({ ...s, status }))
      return status
    } catch {
      return null
    }
  }, [])

  const refresh = useCallback(async () => {
    setState((s) => ({ ...s, refreshing: true, lastResult: null }))
    let result: CalendarRefreshResult
    try {
      result = await bridge().calendar.refresh()
    } catch (error) {
      result = {
        ok: false,
        events: 0,
        error: error instanceof Error ? error.message : String(error),
      }
    }
    if (result.ok) invalidateVault()
    await readStatus()
    if (mounted.current) setState((s) => ({ ...s, refreshing: false, lastResult: result }))
  }, [readStatus])

  // Once per app open, and only when there is a connection to use. Guarded by a ref rather
  // than the dependency array, so a re-render cannot trigger a second fetch.
  useEffect(() => {
    if (refreshedOnOpen.current) return
    refreshedOnOpen.current = true
    void (async () => {
      const status = await readStatus()
      if (status?.connected) await refresh()
    })()
  }, [readStatus, refresh])

  const dismiss = useCallback(() => setState((s) => ({ ...s, lastResult: null })), [])

  return { ...state, refresh, dismiss }
}

/** "just now" · "12m ago" · "yesterday". Null when it has never run. */
export function describeLastRefresh(at: number | null): string | null {
  if (at === null) return null
  const minutes = Math.floor((Date.now() - at) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'yesterday' : `${days} days ago`
}
