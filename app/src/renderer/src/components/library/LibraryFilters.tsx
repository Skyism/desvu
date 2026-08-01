import type { LibraryStatus, LibraryType } from '@shared/types'

import { Button } from '@/components/Button'
import { Input, Select } from '@/components/Input'
import {
  ALL,
  LIBRARY_STATUSES,
  SORT_LABEL,
  STATUS_LABEL,
  TYPE_LABEL,
  hasActiveFilters,
  type LibraryCounts,
  type LibraryFacets,
  type LibraryFilterState as Filters,
  type LibraryScope,
  type LibrarySort,
} from './library'

export interface LibraryFiltersProps {
  filters: Filters
  facets: LibraryFacets
  counts: LibraryCounts
  onChange: (next: Filters) => void
}

const SCOPES: { value: LibraryScope; label: string }[] = [
  { value: 'queue', label: 'In the queue' },
  { value: 'set-aside', label: 'Set aside' },
  { value: 'everything', label: 'Everything' },
]

const SORTS: LibrarySort[] = ['newest', 'oldest', 'shortest', 'longest', 'title']

/**
 * PRD E2 — type, status, tag and source. The dropdowns are built from the items actually
 * present, so no filter here can lead to an empty list you did not ask for.
 *
 * The scope switch is the one that matters: "Set aside" is not a trash can and is not
 * styled as one. It is a normal view of notes that are still in the vault.
 */
export function LibraryFilters({
  filters,
  facets,
  counts,
  onChange,
}: LibraryFiltersProps): React.JSX.Element {
  const set = <K extends keyof Filters>(key: K, value: Filters[K]): void =>
    onChange({ ...filters, [key]: value })

  const scopeCount = (scope: LibraryScope): number =>
    scope === 'queue' ? counts.queue : scope === 'set-aside' ? counts.setAside : counts.total

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Which items to show" className="flex flex-wrap items-center gap-1.5">
        {SCOPES.map((scope) => {
          const current = filters.scope === scope.value
          return (
            <Button
              key={scope.value}
              size="sm"
              shape="pill"
              variant={current ? 'soft' : 'ghost'}
              aria-pressed={current}
              onClick={() => set('scope', scope.value)}
            >
              {scope.label}
              <span className="text-muted" data-numeric>
                {scopeCount(scope.value)}
              </span>
            </Button>
          )
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Select
          label="Type"
          value={filters.type}
          onChange={(event) => set('type', event.target.value as LibraryType | typeof ALL)}
        >
          <option value={ALL}>Any type</option>
          {facets.types.map((facet) => (
            <option key={facet.value} value={facet.value}>
              {TYPE_LABEL[facet.value]} ({facet.count})
            </option>
          ))}
        </Select>

        <Select
          label="Status"
          value={filters.status}
          onChange={(event) => set('status', event.target.value as LibraryStatus | typeof ALL)}
        >
          <option value={ALL}>Any status</option>
          {LIBRARY_STATUSES.map((status) => {
            const facet = facets.statuses.find((entry) => entry.value === status)
            return (
              <option key={status} value={status}>
                {STATUS_LABEL[status]} ({facet?.count ?? 0})
              </option>
            )
          })}
        </Select>

        <Select label="Tag" value={filters.tag} onChange={(event) => set('tag', event.target.value)}>
          <option value={ALL}>Any tag</option>
          {facets.tags.map((facet) => (
            <option key={facet.value} value={facet.value}>
              {facet.value} ({facet.count})
            </option>
          ))}
        </Select>

        <Select
          label="Source"
          value={filters.source}
          onChange={(event) => set('source', event.target.value)}
        >
          <option value={ALL}>Any source</option>
          {facets.sources.map((facet) => (
            <option key={facet.value} value={facet.value}>
              {facet.value} ({facet.count})
            </option>
          ))}
        </Select>

        <Select
          label="Sort"
          value={filters.sort}
          onChange={(event) => set('sort', event.target.value as LibrarySort)}
        >
          {SORTS.map((sort) => (
            <option key={sort} value={sort}>
              {SORT_LABEL[sort]}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <Input
          label="Find in the library"
          placeholder="Title, summary, tag or source"
          value={filters.text}
          className="min-w-[260px] flex-1"
          hint="Searching everything — journal, todos, meals — is ⌘K."
          onChange={(event) => set('text', event.target.value)}
        />
        {hasActiveFilters(filters) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              onChange({ ...filters, type: ALL, status: ALL, tag: ALL, source: ALL, text: '' })
            }
          >
            Clear filters
          </Button>
        )}
      </div>
    </div>
  )
}
