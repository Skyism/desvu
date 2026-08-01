import { readFile } from 'node:fs/promises'
import { atomicWriteFile } from './atomic'
import { CorruptFileError, isErrnoException } from './errors'
import { withFileLock } from './lock'
import { withVaultLock } from './vault-lock'

export interface MutationOutcome<T, R> {
  /** The full collection to persist. */
  data: T
  /** What the caller gets back. */
  result: R
  /**
   * Set false to take the lock, read, decide nothing changed, and skip the write.
   * Recurrence materialization runs on every day-view read; rewriting an unchanged file
   * each time would churn iCloud for nothing.
   */
  write?: boolean
}

export interface JsonStore<T> {
  /** Resolved lazily so tests can repoint `DESVU_VAULT` between cases. */
  filePath(): string
  read(): Promise<T>
  /**
   * Read-modify-write under the per-file mutation lock. The callback is handed a *fresh*
   * read taken inside the lock, so two concurrent mutations can never both start from the
   * same snapshot and lose one another's changes.
   */
  mutate<R>(
    apply: (current: T) => MutationOutcome<T, R> | Promise<MutationOutcome<T, R>>
  ): Promise<R>
}

export function createJsonStore<T>(
  resolvePath: () => string,
  seed: () => T,
  check: (parsed: unknown, filePath: string) => T
): JsonStore<T> {
  async function load(filePath: string): Promise<T> {
    let raw: string
    try {
      raw = await readFile(filePath, 'utf8')
    } catch (error) {
      // A tracker that has never been written to is empty, not broken.
      if (isErrnoException(error) && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
        return seed()
      }
      throw error
    }

    // A zero-byte file carries no data to lose, so seeding over it is safe.
    if (raw.trim() === '') return seed()

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (error) {
      throw new CorruptFileError(filePath, `it is not valid JSON (${(error as Error).message})`)
    }

    return check(parsed, filePath)
  }

  return {
    filePath: resolvePath,

    async read(): Promise<T> {
      return load(resolvePath())
    },

    async mutate<R>(
      apply: (current: T) => MutationOutcome<T, R> | Promise<MutationOutcome<T, R>>
    ): Promise<R> {
      const filePath = resolvePath()
      // In-process lock first — it serializes this process's own callers. Then the
      // cross-process lock, which keeps `/sort-inbox` from read-modify-writing the same
      // file from a separate Python process and losing one side's records.
      return withFileLock(filePath, async () =>
        withVaultLock(async () => {
          const current = await load(filePath)
          const { data, result, write = true } = await apply(current)
          if (write) {
            await atomicWriteFile(filePath, `${JSON.stringify(data, null, 2)}\n`)
          }
          return result
        })
      )
    },
  }
}

export function expectArray<T>(parsed: unknown, filePath: string): T[] {
  if (!Array.isArray(parsed)) {
    throw new CorruptFileError(filePath, 'the top level is not a JSON array')
  }
  return parsed as T[]
}

export function expectObject<T>(parsed: unknown, filePath: string): T {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new CorruptFileError(filePath, 'the top level is not a JSON object')
  }
  return parsed as T
}
