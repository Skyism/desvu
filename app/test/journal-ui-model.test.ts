import { describe, expect, it } from 'vitest'
import type { JournalEntry } from '@shared/types'

import {
  PROMPTS,
  buildMonthGrid,
  daysWrittenLabel,
  draftFromEntry,
  draftProseChanged,
  draftToInput,
  emptyDraft,
  entryPreview,
  filterEntries,
  formatDayFull,
  gridCellLabel,
  hasProse,
  indexByDate,
  shiftDate,
  sortByDateDescending,
  truncateByCodePoint,
} from '@/components/journal/journal-model'

/**
 * The journal surface's logic, tested against the shapes the real corpus actually has.
 * Every case in here corresponds to something measured in the 83 migrated entries.
 */

function entry(partial: Partial<JournalEntry> & Pick<JournalEntry, 'entry_date' | 'rating'>): JournalEntry {
  const created = partial.created_at ?? Date.parse(`${partial.entry_date}T21:00:00`)
  return {
    id: partial.id ?? `id-${partial.entry_date}`,
    entry_date: partial.entry_date,
    rating: partial.rating,
    created_at: created,
    updated_at: partial.updated_at ?? created,
    ...(partial.gratitude_text !== undefined && { gratitude_text: partial.gratitude_text }),
    ...(partial.learned !== undefined && { learned: partial.learned }),
    ...(partial.mood_word !== undefined && { mood_word: partial.mood_word }),
    ...(partial.mood_context !== undefined && { mood_context: partial.mood_context }),
  }
}

/** A lone surrogate: a high half with no low half after it, or a low half with none before. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/

// ---------------------------------------------------------------------------
// non-BMP truncation — three real entries end in 💀 (U+1F480)
// ---------------------------------------------------------------------------

describe('truncateByCodePoint', () => {
  // Verbatim from data/journal.json, 2026-02-09.
  const real = 'crashout day, reflexion prep, holy akpsi bro 💀'

  it('never emits a lone surrogate, at any cut point', () => {
    for (let max = 1; max <= [...real].length + 2; max += 1) {
      const cut = truncateByCodePoint(real, max)
      expect(LONE_SURROGATE.test(cut), `max=${max} produced ${JSON.stringify(cut)}`).toBe(false)
    }
  })

  it('has teeth — the naive UTF-16 slice this replaces does emit one', () => {
    // 46 code points, 47 UTF-16 units. The 💀 occupies units 45 and 46, so a `.slice()`
    // that stops at 46 keeps the high half and drops the low one.
    expect([...real]).toHaveLength(46)
    expect(real).toHaveLength(47)

    const naive = real.slice(0, 46)
    expect(LONE_SURROGATE.test(naive)).toBe(true)

    // No max produces one here — the loop above proves it for every cut point.
    expect(LONE_SURROGATE.test(truncateByCodePoint(real, 46))).toBe(false)
    expect(LONE_SURROGATE.test(truncateByCodePoint(real, 45))).toBe(false)
    expect(truncateByCodePoint(real, 45)).toBe('crashout day, reflexion prep, holy akpsi bro…')
  })

  it('counts the emoji as one character, not two', () => {
    const emoji = 'a💀b'
    expect(emoji.length).toBe(4) // UTF-16 units
    expect([...emoji].length).toBe(3) // code points
    expect(truncateByCodePoint(emoji, 3)).toBe('a💀b') // fits, returned whole
    expect(truncateByCodePoint(emoji, 2)).toBe('a💀…')
  })

  it('keeps a short string exactly as it is, with no ellipsis', () => {
    expect(truncateByCodePoint('short', 40)).toBe('short')
    expect(truncateByCodePoint('', 40)).toBe('')
  })

  it('never returns more code points than asked for, plus the ellipsis', () => {
    const cut = truncateByCodePoint('💀'.repeat(30), 8)
    expect([...cut].length).toBe(9)
    expect(LONE_SURROGATE.test(cut)).toBe(false)
  })

  it('does not leave a dangling space before the ellipsis', () => {
    expect(truncateByCodePoint('one two three', 4)).toBe('one…')
  })
})

describe('entryPreview', () => {
  it('falls back through the prompts in the order they are asked', () => {
    expect(entryPreview(entry({ entry_date: '2026-03-01', rating: 4, learned: 'that I stall' }))).toBe(
      'that I stall'
    )
    expect(
      entryPreview(entry({ entry_date: '2026-03-01', rating: 4, mood_word: 'flat' }))
    ).toBe('flat')
  })

  it('previews nothing at all for a rating-only day', () => {
    expect(entryPreview(entry({ entry_date: '2026-03-01', rating: 4 }))).toBe('')
  })

  it('collapses newlines so a row stays one line', () => {
    const text = 'first line\n\n  second line'
    expect(entryPreview(entry({ entry_date: '2026-03-01', rating: 4, gratitude_text: text }))).toBe(
      'first line second line'
    )
  })

  it('truncates by code point, so a preview ending in an emoji is intact', () => {
    const preview = entryPreview(
      entry({
        entry_date: '2026-01-23',
        rating: 3,
        gratitude_text: 'highkey worst c# audition ever bro 💀, but a fun game night at kt',
      }),
      36
    )
    expect(LONE_SURROGATE.test(preview)).toBe(false)
    expect(preview).toContain('💀')
  })
})

describe('hasProse', () => {
  it('is false for a bare rating and true once anything is written', () => {
    expect(hasProse(entry({ entry_date: '2026-03-01', rating: 5 }))).toBe(false)
    expect(hasProse(entry({ entry_date: '2026-03-01', rating: 5, mood_word: 'ok' }))).toBe(true)
    // An empty string on disk is not writing.
    expect(hasProse(entry({ entry_date: '2026-03-01', rating: 5, gratitude_text: '  ' }))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// entry_date, never created_at
// ---------------------------------------------------------------------------

describe('the grid keys on entry_date', () => {
  const today = '2026-08-01'

  it('places a retroactively written day on the day it is about', () => {
    // The real pattern: on 50 of 83 entries created_at post-dates entry_date, by up to 6
    // days. Keyed on created_at this cell would land on the 7th and the 1st would look empty.
    const late = entry({
      entry_date: '2026-07-20',
      rating: 6,
      created_at: Date.parse('2026-07-26T23:10:00'),
      updated_at: Date.parse('2026-07-26T23:10:00'),
    })
    const grid = buildMonthGrid([late], today)
    const byDate = new Map(grid.map((day) => [day.date, day]))

    expect(byDate.get('2026-07-20')?.entry).toBe(late)
    expect(byDate.get('2026-07-26')?.entry).toBeNull()
  })

  it('is thirty days, oldest first, ending today', () => {
    const grid = buildMonthGrid([], today)
    expect(grid).toHaveLength(30)
    expect(grid[0]?.date).toBe('2026-07-03')
    expect(grid.at(-1)?.date).toBe(today)
    expect(grid.filter((day) => day.isToday)).toHaveLength(1)
    expect(grid.at(-1)?.isToday).toBe(true)
  })

  it('ignores entries outside the window without complaint', () => {
    const grid = buildMonthGrid([entry({ entry_date: '2025-12-31', rating: 5 })], today)
    expect(grid.every((day) => day.entry === null)).toBe(true)
  })

  it('crosses a month boundary correctly', () => {
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28')
    expect(shiftDate('2026-01-01', -1)).toBe('2025-12-31')
    expect(shiftDate('2024-03-01', -1)).toBe('2024-02-29') // leap year
  })

  it('prefers the most recently updated when a hand-edited file has two entries for a day', () => {
    const older = entry({ entry_date: '2026-07-20', rating: 2, id: 'a', updated_at: 1 })
    const newer = entry({ entry_date: '2026-07-20', rating: 6, id: 'b', updated_at: 2 })
    expect(indexByDate([older, newer]).get('2026-07-20')?.id).toBe('b')
    expect(indexByDate([newer, older]).get('2026-07-20')?.id).toBe('b')
  })
})

// ---------------------------------------------------------------------------
// PRD J6 — the shape of a day, and what can be said about an empty one
// ---------------------------------------------------------------------------

describe('J6 — a day is an entry or nothing, and nothing is neutral', () => {
  it('GridDay carries no field a UI could render as failure', () => {
    const day = buildMonthGrid([], '2026-08-01')[0]
    expect(Object.keys(day ?? {}).sort()).toEqual(['date', 'entry', 'isToday'])
  })

  it('labels an empty day as empty, and never as a failure', () => {
    const grid = buildMonthGrid([entry({ entry_date: '2026-08-01', rating: 5 })], '2026-08-01')
    const labels = grid.map(gridCellLabel)

    expect(labels.at(-1)).toBe('Today, Saturday 1 August — rated 5 of 7')
    expect(labels[0]).toBe('Friday 3 July — empty')

    for (const label of labels) {
      expect(label.toLowerCase()).not.toMatch(
        /miss|skip|broke|lost|fail|behind|streak|since|gap|should|forgot/
      )
    }
  })

  it('never reports how long the gap was', () => {
    // The last entry is 24 days back — the real maximum gap. 24 empty cells trail it and
    // nothing in the model counts them.
    const grid = buildMonthGrid([entry({ entry_date: '2026-07-08', rating: 4 })], '2026-08-01')
    expect(grid.filter((day) => day.entry !== null)).toHaveLength(1)
    expect(grid.filter((day) => day.entry === null)).toHaveLength(29)
    const serialized = JSON.stringify(grid)
    expect(serialized).not.toMatch(/missed|broken|gap|daysSince|streak/i)
  })

  it('counts what was written and never what was not', () => {
    expect(daysWrittenLabel(83)).toBe('83 days written')
    expect(daysWrittenLabel(1)).toBe('1 day written')
    expect(daysWrittenLabel(0)).toBe('')
    // The denominator (211 days spanned, 39.3%) exists and is never formatted.
    expect(daysWrittenLabel(83)).not.toContain('%')
    expect(daysWrittenLabel(83)).not.toContain('211')
  })
})

// ---------------------------------------------------------------------------
// PRD J0 — a rating alone is a complete entry
// ---------------------------------------------------------------------------

describe('J0 — the draft', () => {
  it('sends a bare rating as a bare rating, with no empty prose fields', () => {
    const draft = { ...emptyDraft('2026-08-01'), rating: 5 as const }
    const input = draftToInput(draft, null)
    expect(input).toEqual({ entry_date: '2026-08-01', rating: 5 })
    expect(Object.keys(input ?? {})).toHaveLength(2)
  })

  it('will not write without a rating — the one required field', () => {
    const draft = { ...emptyDraft('2026-08-01'), gratitude_text: 'typed but unrated' }
    expect(draftToInput(draft, null)).toBeNull()
  })

  it('trims prose and drops fields that are only whitespace', () => {
    const draft = {
      ...emptyDraft('2026-08-01'),
      rating: 4 as const,
      gratitude_text: '  a quiet walk  ',
      learned: '   ',
    }
    expect(draftToInput(draft, null)).toEqual({
      entry_date: '2026-08-01',
      rating: 4,
      gratitude_text: 'a quiet walk',
    })
  })

  it('carries all four prompts through in the order PRD J3 specifies', () => {
    expect(PROMPTS.map((prompt) => prompt.field)).toEqual([
      'gratitude_text',
      'learned',
      'mood_word',
      'mood_context',
    ])
    expect(PROMPTS[0]?.question).toBe("Something you're grateful for")
    expect(PROMPTS[1]?.question).toBe('What did I learn about myself or the world today')
    expect(PROMPTS[2]?.question).toBe('One word for your mood')
    expect(PROMPTS[3]?.question).toBe('Something that happened that made you feel that way')
  })
})

// ---------------------------------------------------------------------------
// editing an existing day is a normal path — 16 of 83 entries were revised
// ---------------------------------------------------------------------------

describe('editing an existing day', () => {
  const existing = entry({
    entry_date: '2026-05-04',
    rating: 4,
    gratitude_text: 'sun on the walk home',
    mood_word: 'steady',
  })

  it('opens the day already filled in', () => {
    const draft = draftFromEntry('2026-05-04', existing)
    expect(draft.rating).toBe(4)
    expect(draft.gratitude_text).toBe('sun on the walk home')
    expect(draft.mood_word).toBe('steady')
    expect(draft.learned).toBe('')
  })

  it('reopening and changing only the rating leaves the prose alone', () => {
    const draft = { ...draftFromEntry('2026-05-04', existing), rating: 6 as const }
    expect(draftToInput(draft, existing)).toEqual({
      entry_date: '2026-05-04',
      rating: 6,
      gratitude_text: 'sun on the walk home',
      mood_word: 'steady',
    })
  })

  it('clearing a field that had text sends an explicit empty string', () => {
    const draft = { ...draftFromEntry('2026-05-04', existing), mood_word: '' }
    expect(draftToInput(draft, existing)).toMatchObject({ mood_word: '' })
  })

  it('knows whether there is anything unsaved', () => {
    const clean = draftFromEntry('2026-05-04', existing)
    expect(draftProseChanged(clean, existing)).toBe(false)
    // Whitespace-only differences are not edits.
    expect(draftProseChanged({ ...clean, mood_word: 'steady  ' }, existing)).toBe(false)
    expect(draftProseChanged({ ...clean, learned: 'that I like walking' }, existing)).toBe(true)
  })

  it('opens a blank day blank', () => {
    expect(draftFromEntry('2026-05-05', null)).toEqual(emptyDraft('2026-05-05'))
  })
})

// ---------------------------------------------------------------------------
// history
// ---------------------------------------------------------------------------

describe('history search', () => {
  const entries = [
    entry({ entry_date: '2026-07-04', rating: 5, gratitude_text: 'fireworks over the river' }),
    entry({ entry_date: '2026-02-09', rating: 2, gratitude_text: 'crashout day, holy akpsi bro 💀' }),
    entry({ entry_date: '2026-01-15', rating: 6, learned: 'that I work better in the morning' }),
  ]

  it('requires every term, like the vault-wide search does', () => {
    expect(filterEntries(entries, 'fireworks river')).toHaveLength(1)
    expect(filterEntries(entries, 'fireworks morning')).toHaveLength(0)
  })

  it('is case insensitive and matches emoji', () => {
    expect(filterEntries(entries, 'CRASHOUT')).toHaveLength(1)
    expect(filterEntries(entries, '💀')).toHaveLength(1)
  })

  it('searches dates the way they are read', () => {
    expect(filterEntries(entries, 'july')).toHaveLength(1)
    expect(filterEntries(entries, '2026-01-15')).toHaveLength(1)
    expect(filterEntries(entries, 'saturday')).toHaveLength(1) // 2026-07-04
  })

  it('returns everything for an empty query', () => {
    expect(filterEntries(entries, '   ')).toHaveLength(3)
  })

  it('orders on entry_date, not on when the entry was typed', () => {
    const typedLate = entry({
      entry_date: '2026-01-01',
      rating: 4,
      created_at: Date.parse('2026-12-31T00:00:00'),
      updated_at: Date.parse('2026-12-31T00:00:00'),
    })
    const sorted = sortByDateDescending([typedLate, ...entries])
    expect(sorted.map((item) => item.entry_date)).toEqual([
      '2026-07-04',
      '2026-02-09',
      '2026-01-15',
      '2026-01-01',
    ])
  })
})

describe('date formatting', () => {
  it('reads a YYYY-MM-DD as a local day, not a UTC instant', () => {
    // `new Date('2026-01-01')` is UTC midnight, which is 31 December west of Greenwich.
    expect(formatDayFull('2026-01-01')).toBe('Thursday · 1 January 2026')
  })
})
