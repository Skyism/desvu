/**
 * Access to `window.desvu`, the renderer's entire view of the filesystem.
 *
 * Typed via the global augmentation in `src/preload/index.d.ts`, so nothing here
 * imports preload code at runtime.
 */
export type Bridge = Window['desvu']

export function hasBridge(): boolean {
  return typeof window !== 'undefined' && typeof window.desvu === 'object' && window.desvu !== null
}

/**
 * Throws rather than returning undefined, so a missing preload surfaces as a normal
 * query error in the UI instead of a `cannot read properties of undefined` white screen.
 */
export function bridge(): Bridge {
  if (!hasBridge()) {
    throw new Error('The app bridge is unavailable. Restarting Dès vu should fix it.')
  }
  return window.desvu
}

/** Normalize anything thrown across IPC into an Error with a readable message. */
export function toError(thrown: unknown): Error {
  if (thrown instanceof Error) return thrown
  return new Error(typeof thrown === 'string' ? thrown : 'Something went wrong.')
}

/**
 * Electron prefixes rejected `invoke` messages with
 * `Error invoking remote method 'x:y':`. Strip it — the user did not invoke a remote
 * method, they clicked a button.
 */
export function readableMessage(thrown: unknown): string {
  const message = toError(thrown).message
  return message.replace(/^Error invoking remote method '[^']*':\s*/, '').trim()
}
