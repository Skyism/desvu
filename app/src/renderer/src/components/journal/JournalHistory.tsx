import { useMemo, useState } from 'react'
import type { DateString, JournalEntry } from '@shared/types'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { EmptyState } from '@/components/EmptyState'
import { Input } from '@/components/Input'
import { SkeletonLines } from '@/components/Skeleton'
import { cn } from '@/lib/cn'
import {
  daysWrittenLabel,
  entryPreview,
  filterEntries,
  formatDayFull,
  sortByDateDescending,
} from './journal-model'

const PAGE = 24

export interface JournalHistoryProps {
  entries: readonly JournalEntry[] | null
  loading: boolean
  settled: boolean
  error: Error | null
  selected: DateString
  onSelect: (date: DateString) => void
  /** One accurate line about where the prose lives. */
  privacyNote?: string
}

/**
 * Everything written, newest first, searchable.
 *
 * Ordered and searched on `entry_date` — the day the entry is *about*. Sorting on
 * `created_at` would shuffle ~60% of the real corpus out of order, because days get
 * written up late (by up to six days) and 16 entries were edited after the fact.
 *
 * A row opens its day in the reflection card, which is the whole editing affordance: there
 * is no separate edit mode, because editing is not a separate activity here.
 *
 * The count is always a count of what exists. Never "39% of days", never "you have not
 * written since…" — the denominator is real and is deliberately never rendered.
 */
export function JournalHistory({
  entries,
  loading,
  settled,
  error,
  selected,
  onSelect,
  privacyNote,
}: JournalHistoryProps): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [visible, setVisible] = useState(PAGE)

  const all = useMemo(() => sortByDateDescending(entries ?? []), [entries])
  const matches = useMemo(() => filterEntries(all, query), [all, query])
  const shown = matches.slice(0, visible)
  const searching = query.trim() !== ''

  /**
   * A count only when there is something to count. On a blank vault this used to render
   * "0 days written", which is a zero on the highest-stakes screen in the product — and
   * J6 does not care that the zero came from the history card rather than the streak.
   * The empty state below already says everything true about that case.
   */
  const count = searching ? matches.length : all.length
  const meta =
    !entries || count === 0
      ? undefined
      : searching
        ? `${count} match${count === 1 ? '' : 'es'}`
        : daysWrittenLabel(count)

  return (
    <Card title="Everything you've written" meta={meta} className="min-w-0">
      <Input
        type="search"
        value={query}
        placeholder="Search your entries"
        aria-label="Search your entries"
        onChange={(event) => {
          setQuery(event.target.value)
          setVisible(PAGE)
        }}
        className="mb-4"
      />

      {!settled && loading && <SkeletonLines lines={5} />}

      {error && (
        <p className="text-muted text-sm">
          The journal can&apos;t be read just now. Nothing is lost — everything is still in
          the vault.
        </p>
      )}

      {!error && settled && all.length === 0 && (
        <EmptyState compact title="Nothing written yet.">
          Pick a number and you have written today. The rest is optional, always.
        </EmptyState>
      )}

      {!error && settled && all.length > 0 && matches.length === 0 && (
        <EmptyState compact title="Nothing matches that.">
          Try a word you might have used, or a month — &ldquo;july&rdquo;.
        </EmptyState>
      )}

      {!error && shown.length > 0 && (
        <ul className="flex flex-col">
          {shown.map((entry) => (
            <HistoryRow
              key={entry.id}
              entry={entry}
              selected={entry.entry_date === selected}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}

      {matches.length > shown.length && (
        <div className="mt-4">
          <Button size="sm" variant="ghost" onClick={() => setVisible((n) => n + PAGE)}>
            Show more
          </Button>
        </div>
      )}

      {privacyNote && (
        <p className="text-muted border-line mt-5 border-t pt-4 text-xs">{privacyNote}</p>
      )}
    </Card>
  )
}

function HistoryRow({
  entry,
  selected,
  onSelect,
}: {
  entry: JournalEntry
  selected: boolean
  onSelect: (date: DateString) => void
}): React.JSX.Element {
  const preview = entryPreview(entry)

  return (
    <li className="border-rule border-b last:border-b-0">
      <button
        type="button"
        onClick={() => onSelect(entry.entry_date)}
        aria-current={selected ? 'true' : undefined}
        className={cn(
          'transition-quiet rounded-field -mx-2 flex w-[calc(100%+1rem)] items-baseline gap-3.5 px-2 py-3 text-left',
          'hover:bg-hover',
          selected && 'bg-soft'
        )}
      >
        {/* The rating is a number, so it is DM Sans and tabular. */}
        <span
          data-numeric
          aria-hidden
          className={cn(
            'rounded-cell mt-0.5 flex h-6 w-6 flex-none items-center justify-center text-xs',
            'bg-accent-border text-ink'
          )}
        >
          {entry.rating}
        </span>

        <span className="flex min-w-0 flex-col gap-1">
          <span className="text-ink2 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 text-xs">
            <span>{formatDayFull(entry.entry_date)}</span>
            <span className="sr-only">rated {entry.rating} of 7</span>
            {entry.mood_word?.trim() && (
              <span className="text-accent-text font-display text-sm italic">
                {entry.mood_word.trim()}
              </span>
            )}
          </span>
          {preview && <span className="text-entry font-display text-md">{preview}</span>}
        </span>
      </button>
    </li>
  )
}
