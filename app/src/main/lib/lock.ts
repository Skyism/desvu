/**
 * Serialized mutation lock, keyed by absolute file path.
 *
 * Ported from `gratefulnessjar/server/entryRepository.ts`, where a single module-level
 * promise chain serialized every mutation. The only change is the key: this app writes a
 * dozen different files, so one global queue would make an unrelated meal log wait behind
 * a library scan. Same guarantee per file, more parallelism across files.
 *
 * As in the original, the next operation runs whether or not the previous one settled
 * successfully — a failed write must not wedge the queue forever.
 */
const queues = new Map<string, Promise<unknown>>()

export function withFileLock<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve()
  const next = previous.then(operation, operation)

  queues.set(
    key,
    next.then(
      () => undefined,
      () => undefined
    )
  )

  return next
}

/** Resolves once every currently queued mutation has settled. Tests and shutdown. */
export async function drainFileLocks(): Promise<void> {
  await Promise.allSettled([...queues.values()])
}
