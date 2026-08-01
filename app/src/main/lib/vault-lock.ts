import { mkdir, open, readFile, rm, stat } from 'node:fs/promises'
import { hostname } from 'node:os'
import path from 'node:path'
import { dataPath } from '@shared/vault'
import { isErrnoException } from './errors'
import { withFileLock } from './lock'

/**
 * Cross-process advisory lock over the shared record files in `data/`.
 *
 * The in-process `withFileLock` serializes *this* process's callers and nothing more.
 * `/sort-inbox` runs as a **separate Python process** and read-modify-writes the same
 * whole files, so with only the in-process lock two writers can interleave and one side's
 * todo or purchase disappears with no error anywhere. For a capture app that is the worst
 * failure there is: the user did the work, saw it accepted, and it is gone.
 *
 * The protocol is deliberately primitive so it can be reimplemented in Python in a few
 * lines with no dependencies — see `docs/lockfile-protocol.md`, which is the normative
 * description. Creating a file with `O_CREAT | O_EXCL` is atomic on APFS, and that single
 * guarantee is the whole basis of the mutual exclusion.
 *
 * **Same machine only.** iCloud gives `O_EXCL` no cross-device meaning whatsoever — a
 * lock taken on this Mac says nothing to a process on the phone or another laptop. That
 * is acceptable because both writers (this app and the sort skill) run on this Mac by
 * design, but the assumption is written down here rather than left implied.
 */

export const VAULT_LOCK_FILE = '.desvu.lock'

/** How long before a lock is *eligible* to be considered abandoned. */
export const LOCK_STALE_MS = 30_000
/** Total time a writer will wait before giving up with an actionable error. */
export const LOCK_TIMEOUT_MS = 10_000

const MIN_BACKOFF_MS = 15
const MAX_BACKOFF_MS = 250

export type LockHolder = 'app' | 'sort-inbox' | (string & {})

export interface LockRecord {
  pid: number
  host: string
  acquired_at: number
  holder: LockHolder
}

interface LockSettings {
  timeoutMs: number
  staleMs: number
  holder: LockHolder
}

const settings: LockSettings = {
  timeoutMs: LOCK_TIMEOUT_MS,
  staleMs: LOCK_STALE_MS,
  holder: 'app',
}

/** Tests and, eventually, anything embedding the repositories under a different name. */
export function configureVaultLock(overrides: Partial<LockSettings>): void {
  Object.assign(settings, overrides)
}

export function vaultLockPath(): string {
  return dataPath(VAULT_LOCK_FILE)
}

/** What this process currently holds, so a recycled pid is not mistaken for a live one. */
let ownedStamp: LockRecord | null = null

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    // Signal 0 performs the permission and existence checks without delivering anything.
    process.kill(pid, 0)
    return true
  } catch (error) {
    // EPERM means the process exists but belongs to someone else — still alive.
    return isErrnoException(error) && error.code === 'EPERM'
  }
}

async function readLock(lockPath: string): Promise<{ record: LockRecord | null; age: number }> {
  let raw: string
  try {
    raw = await readFile(lockPath, 'utf8')
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') return { record: null, age: 0 }
    throw error
  }

  try {
    const parsed = JSON.parse(raw) as Partial<LockRecord>
    if (typeof parsed.pid === 'number' && typeof parsed.acquired_at === 'number') {
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

  // No usable contents — age it by mtime so a torn lock file still becomes stealable.
  try {
    const info = await stat(lockPath)
    return { record: null, age: Date.now() - info.mtimeMs }
  } catch {
    return { record: null, age: 0 }
  }
}

function isStealable(record: LockRecord | null, age: number, staleMs: number): boolean {
  if (age < staleMs) return false

  // An unreadable lock file older than the staleness window is debris from a crash.
  if (record === null) return true

  // The pid check only means anything on the machine that wrote it.
  if (record.host !== hostname()) return false

  // Our own pid, old, and not held by anything in this process: a previous run of this
  // app crashed and the pid has since been recycled back to us.
  if (record.pid === process.pid && ownedStamp === null) return true

  return !isProcessAlive(record.pid)
}

function describeHolder(record: LockRecord | null, age: number): string {
  if (record === null) return `an unreadable lock file (${Math.round(age / 1000)}s old)`
  return (
    `${record.holder} (pid ${record.pid} on ${record.host || 'an unknown host'}, ` +
    `held for ${Math.round(age / 1000)}s)`
  )
}

async function acquire(lockPath: string, options: LockSettings): Promise<LockRecord> {
  const deadline = Date.now() + options.timeoutMs
  let backoff = MIN_BACKOFF_MS
  let lastSeen: { record: LockRecord | null; age: number } = { record: null, age: 0 }

  for (;;) {
    const stamp: LockRecord = {
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
      if (isErrnoException(error) && error.code === 'ENOENT') {
        // `data/` does not exist yet — first run against a fresh vault.
        await mkdir(path.dirname(lockPath), { recursive: true })
        continue
      }
      if (!isErrnoException(error) || error.code !== 'EEXIST') throw error
    }

    lastSeen = await readLock(lockPath)

    if (isStealable(lastSeen.record, lastSeen.age, options.staleMs)) {
      console.warn(
        `[desvu] Stealing an abandoned vault lock at ${lockPath} from ` +
          `${describeHolder(lastSeen.record, lastSeen.age)}. The process that held it is ` +
          `no longer running; it most likely crashed mid-write.`
      )
      await rm(lockPath, { force: true })
      continue
    }

    if (Date.now() >= deadline) {
      throw new Error(
        `Could not get the vault write lock within ${Math.round(options.timeoutMs / 1000)}s: ` +
          `it is held by ${describeHolder(lastSeen.record, lastSeen.age)}. ` +
          `Nothing was written. If that process is definitely not running, delete ` +
          `${lockPath} and try again.`
      )
    }

    await delay(backoff + Math.floor(Math.random() * MIN_BACKOFF_MS))
    backoff = Math.min(MAX_BACKOFF_MS, Math.round(backoff * 1.6))
  }
}

function sameRecord(a: LockRecord, b: LockRecord): boolean {
  return a.pid === b.pid && a.host === b.host && a.acquired_at === b.acquired_at
}

async function release(lockPath: string, stamp: LockRecord): Promise<void> {
  ownedStamp = null
  const { record } = await readLock(lockPath)

  // Someone judged our lock abandoned and took it. Deleting it now would hand a third
  // writer the lock while the second one is still working.
  if (record !== null && !sameRecord(record, stamp)) {
    console.warn(
      `[desvu] The vault lock at ${lockPath} was taken over by ${describeHolder(record, 0)} ` +
        `while this process held it. Leaving it in place.`
    )
    return
  }

  await rm(lockPath, { force: true })
}

/**
 * Run `operation` while holding the cross-process vault lock.
 *
 * Layered *under* the in-process lock by its callers: `withFileLock` first, to serialize
 * this process's own writers to one file, then this, to exclude every other process.
 * Acquisition itself is queued in-process so concurrent callers line up rather than
 * fighting over the same lock file.
 *
 * Released in a `finally`, so a throw inside `operation` can never strand the lock.
 */
export async function withVaultLock<T>(
  operation: () => Promise<T>,
  overrides: Partial<LockSettings> = {}
): Promise<T> {
  const lockPath = vaultLockPath()
  const options: LockSettings = { ...settings, ...overrides }

  return withFileLock(`vault-lock::${lockPath}`, async () => {
    const stamp = await acquire(lockPath, options)
    try {
      return await operation()
    } finally {
      await release(lockPath, stamp)
    }
  })
}
