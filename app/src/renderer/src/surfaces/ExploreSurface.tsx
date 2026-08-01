import { useMemo, useState } from 'react'
import type { LibraryItem } from '@shared/types'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { EmptyState } from '@/components/EmptyState'
import { Page } from '@/components/Page'
import { SkeletonLines } from '@/components/Skeleton'
import {
  ALL,
  DEFAULT_FILTERS,
  FitsRightNow,
  LibraryCard,
  LibraryFilters,
  LibraryRow,
  QueueCare,
  applyFilters,
  countsFor,
  facetsOf,
  hasActiveFilters,
  itemsInScope,
  statusBreakdown,
  useLibrary,
  useLibraryActions,
  useSettings,
  type LibraryFilterState as Filters,
} from '@/components/library'
import { toDateString } from '@/lib/date'
import { ROUTES } from '@/lib/routes'

type View = 'grid' | 'list'

/**
 * PRD E2 · E3 · E4 · E6 · E7 — the payoff surface for the capture loop.
 *
 * Library items are markdown notes with YAML frontmatter (E5), not rows in a table, so
 * every one of them is a node in the Obsidian graph and can be `[[linked]]` from a brain
 * dump or a synthesis. This surface reads them; Obsidian reads the same files.
 *
 * The whole library — archived included — is read once and filtered here. Set-aside items
 * are out of the queue by default and one click away, which is the shape E7 requires:
 * they left the queue, not the vault.
 */
export function ExploreSurface(): React.JSX.Element {
  const library = useLibrary()
  const settings = useSettings()
  const actions = useLibraryActions()

  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [view, setView] = useState<View>('grid')

  const items = useMemo(() => library.data ?? [], [library.data])
  const counts = useMemo(() => countsFor(items), [items])
  const facets = useMemo(() => facetsOf(itemsInScope(items, filters.scope)), [items, filters.scope])
  const visible = useMemo(() => applyFilters(items, filters), [items, filters])
  const shown = useMemo(() => statusBreakdown(visible), [visible])

  const autoArchiveDays = settings.data?.library.auto_archive_days ?? 30
  const today = toDateString()

  return (
    <Page
      title={ROUTES.explore.title}
      eyebrow={counts.total > 0 ? `${counts.total} saved` : undefined}
      description={ROUTES.explore.description}
      actions={<ViewToggle view={view} onChange={setView} />}
    >
      <FitsRightNow actions={actions} />

      <Card
        title="The library"
        // The breakdown describes what is on screen, not the queue — otherwise the
        // numbers disagree with the cards under them the moment a filter is on.
        meta={
          library.settled && !library.error && visible.length > 0
            ? `${visible.length} showing · ${shown.unread} unread, ${shown.reading} being read, ${shown.done} read`
            : undefined
        }
      >
        <div className="flex flex-col gap-6">
          <LibraryFilters
            filters={filters}
            facets={facets}
            counts={counts}
            onChange={setFilters}
          />

          {!library.settled && library.loading && <SkeletonLines lines={4} />}

          {library.error && (
            <p className="text-muted text-sm">
              The library couldn&apos;t be read just now. Nothing was changed — the notes are
              still in <code className="font-mono text-xs">Library/</code>, and Obsidian can open
              them directly.
            </p>
          )}

          {!library.error && library.settled && visible.length === 0 && (
            <LibraryEmpty
              filters={filters}
              totalSaved={counts.total}
              autoArchiveDays={autoArchiveDays}
              onClear={() =>
                setFilters({ ...filters, type: ALL, status: ALL, tag: ALL, source: ALL, text: '' })
              }
            />
          )}

          {!library.error && visible.length > 0 && (
            <LibraryItems
              items={visible}
              view={view}
              autoArchiveDays={autoArchiveDays}
              today={today}
              actions={actions}
              onPickTag={(tag) => setFilters((current) => ({ ...current, tag }))}
            />
          )}
        </div>
      </Card>

      <QueueCare
        autoArchiveDays={autoArchiveDays}
        setAsideCount={counts.setAside}
        viewingSetAside={filters.scope === 'set-aside'}
        onViewSetAside={() => setFilters((current) => ({ ...current, scope: 'set-aside' }))}
      />
    </Page>
  )
}

function ViewToggle({
  view,
  onChange,
}: {
  view: View
  onChange: (view: View) => void
}): React.JSX.Element {
  return (
    <div role="group" aria-label="Layout" className="flex items-center gap-1.5">
      {(['grid', 'list'] as const).map((option) => (
        <Button
          key={option}
          size="md"
          shape="pill"
          variant={view === option ? 'soft' : 'secondary'}
          aria-pressed={view === option}
          onClick={() => onChange(option)}
        >
          {option === 'grid' ? 'Grid' : 'List'}
        </Button>
      ))}
    </div>
  )
}

function LibraryItems({
  items,
  view,
  autoArchiveDays,
  today,
  actions,
  onPickTag,
}: {
  items: LibraryItem[]
  view: View
  autoArchiveDays: number
  today: string
  actions: ReturnType<typeof useLibraryActions>
  onPickTag: (tag: string) => void
}): React.JSX.Element {
  const shared = (item: LibraryItem) => ({
    item,
    autoArchiveDays,
    today,
    busy: actions.isBusy(item.path),
    onSetStatus: (status: LibraryItem['status']) => actions.setStatus(item, status),
    onSetArchived: (archived: boolean) => actions.setArchived(item, archived),
    onOpenInObsidian: () => actions.open(item),
    onPickTag,
  })

  if (view === 'list') {
    return (
      <ul className="flex flex-col">
        {items.map((item) => (
          <LibraryRow key={item.path} {...shared(item)} />
        ))}
      </ul>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
      {items.map((item) => (
        <LibraryCard key={item.path} {...shared(item)} />
      ))}
    </div>
  )
}

/**
 * Empty is just empty. A library with nothing in it is a library you have not sent
 * anything to yet, a filter that matches nothing is a filter, and nothing set aside means
 * the queue is recent. None of the three is a failure and none of them says so.
 */
function LibraryEmpty({
  filters,
  totalSaved,
  autoArchiveDays,
  onClear,
}: {
  filters: Filters
  totalSaved: number
  autoArchiveDays: number
  onClear: () => void
}): React.JSX.Element {
  if (hasActiveFilters(filters)) {
    return (
      <EmptyState
        compact
        title="Nothing matches those filters."
        action={
          <Button size="sm" variant="soft" onClick={onClear}>
            Clear filters
          </Button>
        }
      >
        Everything you have saved is still here — this view is just narrow.
      </EmptyState>
    )
  }

  if (filters.scope === 'set-aside') {
    return (
      <EmptyState compact title="Nothing has been set aside.">
        Unread items step out of the queue on their own after {autoArchiveDays} days. When they
        do, they show up here — still in the vault, still in search.
      </EmptyState>
    )
  }

  if (totalSaved === 0) {
    return (
      <EmptyState compact title="Nothing saved yet.">
        Send a link to the bot and it arrives here fetched, summarized, tagged and time-estimated
        — as a markdown note you can open in Obsidian.
      </EmptyState>
    )
  }

  return (
    <EmptyState compact title="The queue is clear.">
      Everything saved has been set aside. It is all still in the vault and still in search.
    </EmptyState>
  )
}
