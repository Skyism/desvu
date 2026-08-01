import { useState } from 'react'
import type { Todo } from '@shared/types'

import { Button } from '@/components/Button'
import { actualOptions, estimateOf } from './grouping'

export interface CompletionCaptureProps {
  /** The todo that was **already** completed. This strip never gates the completion. */
  todo: Todo
  fallbackEstimate: number
  onRecord: (minutes: number) => void
  onDismiss: () => void
}

/**
 * PRD T11 — `actual_minutes` in one tap, and one tap to walk away from.
 *
 * This is the load-bearing detail of the whole calibration feature. The completion has
 * *already* been written by the time this renders; the strip is an offer, not a step.
 * A modal here would be the end of the habit: the tick is the reward, and putting a form
 * between the user and it teaches them to stop ticking. Around 70% of people miss their
 * own time estimates, so the data is worth asking for — but not at the price of the
 * completion it is attached to.
 *
 * So: four taps that cover the realistic range, one to skip, and doing nothing at all is
 * also fine. A skipped capture costs one sample out of twenty-five.
 */
export function CompletionCapture({
  todo,
  fallbackEstimate,
  onRecord,
  onDismiss,
}: CompletionCaptureProps): React.JSX.Element {
  const estimate = estimateOf(todo, fallbackEstimate)
  const [custom, setCustom] = useState('')

  const submitCustom = (): void => {
    const minutes = Number.parseInt(custom, 10)
    if (Number.isFinite(minutes) && minutes >= 0) onRecord(minutes)
  }

  return (
    <div className="rounded-control bg-soft border-accent-border ml-[26px] flex flex-wrap items-center gap-2 border px-3 py-2.5">
      <span className="text-accent-text mr-1 text-xs">How long did it take?</span>

      {actualOptions(estimate).map((minutes) => (
        <Button
          key={minutes}
          size="sm"
          variant={minutes === estimate ? 'primary' : 'secondary'}
          shape="pill"
          onClick={() => onRecord(minutes)}
        >
          {minutes}m
        </Button>
      ))}

      <label className="flex items-center gap-1.5">
        <span className="sr-only">Some other number of minutes</span>
        <input
          type="number"
          min={0}
          step={5}
          inputMode="numeric"
          value={custom}
          placeholder="other"
          onChange={(event) => setCustom(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              submitCustom()
            }
          }}
          onBlur={() => custom !== '' && submitCustom()}
          className="rounded-pill border-line bg-card text-ink placeholder:text-muted h-8 w-[74px] border px-3 text-xs"
        />
      </label>

      {/* The one tap out. Never disabled, never hidden behind anything. */}
      <Button size="sm" variant="ghost" shape="pill" className="ml-auto" onClick={onDismiss}>
        Skip
      </Button>
    </div>
  )
}
