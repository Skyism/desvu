import { bridge } from '@/lib/bridge'
import { useVaultQuery, type VaultQuery } from './useVaultQuery'
import { invalidateVault } from './vault'

/**
 * THE WORKED EXAMPLE — copy this file's shape for todos, journal, finance, meals,
 * workouts, library, brain dump and search.
 *
 * The pattern is three parts and no more:
 *
 *   1. A read is a hook that wraps `useVaultQuery` with the right `bridge()` call.
 *      No caching, no normalization, no store slice. The vault is the cache.
 *   2. A write is a plain async function that calls `bridge()` and then
 *      `invalidateVault()`. It is not a hook and does not live in zustand, because
 *      nothing about it is stateful.
 *   3. Errors are returned, never thrown at the render tree. The caller decides
 *      whether that is an empty state, an inline note, or a toast.
 *
 * zustand holds only what the filesystem cannot: route, theme, sidebar, dialogs
 * (`store/ui.ts`) and the vault revision counter (`store/vault.ts`). Resist the urge to
 * mirror vault records into a store — two sources of truth is exactly the bug this
 * architecture was chosen to avoid.
 */

export type InboxLine = Awaited<ReturnType<Window['desvu']['inbox']['read']>>[number]

/** Unsorted capture count, for the header pill. */
export function useInboxCount(): VaultQuery<number> {
  return useVaultQuery(() => bridge().inbox.count(), [])
}

/** The raw unsorted lines, newest first. */
export function useInboxLines(): VaultQuery<InboxLine[]> {
  return useVaultQuery(() => bridge().inbox.read(), [])
}

/**
 * Append a raw line to today's Inbox file — the same file, in the same shape, that the
 * Telegram bot writes. No parsing happens here; `/sort-inbox` does the routing later.
 * Capture is never blocked by taxonomy.
 */
export async function captureToInbox(text: string): Promise<void> {
  const trimmed = text.trim()
  if (!trimmed) return
  await bridge().system.quickCapture(trimmed)
  invalidateVault()
}
