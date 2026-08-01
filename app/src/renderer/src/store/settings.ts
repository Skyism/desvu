import type { DeepPartial } from '@shared/ipc'
import type { Settings } from '@shared/types'

import { bridge } from '@/lib/bridge'
import { useVaultQuery, type VaultQuery } from './useVaultQuery'
import { invalidateVault } from './vault'

/**
 * `settings.json`, read and written the same way as any other vault record — shaped after
 * `store/inbox.ts`.
 *
 * Settings are malleable by design. Everything the user might reasonably want to change —
 * budget categories and their limits, calorie and protein targets, whether targets are
 * shown at all — lives here and is editable from the UI. None of it is ever a code change.
 */
export function useSettings(): VaultQuery<Settings> {
  return useVaultQuery(() => bridge().settings.get(), [])
}

/** A deep-partial patch. Arrays replace wholesale, so a removed category stays removed. */
export async function updateSettings(patch: DeepPartial<Settings>): Promise<Settings> {
  const next = await bridge().settings.update(patch)
  invalidateVault()
  return next
}
