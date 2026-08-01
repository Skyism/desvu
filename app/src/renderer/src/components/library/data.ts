import type { DayLoad, LibraryItem, LibraryStatus, Settings } from '@shared/types'

import { bridge } from '@/lib/bridge'
import { toDateString } from '@/lib/date'
import { useVaultQuery, type VaultQuery } from '@/store/useVaultQuery'
import { invalidateVault } from '@/store/vault'

/**
 * The library's reads and writes, in the shape `store/inbox.ts` sets out: a read is a
 * hook wrapping `useVaultQuery`, a write is a plain async function that calls `bridge()`
 * and then `invalidateVault()`, and errors come back rather than being thrown at the
 * render tree. Nothing is mirrored into a store — the vault is the cache, and it has
 * three other writers.
 *
 * It lives beside the components rather than in `store/` only because file ownership was
 * split that way for this wave; the shape is `store/library.ts` and it can be moved with
 * a rename.
 */

/**
 * Everything, archived included, in one read. The scope filter then decides what is on
 * screen — which means switching to "set aside" is instant, the facet counts are honest,
 * and there is no second round trip that could disagree with the first.
 */
export function useLibrary(): VaultQuery<LibraryItem[]> {
  return useVaultQuery(() => bridge().library.list({ includeArchived: true }), [])
}

/** PRD E6. `null` free minutes means the day load has not arrived; nothing is fetched. */
export function useFitting(freeMinutes: number | null): VaultQuery<LibraryItem[]> {
  return useVaultQuery(
    async () => (freeMinutes === null ? [] : bridge().library.fitting(Math.max(0, freeMinutes))),
    [freeMinutes]
  )
}

/**
 * The same `dayLoad` the Today view computes. E6 is the connection worth building, and
 * it is only worth anything if both surfaces are reading the one number.
 */
export function useDayLoad(date = toDateString()): VaultQuery<DayLoad> {
  return useVaultQuery(() => bridge().todos.dayLoad(date), [date])
}

/** For `library.auto_archive_days`, so the copy states the real window rather than "30". */
export function useSettings(): VaultQuery<Settings> {
  return useVaultQuery(() => bridge().settings.get(), [])
}

export async function setLibraryStatus(path: string, status: LibraryStatus): Promise<void> {
  await bridge().library.setStatus(path, status)
  invalidateVault()
}

/**
 * Step an item out of the queue, or put it back. Both directions are one call and one
 * frontmatter key; neither moves, renames or removes the note.
 */
export async function setLibraryArchived(path: string, archived: boolean): Promise<void> {
  await bridge().library.setArchived(path, archived)
  invalidateVault()
}

/**
 * PRD E7. Unread items past the window step out of the queue. Nothing is deleted — the
 * repository only writes `archived: true` into the note's frontmatter.
 */
export async function runAutoArchive(): Promise<{ archived: number }> {
  const result = await bridge().library.runAutoArchive()
  if (result.archived > 0) invalidateVault()
  return result
}

export async function openInObsidian(path: string): Promise<void> {
  await bridge().system.openInObsidian(path)
}
