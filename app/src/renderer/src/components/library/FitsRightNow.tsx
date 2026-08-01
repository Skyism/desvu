import { useMemo, useState } from 'react'
import type { LibraryItem } from '@shared/types'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { EmptyState } from '@/components/EmptyState'
import { SkeletonLines } from '@/components/Skeleton'
import { formatMinutes } from '@/lib/date'
import { useDayLoad, useFitting } from './data'
import { estimateLabel, fitSummary, fitWindows, summaryOf } from './library'
import type { LibraryActions } from './useLibraryActions'

/** Used when the day load cannot be read, so the card still does something useful. */
const FALLBACK_WINDOW = 30

export interface FitsRightNowProps {
  actions: LibraryActions
}

/**
 * PRD E6 — "what fits right now".
 *
 * The todo engine already computes the free minutes left in the day; this points that
 * number at the reading queue. That connection is the reason the library is a feature
 * rather than a folder: dead time becomes the thing the item was saved for.
 *
 * `library.fitting()` orders best fit first — the largest thing that still fits — so a
 * 40-minute gap surfaces the 35-minute paper rather than a 4-minute link.
 */
export function FitsRightNow({ actions }: FitsRightNowProps): React.JSX.Element {
  const dayLoad = useDayLoad()
  const [chosen, setChosen] = useState<number | null>(null)

  const measured = dayLoad.data ? Math.max(0, Math.round(dayLoad.data.free_minutes)) : null
  const active = chosen ?? measured ?? (dayLoad.settled ? FALLBACK_WINDOW : null)
  const windows = useMemo(() => fitWindows(measured), [measured])

  const fitting = useFitting(active)
  const items = fitting.data ?? []

  return (
    <Card
      title="What fits right now"
      meta={
        measured === null
          ? undefined
          : measured > 0
            ? `${formatMinutes(measured)} open before midnight`
            : 'the day is spoken for'
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-muted text-xs">I have</span>
          <div role="group" aria-label="How much time you have" className="flex flex-wrap gap-1.5">
            {windows.map((minutes) => {
              const current = active === minutes
              return (
                <Button
                  key={minutes}
                  size="sm"
                  shape="pill"
                  variant={current ? 'soft' : 'ghost'}
                  aria-pressed={current}
                  onClick={() => setChosen(minutes)}
                >
                  {formatMinutes(minutes)}
                  {measured === minutes && <span className="text-muted">free</span>}
                </Button>
              )
            })}
          </div>
        </div>

        {!fitting.settled && fitting.loading && <SkeletonLines lines={2} />}

        {dayLoad.error && (
          <p className="text-muted text-sm">
            Today&apos;s open time couldn&apos;t be read, so this is showing what fits{' '}
            {formatMinutes(active ?? FALLBACK_WINDOW)}. The queue itself is fine.
          </p>
        )}

        {fitting.error && (
          <p className="text-muted text-sm">
            The queue couldn&apos;t be read just now. Nothing was changed.
          </p>
        )}

        {!fitting.error && fitting.settled && items.length === 0 && (
          <EmptyState compact title={fitSummary(0, active ?? FALLBACK_WINDOW)}>
            Everything in the queue is longer than that, or still waiting on an estimate.
          </EmptyState>
        )}

        {!fitting.error && items.length > 0 && (
          <>
            <p className="text-muted text-sm">
              {fitSummary(items.length, active ?? FALLBACK_WINDOW)} Longest first, so the gap
              actually gets used.
            </p>
            <ul className="flex flex-col">
              {items.slice(0, 5).map((item) => (
                <FitRow key={item.path} item={item} actions={actions} />
              ))}
            </ul>
          </>
        )}
      </div>
    </Card>
  )
}

function FitRow({
  item,
  actions,
}: {
  item: LibraryItem
  actions: LibraryActions
}): React.JSX.Element {
  const summary = summaryOf(item.body, 120)
  const busy = actions.isBusy(item.path)

  return (
    <li className="border-rule flex flex-wrap items-baseline justify-between gap-x-5 gap-y-2 border-t py-3 first:border-t-0 first:pt-0">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="font-display truncate text-lg leading-snug">{item.title}</span>
          {item.source && <span className="text-muted truncate text-xs">{item.source}</span>}
        </div>
        {summary !== '' && <p className="text-muted truncate text-xs">{summary}</p>}
      </div>

      <div className="flex items-center gap-3">
        <span className="text-estimate text-sm whitespace-nowrap">
          {estimateLabel(item) ?? 'no estimate'}
        </span>
        {item.status !== 'reading' && (
          <Button
            size="sm"
            variant="soft"
            shape="pill"
            disabled={busy}
            onClick={() => actions.setStatus(item, 'reading')}
          >
            Start
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => actions.open(item)}>
          Open in Obsidian
        </Button>
      </div>
    </li>
  )
}
