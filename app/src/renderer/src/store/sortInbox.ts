import { useCallback, useEffect, useRef, useState } from 'react'
import type { SortInboxProgress, SortInboxResult } from '@shared/types'
import { bridge } from '@/lib/bridge'
import { invalidateVault } from './vault'

/**
 * Running `/sort-inbox` from the app.
 *
 * This is the one place the app deliberately breaks the "reads are cheap" rule: a sort
 * spawns the Claude CLI, takes 40–115 seconds, and bills real tokens. So unlike every
 * other write in `store/`, it is stateful, it streams, and it can be cancelled.
 */

export interface SortState {
  running: boolean
  /** The last thing the run reported doing. Null when idle. */
  progress: SortInboxProgress | null
  /** The outcome of the most recent run, kept until the next one starts. */
  result: SortInboxResult | null
  error: string | null
  /** False when the Claude CLI is not installed; the control hides itself. */
  available: boolean
}

const IDLE: SortState = {
  running: false,
  progress: null,
  result: null,
  error: null,
  available: false,
}

export function useSortInbox(): SortState & {
  sort: () => Promise<void>
  cancel: () => Promise<void>
  dismiss: () => void
} {
  const [state, setState] = useState<SortState>(IDLE)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // Hide the control entirely rather than offering a button that always fails.
  useEffect(() => {
    let cancelled = false
    bridge()
      .inbox.sortAvailable()
      .then((available) => {
        if (!cancelled && mounted.current) setState((s) => ({ ...s, available }))
      })
      .catch(() => {
        /* treated as unavailable */
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    return window.desvu.onSortProgress((progress) => {
      if (mounted.current) setState((s) => (s.running ? { ...s, progress } : s))
    })
  }, [])

  const sort = useCallback(async () => {
    setState((s) => ({ ...s, running: true, progress: null, result: null, error: null }))
    try {
      const result = await bridge().inbox.sort()
      // Records were written by another process; the watcher will fire too, but this
      // makes the surfaces update the moment the run returns rather than a beat later.
      invalidateVault()
      if (mounted.current) setState((s) => ({ ...s, running: false, progress: null, result }))
    } catch (error) {
      if (mounted.current) {
        setState((s) => ({
          ...s,
          running: false,
          progress: null,
          error: error instanceof Error ? error.message : String(error),
        }))
      }
    }
  }, [])

  const cancel = useCallback(async () => {
    await bridge().inbox.cancelSort()
  }, [])

  const dismiss = useCallback(() => {
    setState((s) => ({ ...s, result: null, error: null }))
  }, [])

  return { ...state, sort, cancel, dismiss }
}

/**
 * What to say about a finished run.
 *
 * `filed` and `needsYou` come from counting the Inbox before and after, not from the
 * agent's summary — so these numbers are true even if the model's prose is optimistic.
 */
export function describeResult(result: SortInboxResult): string {
  if (result.cancelled) return 'Stopped. Nothing was left half-filed.'
  if (result.filed === 0 && result.needsYou === 0) return 'Inbox was already clear.'

  const parts: string[] = []
  if (result.filed > 0) parts.push(`${result.filed} filed`)
  if (result.needsYou > 0) {
    // Not a failure and not an error — headless simply cannot ask a question.
    parts.push(`${result.needsYou} still unsorted — run /sort-inbox in Claude Code to decide`)
  }
  return parts.join(' · ')
}
