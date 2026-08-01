import { useCallback, useEffect, useRef, useState } from 'react'

import { toError } from '@/lib/bridge'
import { useVault } from './vault'

export interface VaultQuery<T> {
  /** Null until the first successful load. Stays populated across refetches. */
  data: T | null
  error: Error | null
  /** True while a fetch is in flight, including refetches. */
  loading: boolean
  /** True once the first attempt has settled — distinguishes "not yet" from "nothing". */
  settled: boolean
  refetch: () => void
}

/**
 * THE data-fetching convention. Every read from the vault goes through this.
 *
 *   const purchases = useVaultQuery(() => bridge().finance.list(), [])
 *
 * It re-runs when `deps` change and whenever the vault revision moves — which happens
 * on any file change the main-process watcher sees, and on any explicit `invalidate()`
 * after a mutation. Out-of-order responses are discarded, so a fast refetch never loses
 * to a slow one still in flight.
 *
 * The storage layer may not be finished. A rejected IPC call lands in `error` and the
 * surface renders its error state — nothing white-screens.
 *
 * `deps` follows the `useEffect` contract: list every value the fetcher closes over.
 * The fetcher itself is intentionally NOT a dependency, so an inline arrow is fine.
 */
export function useVaultQuery<T>(fetcher: () => Promise<T>, deps: readonly unknown[]): VaultQuery<T> {
  const revision = useVault((state) => state.revision)
  const [nonce, setNonce] = useState(0)

  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(true)
  const [settled, setSettled] = useState(false)

  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  /** Guards against a stale response overwriting a newer one. */
  const runIdRef = useRef(0)

  useEffect(() => {
    const runId = ++runIdRef.current
    let cancelled = false
    setLoading(true)

    const run = async (): Promise<void> => {
      try {
        const result = await fetcherRef.current()
        if (cancelled || runId !== runIdRef.current) return
        setData(result)
        setError(null)
      } catch (thrown) {
        if (cancelled || runId !== runIdRef.current) return
        setError(toError(thrown))
      } finally {
        if (!cancelled && runId === runIdRef.current) {
          setLoading(false)
          setSettled(true)
        }
      }
    }

    void run()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision, nonce, ...deps])

  const refetch = useCallback(() => setNonce((n) => n + 1), [])

  return { data, error, loading, settled, refetch }
}
