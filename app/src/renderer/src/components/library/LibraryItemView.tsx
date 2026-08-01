import type { LibraryItem, LibraryStatus } from '@shared/types'

import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { cn } from '@/lib/cn'
import {
  LIBRARY_STATUSES,
  STATUS_LABEL,
  TYPE_LABEL,
  daysUntilSetAside,
  estimateLabel,
  summaryOf,
} from './library'

export interface LibraryItemViewProps {
  item: LibraryItem
  autoArchiveDays: number
  today: string
  busy: boolean
  onSetStatus: (status: LibraryStatus) => void
  onSetArchived: (archived: boolean) => void
  onOpenInObsidian: () => void
  onPickTag: (tag: string) => void
}

// ---------------------------------------------------------------------------
// shared pieces
// ---------------------------------------------------------------------------

/**
 * Type is a badge because it is one word and always present; status is a control rather
 * than a label because changing it is the whole of E4.
 */
function TypeBadge({ item }: { item: LibraryItem }): React.JSX.Element {
  return (
    <Badge tone="neutral" className="px-2.5 py-[3px] text-micro">
      {TYPE_LABEL[item.type]}
    </Badge>
  )
}

/**
 * The estimate is an agent's guess, and Cormorant italic is how this app says so — the
 * typography is the disclaimer. A missing estimate says so plainly; it is not a zero.
 */
function Estimate({ item }: { item: LibraryItem }): React.JSX.Element {
  const label = estimateLabel(item)
  return (
    <span className="text-estimate text-sm whitespace-nowrap">{label ?? 'no estimate yet'}</span>
  )
}

function SourceLine({ item }: { item: LibraryItem }): React.JSX.Element | null {
  if (!item.source && !item.url) return null
  return (
    <span className="text-muted min-w-0 truncate text-xs" title={item.url ?? undefined}>
      {item.source ?? item.url}
    </span>
  )
}

function Tags({
  item,
  onPickTag,
}: {
  item: LibraryItem
  onPickTag: (tag: string) => void
}): React.JSX.Element | null {
  if (item.tags.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
      {item.tags.map((tag) => (
        <button
          key={tag}
          type="button"
          onClick={() => onPickTag(tag)}
          title={`Filter by ${tag}`}
          className="text-muted hover:text-accent-text transition-quiet rounded-marker text-xs"
        >
          #{tag}
        </button>
      ))}
    </div>
  )
}

/**
 * Three states, three buttons, current one filled. A select would hide the two moves the
 * user actually wants, and this surface exists to make them one click.
 */
function StatusControl({
  item,
  busy,
  onSetStatus,
}: {
  item: LibraryItem
  busy: boolean
  onSetStatus: (status: LibraryStatus) => void
}): React.JSX.Element {
  return (
    <div role="group" aria-label={`Status — ${item.title}`} className="flex items-center gap-1">
      {LIBRARY_STATUSES.map((status) => {
        const current = item.status === status
        return (
          <Button
            key={status}
            size="sm"
            shape="pill"
            variant={current ? 'soft' : 'ghost'}
            aria-pressed={current}
            disabled={busy}
            onClick={() => !current && onSetStatus(status)}
          >
            {STATUS_LABEL[status]}
          </Button>
        )
      })}
    </div>
  )
}

/**
 * The E7 copy at item scale. Never a countdown to a deletion, because there is no
 * deletion — this says when the item will stop asking, and what stays true afterwards.
 */
function QueueNote({
  item,
  autoArchiveDays,
  today,
}: {
  item: LibraryItem
  autoArchiveDays: number
  today: string
}): React.JSX.Element | null {
  if (item.archived) {
    return (
      <p className="text-muted text-xs">
        Set aside · still in the vault, still in search
      </p>
    )
  }

  const days = daysUntilSetAside(item, autoArchiveDays, today)
  if (days === null || days > 7) return null

  return (
    <p className="text-muted text-xs">
      {days <= 0
        ? 'Ready to step out of the queue on the next tidy.'
        : `Steps out of the queue in ${days} ${days === 1 ? 'day' : 'days'}.`}
    </p>
  )
}

function ItemActions({
  item,
  busy,
  onSetArchived,
  onOpenInObsidian,
}: Pick<
  LibraryItemViewProps,
  'item' | 'busy' | 'onSetArchived' | 'onOpenInObsidian'
>): React.JSX.Element {
  return (
    <div className="flex items-center gap-1">
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={() => onSetArchived(!item.archived)}
        title={
          item.archived
            ? 'Put this back in the queue'
            : 'Step this out of the queue. It stays in the vault, the graph and search.'
        }
      >
        {item.archived ? 'Put back' : 'Set aside'}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={onOpenInObsidian}
        title={`Open ${item.path} in Obsidian`}
      >
        Open in Obsidian
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// grid
// ---------------------------------------------------------------------------

export function LibraryCard({
  item,
  autoArchiveDays,
  today,
  busy,
  onSetStatus,
  onSetArchived,
  onOpenInObsidian,
  onPickTag,
}: LibraryItemViewProps): React.JSX.Element {
  const summary = summaryOf(item.body)

  return (
    <Card
      variant="raised"
      className={cn('flex flex-col gap-3.5', item.archived && 'border-dashed')}
      aria-label={item.title}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <h3 className="font-display text-lg leading-snug font-normal">{item.title}</h3>
          <SourceLine item={item} />
        </div>
        <TypeBadge item={item} />
      </div>

      {summary !== '' ? (
        <p className="text-entry text-sm leading-relaxed">{summary}</p>
      ) : (
        <p className="text-muted text-sm">No summary was written for this one.</p>
      )}

      <Tags item={item} onPickTag={onPickTag} />

      <div className="border-rule mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t pt-3.5">
        <Estimate item={item} />
        <span className="text-muted text-xs" data-numeric>
          saved {item.saved}
        </span>
      </div>

      <StatusControl item={item} busy={busy} onSetStatus={onSetStatus} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <QueueNote item={item} autoArchiveDays={autoArchiveDays} today={today} />
        <ItemActions
          item={item}
          busy={busy}
          onSetArchived={onSetArchived}
          onOpenInObsidian={onOpenInObsidian}
        />
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

export function LibraryRow({
  item,
  autoArchiveDays,
  today,
  busy,
  onSetStatus,
  onSetArchived,
  onOpenInObsidian,
  onPickTag,
}: LibraryItemViewProps): React.JSX.Element {
  const summary = summaryOf(item.body, 160)

  return (
    <li className="border-rule flex flex-col gap-2.5 border-t py-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5">
        <div className="flex min-w-0 items-baseline gap-3">
          <h3 className="font-display truncate text-lg leading-snug font-normal">{item.title}</h3>
          <SourceLine item={item} />
        </div>
        <div className="flex items-center gap-3">
          <Estimate item={item} />
          <TypeBadge item={item} />
        </div>
      </div>

      {summary !== '' && <p className="text-entry max-w-[92ch] text-sm">{summary}</p>}

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <StatusControl item={item} busy={busy} onSetStatus={onSetStatus} />
          <Tags item={item} onPickTag={onPickTag} />
          <span className="text-muted text-xs" data-numeric>
            saved {item.saved}
          </span>
          <QueueNote item={item} autoArchiveDays={autoArchiveDays} today={today} />
        </div>
        <ItemActions
          item={item}
          busy={busy}
          onSetArchived={onSetArchived}
          onOpenInObsidian={onOpenInObsidian}
        />
      </div>
    </li>
  )
}
