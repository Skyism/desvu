import { contextBridge, ipcRenderer } from 'electron'

import { IPC_CHANNELS, IPC_EVENTS, type DesvuApi } from '@shared/ipc'
import type { SortInboxProgress } from '@shared/types'

/**
 * The only thing the renderer can see of the main process.
 *
 * `ipcRenderer` itself is never exposed — handing the renderer a raw `invoke` would make
 * the `IPC_CHANNELS` allowlist decorative, and the main-process mutation lock only means
 * something if every write is funnelled through a channel that exists in the contract.
 *
 * The nested `window.desvu.todos.list()` shape is built *from* the allowlist rather than
 * written out by hand, so a channel that is not in `IPC_CHANNELS` is not reachable, and
 * a channel that is added there needs no edit here.
 */

/** A vault file changed on disk — from Obsidian, the Telegram bot, or a refresh script. */
export interface VaultChangedPayload {
  /** Epoch ms of the debounce flush, not of any individual write. */
  at: number
  /** Vault-relative paths, deduped. Capped — see `truncated`. */
  paths: string[]
  /** True when more paths changed than were reported; treat as "revalidate everything". */
  truncated: boolean
}

/** PRD C8 — the global hotkey fired while the app was in the background. */
export interface QuickCapturePayload {
  at: number
}

export type Unsubscribe = () => void

export type DesvuBridge = DesvuApi & {
  /** Fires after a debounced burst of vault writes. Returns an unsubscribe function. */
  onVaultChanged(listener: (payload: VaultChangedPayload) => void): Unsubscribe
  /** Fires when the global quick-capture accelerator is pressed. */
  onQuickCapture(listener: (payload: QuickCapturePayload) => void): Unsubscribe
  /**
   * Fires repeatedly while `/sort-inbox` runs. A sort takes 40-115 seconds, so the
   * renderer needs something to show other than a spinner.
   */
  onSortProgress(listener: (payload: SortInboxProgress) => void): Unsubscribe
}

type Invoker = (...args: unknown[]) => Promise<unknown>

function buildApi(): DesvuApi {
  const domains: Record<string, Record<string, Invoker>> = {}

  for (const channel of IPC_CHANNELS) {
    const separator = channel.indexOf(':')
    const domain = channel.slice(0, separator)
    const method = channel.slice(separator + 1)
    const bucket = (domains[domain] ??= {})
    bucket[method] = (...args: unknown[]) => ipcRenderer.invoke(channel, ...args)
  }

  // `Object.freeze` so a compromised renderer cannot re-point a method at another channel.
  for (const domain of Object.keys(domains)) Object.freeze(domains[domain])
  return Object.freeze(domains) as unknown as DesvuApi
}

function subscribe<T>(channel: string, listener: (payload: T) => void): Unsubscribe {
  const handler = (_event: Electron.IpcRendererEvent, payload: T): void => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.off(channel, handler)
  }
}

const bridge: DesvuBridge = {
  ...buildApi(),
  onVaultChanged: (listener) => subscribe(IPC_EVENTS.vaultChanged, listener),
  onQuickCapture: (listener) => subscribe(IPC_EVENTS.quickCapture, listener),
  onSortProgress: (listener) => subscribe(IPC_EVENTS.sortProgress, listener),
}

contextBridge.exposeInMainWorld('desvu', bridge)
