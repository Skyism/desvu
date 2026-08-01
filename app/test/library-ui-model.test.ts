import { describe, expect, it } from 'vitest'
import type { LibraryItem } from '../src/shared/types'
import {
  DEFAULT_FILTERS,
  applyFilters,
  countsFor,
  daysBetween,
  daysUntilSetAside,
  estimateLabel,
  facetsOf,
  fitSummary,
  fitWindows,
  hasActiveFilters,
  itemsInScope,
  sortItems,
  summaryOf,
  truncateByCodePoint,
  type LibraryFilterState,
} from '../src/renderer/src/components/library/library'

/**
 * The Explore library's presentation rules, tested away from React.
 *
 * The load-bearing assertion in this file is that `archived` only ever *scopes* a view.
 * Nothing here may drop an item from existence, because in the product nothing is ever
 * deleted — an archived note is still in the vault, still in the Obsidian graph, and
 * still in search.
 */

function item(overrides: Partial<LibraryItem> = {}): LibraryItem {
  return {
    path: `Library/2026-07-01-${overrides.title ?? 'note'}.md`,
    title: 'A note',
    url: null,
    type: 'article',
    status: 'unread',
    source: null,
    tags: [],
    estimated_minutes: null,
    saved: '2026-07-01',
    archived: false,
    body: '',
    ...overrides,
  }
}

const filters = (patch: Partial<LibraryFilterState> = {}): LibraryFilterState => ({
  ...DEFAULT_FILTERS,
  ...patch,
})

describe('estimated read/watch time (E3)', () => {
  it('names the verb from the type', () => {
    expect(estimateLabel(item({ type: 'article', estimated_minutes: 12 }))).toBe('12m read')
    expect(estimateLabel(item({ type: 'paper', estimated_minutes: 45 }))).toBe('45m read')
    expect(estimateLabel(item({ type: 'video', estimated_minutes: 65 }))).toBe('1h 5m watch')
  })

  it('returns null rather than zero when there is no estimate', () => {
    expect(estimateLabel(item({ estimated_minutes: null }))).toBeNull()
    // Zero is a real estimate and must not be confused with "unknown".
    expect(estimateLabel(item({ estimated_minutes: 0 }))).toBe('0m read')
  })
})

describe('summaries (E3)', () => {
  it('takes the summary paragraph and stops at the notes heading', () => {
    const body = 'A one-paragraph summary written at save time.\n\n## Notes\nMy own thoughts.'
    expect(summaryOf(body)).toBe('A one-paragraph summary written at save time.')
  })

  it('joins a wrapped paragraph and unwraps wikilinks', () => {
    const body = 'Replication and\npartitioning, see [[Replication]] and [[15-440|the course]].'
    expect(summaryOf(body)).toBe('Replication and partitioning, see Replication and the course.')
  })

  it('is empty for a note with no body, and never throws', () => {
    expect(summaryOf('')).toBe('')
    expect(summaryOf('\n\n## Notes\nonly notes')).toBe('')
  })

  it('truncates by code point, so a non-BMP emoji is never split', () => {
    const text = '👩‍💻👩‍💻👩‍💻'
    const cut = truncateByCodePoint(text, 3)
    // A UTF-16 slice here would end mid-surrogate and emit U+FFFD on render.
    expect([...cut].every((point) => point.codePointAt(0) !== 0xfffd)).toBe(true)
    expect(cut.endsWith('…')).toBe(true)
    expect(truncateByCodePoint('short', 40)).toBe('short')
  })
})

describe('the auto-archive clock (E7)', () => {
  it('counts whole local days across a month boundary', () => {
    expect(daysBetween('2026-07-25', '2026-08-01')).toBe(7)
    expect(daysBetween('2026-08-01', '2026-07-25')).toBe(-7)
  })

  it('only unread, un-set-aside items are on the clock', () => {
    const today = '2026-08-01'
    expect(daysUntilSetAside(item({ saved: '2026-07-25' }), 30, today)).toBe(23)
    expect(daysUntilSetAside(item({ saved: '2026-06-25', status: 'reading' }), 30, today)).toBeNull()
    expect(daysUntilSetAside(item({ saved: '2026-06-25', status: 'done' }), 30, today)).toBeNull()
    expect(daysUntilSetAside(item({ saved: '2026-06-25', archived: true }), 30, today)).toBeNull()
  })

  it('goes negative once an item is overdue for the next tidy', () => {
    expect(daysUntilSetAside(item({ saved: '2026-06-01' }), 30, '2026-08-01')).toBeLessThan(0)
  })
})

describe('scope — archived leaves the queue, never the library (E7)', () => {
  const items = [
    item({ title: 'live', path: 'Library/a.md' }),
    item({ title: 'set aside', path: 'Library/b.md', archived: true }),
  ]

  it('hides archived items from the default queue view', () => {
    const visible = applyFilters(items, filters())
    expect(visible.map((entry) => entry.path)).toEqual(['Library/a.md'])
  })

  it('shows them under their own scope, and both under everything', () => {
    expect(applyFilters(items, filters({ scope: 'set-aside' })).map((e) => e.path)).toEqual([
      'Library/b.md',
    ])
    expect(applyFilters(items, filters({ scope: 'everything' }))).toHaveLength(2)
  })

  it('counts them as set aside without removing them from the total', () => {
    const counts = countsFor(items)
    expect(counts.total).toBe(2)
    expect(counts.queue).toBe(1)
    expect(counts.setAside).toBe(1)
  })

  it('never drops an item from every scope — nothing is unreachable', () => {
    const reachable = new Set(
      (['queue', 'set-aside', 'everything'] as const).flatMap((scope) =>
        itemsInScope(items, scope).map((entry) => entry.path)
      )
    )
    expect(reachable).toEqual(new Set(items.map((entry) => entry.path)))
  })
})

describe('filters (E2)', () => {
  const items = [
    item({
      path: 'Library/a.md',
      title: 'Designing Data-Intensive Applications',
      type: 'paper',
      status: 'reading',
      source: 'news.ycombinator.com',
      tags: ['distributed-systems', 'databases'],
      estimated_minutes: 40,
      saved: '2026-07-30',
    }),
    item({
      path: 'Library/b.md',
      title: 'A talk about compilers',
      type: 'video',
      status: 'unread',
      source: 'youtube.com',
      tags: ['compilers'],
      estimated_minutes: 62,
      saved: '2026-07-28',
    }),
    item({
      path: 'Library/c.md',
      title: 'Short blog post',
      type: 'article',
      status: 'done',
      source: 'news.ycombinator.com',
      tags: ['databases'],
      estimated_minutes: 6,
      saved: '2026-07-29',
    }),
  ]

  it('filters by type, status, tag and source', () => {
    expect(applyFilters(items, filters({ type: 'video' })).map((e) => e.path)).toEqual([
      'Library/b.md',
    ])
    expect(applyFilters(items, filters({ status: 'done' })).map((e) => e.path)).toEqual([
      'Library/c.md',
    ])
    expect(applyFilters(items, filters({ tag: 'databases' })).map((e) => e.path)).toEqual([
      'Library/a.md',
      'Library/c.md',
    ])
    expect(
      applyFilters(items, filters({ source: 'news.ycombinator.com' })).map((e) => e.path)
    ).toEqual(['Library/a.md', 'Library/c.md'])
  })

  it('combines filters, and requires every word of the text filter', () => {
    expect(
      applyFilters(items, filters({ source: 'news.ycombinator.com', type: 'article' })).map(
        (e) => e.path
      )
    ).toEqual(['Library/c.md'])
    expect(applyFilters(items, filters({ text: 'data intensive' })).map((e) => e.path)).toEqual([
      'Library/a.md',
    ])
    expect(applyFilters(items, filters({ text: 'data unrelated' }))).toHaveLength(0)
  })

  it('knows when a filter is actually narrowing something', () => {
    expect(hasActiveFilters(filters())).toBe(false)
    expect(hasActiveFilters(filters({ scope: 'set-aside' }))).toBe(false) // a view, not a filter
    expect(hasActiveFilters(filters({ tag: 'databases' }))).toBe(true)
    expect(hasActiveFilters(filters({ text: '  ' }))).toBe(false)
  })

  it('offers only facets that exist, ordered by frequency', () => {
    const facets = facetsOf(items)
    expect(facets.types.map((facet) => facet.value)).toEqual(['article', 'video', 'paper'])
    expect(facets.tags[0]).toEqual({ value: 'databases', count: 2 })
    expect(facets.sources.map((facet) => facet.value)).toEqual([
      'news.ycombinator.com',
      'youtube.com',
    ])
  })

  it('sorts, and keeps un-estimated items last in both directions', () => {
    const withUnknown = [...items, item({ path: 'Library/d.md', estimated_minutes: null })]
    expect(sortItems(withUnknown, 'shortest').map((e) => e.estimated_minutes)).toEqual([
      6, 40, 62, null,
    ])
    expect(sortItems(withUnknown, 'longest').map((e) => e.estimated_minutes)).toEqual([
      62, 40, 6, null,
    ])
    expect(sortItems(items, 'newest').map((e) => e.saved)).toEqual([
      '2026-07-30',
      '2026-07-29',
      '2026-07-28',
    ])
    expect(sortItems(items, 'oldest')[0]?.saved).toBe('2026-07-28')
  })
})

describe('what fits right now (E6)', () => {
  it('leads with the measured free minutes and keeps the fixed windows', () => {
    expect(fitWindows(37)).toContain(37)
    expect(fitWindows(37)).toEqual([...fitWindows(37)].sort((a, b) => a - b))
    expect(fitWindows(null)).toEqual([10, 20, 30, 45, 60, 90])
    // A measured window that coincides with a fixed one is not offered twice.
    expect(fitWindows(30).filter((minutes) => minutes === 30)).toHaveLength(1)
  })

  it('states the count as a fact, never as a shortfall', () => {
    expect(fitSummary(0, 40)).toBe('Nothing in the queue fits 40m.')
    expect(fitSummary(1, 40)).toBe('One thing fits 40m.')
    expect(fitSummary(4, 90)).toBe('4 things fit 1h 30m.')
  })
})
