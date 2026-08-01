import type { DateString, LibraryItem, LibraryStatus, LibraryType } from '@shared/types'

import { formatMinutes } from '@/lib/date'

/**
 * The library's pure logic — filtering, facets, summaries, time estimates and the
 * auto-archive arithmetic. No React and no `bridge()` in this file, which is what lets
 * `test/library-ui-*.test.ts` exercise it under the node test environment.
 *
 * One rule runs through all of it: **archived is not deleted**. `archived` means the item
 * has stepped out of the queue. The note is still in the vault, still a node in the
 * Obsidian graph, and still reachable from search. Nothing here removes anything, and no
 * label in this file may read as loss.
 */

export const LIBRARY_TYPES: readonly LibraryType[] = ['article', 'video', 'paper', 'other']
export const LIBRARY_STATUSES: readonly LibraryStatus[] = ['unread', 'reading', 'done']

export const TYPE_LABEL: Record<LibraryType, string> = {
  article: 'Article',
  video: 'Video',
  paper: 'Paper',
  other: 'Other',
}

export const STATUS_LABEL: Record<LibraryStatus, string> = {
  unread: 'Unread',
  reading: 'Reading',
  done: 'Done',
}

/** Videos are watched, everything else is read. Used in "12m read" / "48m watch". */
export function readingVerb(type: LibraryType): 'read' | 'watch' {
  return type === 'video' ? 'watch' : 'read'
}

/**
 * `12m read`, `1h 5m watch`, or null when the item carries no estimate. Null is a real
 * state — the sort skill may not have been able to size it — and it renders as
 * "no estimate", never as a zero.
 */
export function estimateLabel(item: Pick<LibraryItem, 'type' | 'estimated_minutes'>): string | null {
  if (item.estimated_minutes === null || item.estimated_minutes < 0) return null
  return `${formatMinutes(item.estimated_minutes)} ${readingVerb(item.type)}`
}

// ---------------------------------------------------------------------------
// summaries
// ---------------------------------------------------------------------------

/**
 * Slice by code point, never by UTF-16 index. Three journal entries in the real corpus
 * carry non-BMP emoji and a naive `slice` emits a lone surrogate; library bodies are
 * written by the same hand and get the same treatment.
 */
export function truncateByCodePoint(text: string, max: number): string {
  const points = [...text]
  if (points.length <= max) return text
  return `${points.slice(0, max).join('').trimEnd()}…`
}

/** `[[Replication]]` → `Replication`, `[[15-440|Distributed systems]]` → `Distributed systems`. */
function unwrapWikilinks(text: string): string {
  return text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target: string, alias?: string) =>
    (alias ?? target).trim()
  )
}

/**
 * The summary the sort skill wrote at save time: the first paragraph of the body, before
 * any `## Notes` the user added afterwards. Their own notes are theirs — they do not get
 * promoted into the card.
 */
export function summaryOf(body: string, max = 220): string {
  const lines = body.split(/\r?\n/)
  const collected: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('#')) break
    if (trimmed === '') {
      if (collected.length > 0) break
      continue
    }
    collected.push(trimmed.replace(/^>\s?/, ''))
  }

  const flat = unwrapWikilinks(collected.join(' ')).replace(/\s+/g, ' ').trim()
  return truncateByCodePoint(flat, max)
}

// ---------------------------------------------------------------------------
// dates
// ---------------------------------------------------------------------------

/** Parse `YYYY-MM-DD` as local midnight. Never `new Date(string)`, which reads it as UTC. */
function parseDay(date: DateString): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) return null
  const [, year, month, day] = match
  return new Date(Number(year), Number(month) - 1, Number(day))
}

/** Whole days from `from` to `to`. Negative when `to` precedes `from`. */
export function daysBetween(from: DateString, to: DateString): number {
  const a = parseDay(from)
  const b = parseDay(to)
  if (!a || !b) return 0
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

/**
 * How long until this item steps out of the queue on its own, or null when it never
 * will — anything read, being read, or already set aside is not on the clock.
 *
 * A negative result means it is already due and the next tidy will catch it; callers
 * clamp at zero rather than rendering a countdown that has gone past.
 */
export function daysUntilSetAside(
  item: Pick<LibraryItem, 'status' | 'saved' | 'archived'>,
  autoArchiveDays: number,
  today: DateString
): number | null {
  if (item.archived || item.status !== 'unread') return null
  return autoArchiveDays - daysBetween(item.saved, today)
}

// ---------------------------------------------------------------------------
// filtering
// ---------------------------------------------------------------------------

/**
 * `queue` is the default view and the only one that hides anything: set-aside items are
 * out of the queue, which is the whole point of E7. They remain one click away here, and
 * they are never filtered out of search.
 */
export type LibraryScope = 'queue' | 'set-aside' | 'everything'

export const ALL = 'all' as const
export type All = typeof ALL

export interface LibraryFilterState {
  scope: LibraryScope
  type: LibraryType | All
  status: LibraryStatus | All
  tag: string | All
  source: string | All
  /** A text filter over the items already on screen. Global recall is ⌘K. */
  text: string
  sort: LibrarySort
}

export type LibrarySort = 'newest' | 'oldest' | 'shortest' | 'longest' | 'title'

export const DEFAULT_FILTERS: LibraryFilterState = {
  scope: 'queue',
  type: ALL,
  status: ALL,
  tag: ALL,
  source: ALL,
  text: '',
  sort: 'newest',
}

export const SORT_LABEL: Record<LibrarySort, string> = {
  newest: 'Newest saved',
  oldest: 'Oldest saved',
  shortest: 'Shortest first',
  longest: 'Longest first',
  title: 'Title',
}

function matchesScope(item: LibraryItem, scope: LibraryScope): boolean {
  if (scope === 'queue') return !item.archived
  if (scope === 'set-aside') return item.archived
  return true
}

/** Scope alone, for deriving the facet lists the filters offer. */
export function itemsInScope(items: readonly LibraryItem[], scope: LibraryScope): LibraryItem[] {
  return items.filter((item) => matchesScope(item, scope))
}

function matchesText(item: LibraryItem, text: string): boolean {
  const needle = text.trim().toLowerCase()
  if (needle === '') return true
  const haystack = [item.title, item.body, item.tags.join(' '), item.source ?? '', item.url ?? '']
    .join(' ')
    .toLowerCase()
  return needle
    .split(/\s+/)
    .filter((term) => term !== '')
    .every((term) => haystack.includes(term))
}

/** Items with no estimate sort last in both directions — unknown is not zero. */
function byEstimate(a: LibraryItem, b: LibraryItem, direction: 1 | -1): number {
  const left = a.estimated_minutes
  const right = b.estimated_minutes
  if (left === null && right === null) return 0
  if (left === null) return 1
  if (right === null) return -1
  return (left - right) * direction
}

export function sortItems(items: readonly LibraryItem[], sort: LibrarySort): LibraryItem[] {
  const out = [...items]
  switch (sort) {
    case 'newest':
      return out.sort((a, b) => b.saved.localeCompare(a.saved) || a.title.localeCompare(b.title))
    case 'oldest':
      return out.sort((a, b) => a.saved.localeCompare(b.saved) || a.title.localeCompare(b.title))
    case 'shortest':
      return out.sort((a, b) => byEstimate(a, b, 1) || b.saved.localeCompare(a.saved))
    case 'longest':
      return out.sort((a, b) => byEstimate(a, b, -1) || b.saved.localeCompare(a.saved))
    case 'title':
      return out.sort((a, b) => a.title.localeCompare(b.title))
  }
}

export function applyFilters(items: readonly LibraryItem[], filters: LibraryFilterState): LibraryItem[] {
  const kept = items.filter(
    (item) =>
      matchesScope(item, filters.scope) &&
      (filters.type === ALL || item.type === filters.type) &&
      (filters.status === ALL || item.status === filters.status) &&
      (filters.tag === ALL || item.tags.includes(filters.tag)) &&
      (filters.source === ALL || (item.source ?? '') === filters.source) &&
      matchesText(item, filters.text)
  )
  return sortItems(kept, filters.sort)
}

export function hasActiveFilters(filters: LibraryFilterState): boolean {
  return (
    filters.type !== ALL ||
    filters.status !== ALL ||
    filters.tag !== ALL ||
    filters.source !== ALL ||
    filters.text.trim() !== ''
  )
}

// ---------------------------------------------------------------------------
// facets
// ---------------------------------------------------------------------------

export interface Facet<T extends string> {
  value: T
  count: number
}

export interface LibraryFacets {
  types: Facet<LibraryType>[]
  statuses: Facet<LibraryStatus>[]
  tags: Facet<string>[]
  sources: Facet<string>[]
}

function tally<T extends string>(values: readonly T[]): Map<T, number> {
  const counts = new Map<T, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return counts
}

/**
 * The filter options, derived from the items in scope so the dropdowns never offer a
 * choice that leads to nothing. Tags and sources are ordered by frequency then name.
 */
export function facetsOf(items: readonly LibraryItem[]): LibraryFacets {
  const typeCounts = tally(items.map((item) => item.type))
  const statusCounts = tally(items.map((item) => item.status))
  const tagCounts = tally(items.flatMap((item) => item.tags))
  const sourceCounts = tally(
    items.map((item) => item.source).filter((source): source is string => !!source)
  )

  const byCountThenName = <T extends string>(a: Facet<T>, b: Facet<T>): number =>
    b.count - a.count || a.value.localeCompare(b.value)

  return {
    types: LIBRARY_TYPES.filter((type) => typeCounts.has(type)).map((type) => ({
      value: type,
      count: typeCounts.get(type) ?? 0,
    })),
    statuses: LIBRARY_STATUSES.filter((status) => statusCounts.has(status)).map((status) => ({
      value: status,
      count: statusCounts.get(status) ?? 0,
    })),
    tags: [...tagCounts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort(byCountThenName),
    sources: [...sourceCounts.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort(byCountThenName),
  }
}

/**
 * Counts for the page header. `setAside` is stated as a fact, never as a backlog — it is
 * the number of things that stopped asking, which is the feature working.
 */
export interface LibraryCounts {
  total: number
  queue: number
  unread: number
  reading: number
  done: number
  setAside: number
}

/**
 * Status counts over exactly the items handed in — used for the card meta, which must
 * describe what is on screen rather than some other set the reader cannot see.
 */
export function statusBreakdown(
  items: readonly LibraryItem[]
): Record<LibraryStatus, number> {
  return {
    unread: items.filter((item) => item.status === 'unread').length,
    reading: items.filter((item) => item.status === 'reading').length,
    done: items.filter((item) => item.status === 'done').length,
  }
}

export function countsFor(items: readonly LibraryItem[]): LibraryCounts {
  const queue = items.filter((item) => !item.archived)
  return {
    total: items.length,
    queue: queue.length,
    unread: queue.filter((item) => item.status === 'unread').length,
    reading: queue.filter((item) => item.status === 'reading').length,
    done: queue.filter((item) => item.status === 'done').length,
    setAside: items.filter((item) => item.archived).length,
  }
}

// ---------------------------------------------------------------------------
// "what fits right now" (PRD E6)
// ---------------------------------------------------------------------------

/**
 * The windows offered beside the free minutes the Today view computed. The measured
 * number leads; the fixed ones are there for "I actually only have ten minutes".
 */
export function fitWindows(freeMinutes: number | null): number[] {
  const fixed = [10, 20, 30, 45, 60, 90]
  const measured = freeMinutes === null ? [] : [Math.max(0, Math.round(freeMinutes))]
  return [...new Set([...measured, ...fixed])].sort((a, b) => a - b)
}

/**
 * `library.fitting()` already does the selection and the ordering (best fit first). This
 * is only the honest line above it.
 */
export function fitSummary(count: number, windowMinutes: number): string {
  const window = formatMinutes(windowMinutes)
  if (count === 0) return `Nothing in the queue fits ${window}.`
  if (count === 1) return `One thing fits ${window}.`
  return `${count} things fit ${window}.`
}
