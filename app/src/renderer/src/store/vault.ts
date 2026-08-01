import { create } from 'zustand'

import { hasBridge } from '@/lib/bridge'

/**
 * A monotonically increasing revision number for "the vault might have changed".
 *
 * Three writers touch the corpus behind the app's back — Obsidian, the Telegram bot, and
 * the calendar/Gmail refresh scripts — so the app cannot assume its own writes are the
 * only ones. `useVaultQuery` re-runs whenever this number moves, which is the entire
 * cache-invalidation story. There is no cache to invalidate, only queries to re-run.
 */
interface VaultState {
  revision: number
  /** Epoch ms of the last change notice, or null if none has arrived. */
  lastChangeAt: number | null
  /** Paths from the most recent notice. Empty when the notice was truncated. */
  lastChangedPaths: string[]
  /**
   * Force a re-run of every live query. Call after a mutation. Harmless to over-call:
   * the watcher would have fired anyway, this just removes the debounce delay.
   */
  invalidate: () => void
}

export const useVault = create<VaultState>((set) => ({
  revision: 0,
  lastChangeAt: null,
  lastChangedPaths: [],
  invalidate: () => set((state) => ({ revision: state.revision + 1 })),
}))

/** Bump the revision from outside React. */
export function invalidateVault(): void {
  useVault.getState().invalidate()
}

/** Subscribe to main-process change notices. Called once, from `main.tsx`. */
export function initVaultSync(): () => void {
  if (!hasBridge()) return () => {}
  return window.desvu.onVaultChanged((payload) => {
    useVault.setState((state) => ({
      revision: state.revision + 1,
      lastChangeAt: payload.at,
      lastChangedPaths: payload.truncated ? [] : payload.paths,
    }))
  })
}
