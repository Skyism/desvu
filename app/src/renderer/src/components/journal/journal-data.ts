import type { DateString, JournalEntry, Settings, StreakInfo } from '@shared/types'

import { bridge } from '@/lib/bridge'
import { invalidateVault, useVaultQuery, type VaultQuery } from '@/store'

/**
 * The journal's reads and writes, in the shape `store/inbox.ts` establishes: a read is a
 * hook wrapping `useVaultQuery`, a write is a plain async function that calls the bridge
 * and then `invalidateVault()`. No caching, no store slice, no mirrored records — the
 * vault is the cache.
 *
 * This lives beside the components rather than in `store/` only because `store/` is shared
 * territory and this surface owns `components/journal/**` outright. Lifting it to
 * `store/journal.ts` when a second surface needs it is a file move and an import change;
 * nothing about the shape has to alter.
 */

/** Every entry, newest first. The repository already sorts on `entry_date`. */
export function useJournalEntries(): VaultQuery<JournalEntry[]> {
  return useVaultQuery(() => bridge().journal.list(), [])
}

/**
 * The entry for one day, tagged with the date it was fetched for.
 *
 * The tag matters. `useVaultQuery` keeps the previous `data` while a new fetch is in
 * flight, so on a date change `data` briefly still holds *yesterday's* entry. A form that
 * hydrated from that would show the wrong day's writing for a frame — or worse, save it
 * onto the new date. Comparing `data.date` to the requested date makes that impossible.
 */
export interface DatedEntry {
  date: DateString
  entry: JournalEntry | null
}

export function useJournalDay(date: DateString): VaultQuery<DatedEntry> {
  return useVaultQuery(
    async () => ({ date, entry: await bridge().journal.byDate(date) }),
    [date]
  )
}

/**
 * PRD J5/J6. `StreakInfo` is `{current, longest, total}` and nothing else — there is no
 * last-entry date and no days-since, so no caller can derive a broken state from it.
 */
export function useJournalStreak(): VaultQuery<StreakInfo> {
  return useVaultQuery(() => bridge().journal.streak(), [])
}

/** Read-only, so the surface can describe J8 accurately rather than guessing at it. */
export function useSettings(): VaultQuery<Settings> {
  return useVaultQuery(() => bridge().settings.get(), [])
}

/**
 * Create or edit the day. One call for both, because the repository upserts on
 * `entry_date` — and because reopening a day to add a mood word to a rating logged at
 * breakfast is a normal path, not an edge case (16 of the 83 real entries were revised
 * after creation).
 */
export async function saveJournalEntry(
  input: Parameters<Window['desvu']['journal']['upsert']>[0]
): Promise<JournalEntry> {
  const saved = await bridge().journal.upsert(input)
  invalidateVault()
  return saved
}
