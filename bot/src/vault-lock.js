/**
 * Cross-process advisory lock over shared vault files.
 *
 * A reimplementation of `docs/lockfile-protocol.md` for the bot, which is a third writer
 * alongside the Electron app and `/sort-inbox`. As with vault.js, this deliberately shares
 * no code with `app/src/main/lib/vault-lock.ts` — the packages have no build step in common
 * — but the protocol constants and semantics must match it exactly. If the document changes,
 * change both.
 *
 * The bot's single-`write` append was already atomic for the append itself. This lock is a
 * different guarantee layered on top: it excludes the *other* processes' read-modify-write
 * cycles, which is what would otherwise lose a line.
 *
 * **Same machine only.** `O_EXCL` is atomic on APFS and meaningless over iCloud. Every
 * writer runs on this Mac by design.
 */
import { mkdir, open, readFile, rm, stat } from 'node:fs/promises'
import { hostname } from 'node:os'
import path from 'node:path'
import { log } from './log.js'
import { resolveVaultPath } from './vault.js'

export const VAULT_LOCK_FILE = '.desvu.lock'
/** How long before a lock is *eligible* to be considered abandoned. */
export const LOCK_STALE_MS = 30_000
/** Total time a writer waits before giving up with an actionable error. */
export const LOCK_TIMEOUT_MS = 10_000

const MIN_BACKOFF_MS = 15
const MAX_BACKOFF_MS = 250

/** Thrown when the lock could not be acquired. Distinct so callers can word the reply. */
export class VaultLockError extends Error {
  constructor(message) {
    super(message)
    this.name = 'VaultLockError'
  }
}

const settings = {
  timeoutMs: LOCK_TIMEOUT_MS,
  staleMs: LOCK_STALE_MS,
  holder: 'bot',
}

/** Tests only. */
export function configureVaultLock(overrides) {
  Object.assign(settings, overrides)
}

/** Tests only. */
export function resetVaultLockConfig() {
  settings.timeoutMs = LOCK_TIMEOUT_MS
  settings.staleMs = LOCK_STALE_MS
  settings.holder = 'bot'
}

/**
 * The one path this module writes. It sits in `data/`, which the C7 capture guard refuses —
 * correctly, because a lock file is not a capture. The path is computed here and never
 * derived from a message, so this is not a way for Telegram content to reach `data/`.
 */
export function vaultLockPath(root) {
  return path.join(root ?? resolveVaultPath(), 'data', VAULT_LOCK_FILE)
}

/** What this process currently holds, so a recycled pid is not mistaken for a live one. */
let ownedStamp = null

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    // Signal 0 performs the existence and permission checks without delivering anything.
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM means the process exists but belongs to someone else — still alive.
    return error?.code === 'EPERM'
  }
}

async function readLock(lockPath) {
  let raw
  try {
    raw = await readFile(lockPath, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return { record: null, age: 0 }
    throw error
  }

  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed?.pid === 'number' && typeof parsed?.acquired_at === 'number') {
      return {
        record: {
          pid: parsed.pid,
          host: typeof parsed.host === 'string' ? parsed.host : '',
          acquired_at: parsed.acquired_at,
          holder: typeof parsed.holder === 'string' ? parsed.holder : 'unknown',
        },
        age: Date.now() - parsed.acquired_at,
      }
    }
  } catch {
    // Fall through: a truncated lock file is a crashed writer, not a valid holder.
  }

  // No usable contents — age it by mtime so torn debris still becomes stealable.
  try {
    const info = await stat(lockPath)
    return { record: null, age: Date.now() - info.mtimeMs }
  } catch {
    return { record: null, age: 0 }
  }
}

function isStealable(record, age, staleMs) {
  if (age < staleMs) return false

  // An unreadable lock file older than the staleness window is debris from a crash.
  if (record === null) return true

  // The pid check only means anything on the machine that wrote it.
  if (record.host !== hostname()) return false

  // Our own pid, old, and not held by anything in this process: a previous run crashed
  // and the OS recycled the pid back to us.
  if (record.pid === process.pid && ownedStamp === null) return true

  return !isProcessAlive(record.pid)
}

function describeHolder(record, age) {
  if (record === null) return `an unreadable lock file (${Math.round(age / 1000)}s old)`
  return (
    `${record.holder} (pid ${record.pid} on ${record.host || 'an unknown host'}, ` +
    `held for ${Math.round(age / 1000)}s)`
  )
}

async function acquire(lockPath, options) {
  const deadline = Date.now() + options.timeoutMs
  let backoff = MIN_BACKOFF_MS

  for (;;) {
    const stamp = {
      pid: process.pid,
      host: hostname(),
      acquired_at: Date.now(),
      holder: options.holder,
    }

    try {
      // 'wx' is O_CREAT | O_EXCL — it fails rather than truncating if the file exists.
      const handle = await open(lockPath, 'wx')
      try {
        await handle.writeFile(`${JSON.stringify(stamp)}\n`, 'utf8')
        await handle.sync()
      } finally {
        await handle.close()
      }
      ownedStamp = stamp
      return stamp
    } catch (error) {
      if (error?.code === 'ENOENT') {
        // `data/` does not exist yet — first run against a fresh vault.
        await mkdir(path.dirname(lockPath), { recursive: true })
        continue
      }
      if (error?.code !== 'EEXIST') throw error
    }

    const seen = await readLock(lockPath)

    if (isStealable(seen.record, seen.age, options.staleMs)) {
      log.warn(
        `stealing an abandoned vault lock at ${lockPath} from ` +
          `${describeHolder(seen.record, seen.age)}. The process that held it is no longer ` +
          'running; it most likely crashed mid-write.'
      )
      await rm(lockPath, { force: true })
      continue
    }

    if (Date.now() >= deadline) {
      throw new VaultLockError(
        `Could not get the vault write lock within ${Math.round(options.timeoutMs / 1000)}s: ` +
          `it is held by ${describeHolder(seen.record, seen.age)}. Nothing was written. ` +
          `If that process is definitely not running, delete ${lockPath} and try again.`
      )
    }

    await delay(backoff + Math.floor(Math.random() * MIN_BACKOFF_MS))
    backoff = Math.min(MAX_BACKOFF_MS, Math.round(backoff * 1.6))
  }
}

const sameRecord = (a, b) =>
  a.pid === b.pid && a.host === b.host && a.acquired_at === b.acquired_at

async function release(lockPath, stamp) {
  ownedStamp = null
  let seen
  try {
    seen = await readLock(lockPath)
  } catch {
    return
  }

  // Someone judged our lock abandoned and took it. Deleting it now would hand a third
  // writer the lock while the second one is still working.
  if (seen.record !== null && !sameRecord(seen.record, stamp)) {
    log.warn(
      `the vault lock at ${lockPath} was taken over by ${describeHolder(seen.record, 0)} ` +
        'while this process held it. Leaving it in place.'
    )
    return
  }

  await rm(lockPath, { force: true })
}

/**
 * In-process queue, so the bot's own concurrent captures line up for the lock file rather
 * than fighting over it and burning their timeouts against each other. Same role as the
 * app's `withFileLock`; one global queue is right here because the bot writes few files.
 */
let queue = Promise.resolve()

/**
 * Run `operation` while holding the cross-process vault lock.
 * Released in a `finally`, so a throw inside `operation` can never strand it.
 */
export function withVaultLock(operation, overrides = {}) {
  const options = { ...settings, ...overrides }

  const run = async () => {
    const lockPath = vaultLockPath(overrides.root)
    const stamp = await acquire(lockPath, options)
    try {
      return await operation()
    } finally {
      await release(lockPath, stamp)
    }
  }

  const next = queue.then(run, run)
  queue = next.then(
    () => undefined,
    () => undefined
  )
  return next
}

/** Resolves once every queued operation has settled. Tests and shutdown. */
export async function drainVaultLock() {
  await queue
}
