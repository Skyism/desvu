import type { CalendarEvent, DateString } from '@shared/types'

import { bridge } from '@/lib/bridge'
import { useVaultQuery, type VaultQuery } from './useVaultQuery'

/**
 * `data/calendar.json` is written by a refresh script that does not exist yet (PRD I1),
 * so **a missing file is the normal case**: the repository returns an empty list rather
 * than throwing, and the Today rail has to read as an open day, not as a failure.
 * Read-only — the app never writes the calendar.
 */
export function useCalendarForDate(date: DateString): VaultQuery<CalendarEvent[]> {
  return useVaultQuery(() => bridge().calendar.forDate(date), [date])
}
