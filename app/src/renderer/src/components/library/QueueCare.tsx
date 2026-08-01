import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { useToast } from '@/components/Toast'
import { readableMessage } from '@/lib/bridge'
import { runAutoArchive } from './data'

/**
 * Once per app session. The tidy is a background courtesy, not a chore the user performs
 * repeatedly, and re-running it on every vault change would be pointless churn — the
 * repository writes nothing when there is nothing stale.
 */
let ranThisSession = false

export interface QueueCareProps {
  autoArchiveDays: number
  setAsideCount: number
  onViewSetAside: () => void
  viewingSetAside: boolean
}

/**
 * PRD E7 — the anti-graveyard mechanic, and the copy is most of the feature.
 *
 * "A graveyard of unread saves" is how every read-later tool dies, and the products that
 * survive fight it structurally rather than with willpower. So: unread items past the
 * window step out of the queue on their own, and this card says exactly what that means.
 *
 * What it must never say is that anything was removed, lost, cleaned up, or expired.
 * Nothing is deleted here — `archived: true` is one key in the note's frontmatter. The
 * file stays in the vault, stays a node in the Obsidian graph, and stays in search. A
 * queue you are visibly failing is a queue you stop opening; this is the queue taking
 * care of itself instead.
 */
export function QueueCare({
  autoArchiveDays,
  setAsideCount,
  onViewSetAside,
  viewingSetAside,
}: QueueCareProps): React.JSX.Element {
  const { toast } = useToast()
  const [tidying, setTidying] = useState(false)
  const [lastResult, setLastResult] = useState<number | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  /** The automatic half of E7. Quiet: no toast, just a line under the copy. */
  useEffect(() => {
    if (ranThisSession) return
    ranThisSession = true
    void (async () => {
      try {
        const result = await runAutoArchive()
        if (mounted.current) setLastResult(result.archived)
      } catch {
        // A failed tidy changes nothing and is not worth interrupting anyone for. The
        // items simply stay in the queue until the next launch.
        ranThisSession = false
      }
    })()
  }, [])

  const tidyNow = async (): Promise<void> => {
    setTidying(true)
    setProblem(null)
    try {
      const result = await runAutoArchive()
      setLastResult(result.archived)
      toast(
        result.archived === 0
          ? 'Nothing needed setting aside.'
          : `${result.archived} ${result.archived === 1 ? 'item' : 'items'} stepped out of the queue. Still in the vault, still in search.`,
        { tone: 'accent' }
      )
    } catch (thrown) {
      setProblem(readableMessage(thrown))
    } finally {
      setTidying(false)
    }
  }

  return (
    <Card
      variant="band"
      title="The queue looks after itself"
      meta={setAsideCount > 0 ? `${setAsideCount} set aside` : undefined}
    >
      <div className="flex flex-col gap-4">
        <p className="text-entry max-w-[76ch] text-sm leading-relaxed">
          Anything still unread after {autoArchiveDays} days steps out of the queue on its own.
          Nothing is deleted and nothing moves — the note stays in the vault, stays in the Obsidian
          graph, and still turns up in search. It just stops asking.
        </p>

        {lastResult !== null && (
          <p className="text-muted text-sm">
            {lastResult === 0
              ? 'Everything in the queue is still recent.'
              : `${lastResult} ${lastResult === 1 ? 'item' : 'items'} stepped out on this launch.`}
          </p>
        )}

        {problem !== null && (
          <p className="text-accent-text text-sm">
            {problem} Nothing was changed — the queue is exactly as it was.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2.5">
          <Button size="sm" variant="secondary" loading={tidying} onClick={() => void tidyNow()}>
            Tidy the queue now
          </Button>
          {setAsideCount > 0 && !viewingSetAside && (
            <Button size="sm" variant="ghost" onClick={onViewSetAside}>
              See what&apos;s been set aside
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}
