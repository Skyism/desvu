import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { JournalEntry, StreakInfo } from '@shared/types'

import { StreakBadge } from '@/components/Streak'
import { JournalHistory } from '@/components/journal/JournalHistory'
import { MonthGrid } from '@/components/journal/MonthGrid'
import { PromptFields } from '@/components/journal/PromptFields'
import { RatingRow } from '@/components/journal/RatingRow'
import { ReflectionCard } from '@/components/journal/ReflectionCard'
import {
  buildMonthGrid,
  daysWrittenLabel,
  draftFromEntry,
  draftToInput,
  emptyDraft,
  toDateString,
} from '@/components/journal/journal-model'
import { journalRepository } from '../src/main/repos/journalRepository'
import { createTempVault, type TempVault } from './helpers/vault'

/**
 * PRD J6, tested against the screen a returning user actually sees.
 *
 * The real corpus decays from 100% adherence in January to 13.8% in July, with a 24-day
 * maximum gap. The single most important user of this surface is someone opening it after
 * three weeks away, and the failure mode is not a crash — it is a screen that greets them
 * with a broken streak or a wall of red and gets closed for good.
 *
 * So this suite seeds a vault whose last entry is exactly 24 days old, reads it through
 * the *real* repository, renders the *real* components, and asserts on the markup that
 * comes out. Nothing is mocked except the clock's starting point.
 */

let vault: TempVault

const TODAY = toDateString()

function daysAgo(n: number): string {
  const date = new Date()
  date.setDate(date.getDate() - n)
  return toDateString(date)
}

/**
 * A corpus shaped like the real one: a dense early run (which banks a long streak), then
 * sparser days, then a 24-day silence up to today.
 */
function lapsedCorpus(): JournalEntry[] {
  const entries: JournalEntry[] = []
  const push = (offset: number, extra: Partial<JournalEntry> = {}): void => {
    const date = daysAgo(offset)
    const created = Date.parse(`${date}T21:30:00`)
    entries.push({
      id: `seed-${offset}`,
      entry_date: date,
      rating: ((offset % 7) + 1) as JournalEntry['rating'],
      created_at: created,
      // Written up retroactively, as 50 of the 83 real entries were.
      updated_at: created + 3 * 86_400_000,
      ...extra,
    })
  }

  // A 44-day run months back — the banked longest, exactly as in the real data.
  for (let offset = 200; offset >= 157; offset -= 1) push(offset)
  // Then it thins out.
  for (const offset of [120, 119, 100, 80, 61, 45, 40, 33, 30, 27, 25]) push(offset)
  // The last thing written was 24 days ago — the real maximum gap. It carries a non-BMP
  // emoji, as three of the real entries do.
  push(24, { gratitude_text: 'a long walk with nowhere to be 💀' })

  return entries
}

beforeEach(async () => {
  vault = await createTempVault('journal-ui')
})

afterEach(async () => {
  await vault.dispose()
})

/** Everything the returning user's screen renders, as one string. */
async function renderLapsedScreen(): Promise<{
  html: string
  streak: StreakInfo
  entries: JournalEntry[]
}> {
  const entries = await journalRepository.list()
  const streak = await journalRepository.streak()
  const grid = buildMonthGrid(entries, TODAY)

  const html = [
    renderToStaticMarkup(createElement(StreakBadge, { streak })),
    renderToStaticMarkup(
      createElement('span', null, streak.total > 0 ? daysWrittenLabel(streak.total) : null)
    ),
    renderToStaticMarkup(
      createElement(
        ReflectionCard,
        { date: TODAY, today: TODAY, entry: null, onBackToToday: () => {} },
        createElement(MonthGrid, { days: grid, selected: TODAY, onSelect: () => {} })
      )
    ),
    renderToStaticMarkup(
      createElement(JournalHistory, {
        entries,
        loading: false,
        settled: true,
        error: null,
        selected: TODAY,
        onSelect: () => {},
        privacyNote: 'Kept on this Mac and in your vault.',
      })
    ),
  ].join('\n')

  return { html, streak, entries }
}

// ---------------------------------------------------------------------------
// the 24-day lapse
// ---------------------------------------------------------------------------

describe('returning after a 24-day lapse', () => {
  beforeEach(async () => {
    await vault.writeJson('data/journal.json', lapsedCorpus())
    await vault.writeJson('data/journal-streak.json', { longest: 44 })
  })

  it('the repository really is in the lapsed state', async () => {
    const streak = await journalRepository.streak()
    expect(streak.current).toBe(0) // not running — and the UI must never say so
    expect(streak.longest).toBe(44) // banked
    expect(streak.total).toBeGreaterThan(50)
  })

  it('shows no zero anywhere on the screen', async () => {
    const { html } = await renderLapsedScreen()
    const text = stripTags(html)

    expect(text).not.toMatch(/\b0\s*day/i)
    expect(text).not.toMatch(/\bzero\b/i)
    // "0 days running", "0-day streak", "streak: 0" — none of these can be produced.
    expect(text).not.toMatch(/streak[^.]{0,12}\b0\b/i)
  })

  it('says nothing that reads as failure', async () => {
    const { html } = await renderLapsedScreen()
    const text = stripTags(html).toLowerCase()

    for (const forbidden of [
      'broken',
      'streak lost',
      'you lost',
      'missed',
      'skipped',
      'days since',
      'last entry',
      'behind',
      'failed',
      'get back on',
      "don't break",
      'keep it up',
      'you haven',
      'you have not',
      'try again tomorrow',
      'restart',
      'reset',
      'adherence',
      '%',
    ]) {
      expect(text, `found "${forbidden}"`).not.toContain(forbidden)
    }
  })

  it('shows the banked longest instead — framed as something owned', async () => {
    const { html } = await renderLapsedScreen()
    const text = stripTags(html)
    expect(text).toContain('Longest run · 44 days')
    expect(text).not.toContain('days running') // there is no current run to count
  })

  it('counts what was written, never the days that were not', async () => {
    const { html, streak } = await renderLapsedScreen()
    const text = stripTags(html)
    expect(text).toContain(`${streak.total} days written`)
    // 211 days spanned / 39.3% adherence: computable, deliberately never rendered.
    expect(text).not.toMatch(/\d+\s*(of|\/)\s*\d+\s*days/i)
  })

  it('renders 24 empty days as the same neutral token the app draws dividers with', async () => {
    const { html, entries } = await renderLapsedScreen()
    const grid = buildMonthGrid(entries, TODAY)
    const emptyDays = grid.filter((day) => day.entry === null)

    // The whole trailing gap is empty, and every empty cell is `--rule`.
    expect(emptyDays.length).toBeGreaterThanOrEqual(24)
    const cells = html.match(/<button[^>]*aria-pressed[^>]*rounded-cell[^>]*>/g) ?? []
    const cellsWithRule = html.match(/rounded-cell[^"]*bg-rule/g) ?? []
    expect(cells.length + cellsWithRule.length).toBeGreaterThan(0)
    expect(html).toContain('bg-rule')
    expect(html).toContain('Empty is just empty.')
  })

  it('labels every empty cell neutrally', async () => {
    const { html } = await renderLapsedScreen()
    const labels = [...html.matchAll(/aria-label="([^"]*— (?:empty|rated[^"]*))"/g)].map(
      (match) => match[1] ?? ''
    )
    expect(labels.length).toBe(30)
    expect(labels.filter((label) => label.endsWith('— empty')).length).toBeGreaterThanOrEqual(24)
    for (const label of labels) {
      expect(label.toLowerCase()).not.toMatch(/miss|skip|broke|lost|fail|behind|since|gap/)
    }
  })

  it('uses no red — the danger tokens appear nowhere on the surface', async () => {
    const { html } = await renderLapsedScreen()
    for (const token of [
      'text-danger',
      'bg-danger',
      'border-danger',
      'on-danger',
      'destructive',
      '#B4483F',
      '#D67878',
    ]) {
      expect(html, `found "${token}"`).not.toContain(token)
    }
  })

  it('still opens as a rating row and an invitation, not as a recovery flow', async () => {
    const { html } = await renderLapsedScreen()
    const text = stripTags(html)

    expect(text).toContain('Tonight')
    expect(text).toContain('How was today? A number is a whole entry.')
    expect(text).toContain('Say a little more ↓')
    // Seven cells, 1–7, and nothing else asked for.
    expect(html.match(/role="radio"/g)).toHaveLength(7)
    expect(html).not.toContain('Just the number is fine ↑') // the prompts start closed
    expect(html).not.toContain('<textarea') // J2 — nothing but the rating on open
  })

  it('counts up again from the first day back, with no zero in between', async () => {
    // Before: not running. The badge shows the bank.
    const before = await journalRepository.streak()
    expect(before.current).toBe(0)
    expect(stripTags(renderToStaticMarkup(createElement(StreakBadge, { streak: before })))).toBe(
      'Longest run · 44 days'
    )

    // The returning user taps a number. That alone is a complete entry.
    const input = draftToInput({ ...emptyDraft(TODAY), rating: 5 }, null)
    expect(input).toEqual({ entry_date: TODAY, rating: 5 })
    await journalRepository.upsert(input!)

    const after = await journalRepository.streak()
    expect(after.current).toBe(1)
    expect(after.longest).toBe(44) // the bank did not move, and could not have shrunk
    expect(stripTags(renderToStaticMarkup(createElement(StreakBadge, { streak: after })))).toBe(
      '1 day running'
    )
  })
})

// ---------------------------------------------------------------------------
// day one — the other screen with nothing on it
// ---------------------------------------------------------------------------

describe('an empty vault', () => {
  it('renders absence, not a zero', async () => {
    const streak = await journalRepository.streak()
    expect(streak).toEqual({ current: 0, longest: 0, total: 0 })

    // Nothing banked and nothing running: the badge renders nothing at all.
    expect(renderToStaticMarkup(createElement(StreakBadge, { streak }))).toBe('')

    const html = renderToStaticMarkup(
      createElement(JournalHistory, {
        entries: [],
        loading: false,
        settled: true,
        error: null,
        selected: TODAY,
        onSelect: () => {},
      })
    )
    const text = stripTags(html)
    expect(text).toContain('Nothing written yet.')
    // No count at all on a blank vault — "0 days written" is still a zero.
    expect(text).not.toMatch(/\b0\b/)
    expect(text).not.toContain('days written')
    expect(daysWrittenLabel(0)).toBe('')
  })

  it('renders 30 empty cells and says only that they are empty', () => {
    const html = renderToStaticMarkup(
      createElement(MonthGrid, {
        days: buildMonthGrid([], TODAY),
        selected: TODAY,
        onSelect: () => {},
      })
    )
    // All thirty, today included — "Today, Saturday 1 August — empty" is the same
    // neutral sentence as every other day.
    expect(html.match(/aria-label="[^"]*— empty"/g)).toHaveLength(30)
    expect(html).toContain('Empty is just empty.')
    expect(html).not.toContain('danger')
  })
})

// ---------------------------------------------------------------------------
// the form itself
// ---------------------------------------------------------------------------

describe('the reflection form', () => {
  it('is a real radio group, so the rating is reachable by keyboard', () => {
    const html = renderToStaticMarkup(
      createElement(RatingRow, { value: 5, onSelect: () => {}, label: 'How was the day, 1 to 7' })
    )
    expect(html).toContain('role="radiogroup"')
    expect(html.match(/role="radio"/g)).toHaveLength(7)
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1)
    // Exactly one cell is in the tab order.
    expect(html.match(/tabindex="0"/g)).toHaveLength(1)
  })

  it('asks the four PRD J3 prompts, in order, none of them required', () => {
    const html = renderToStaticMarkup(
      createElement(PromptFields, { draft: emptyDraft(TODAY), onChange: () => {} })
    )
    const text = stripTags(html)
    const order = [
      "Something you're grateful for",
      'What did I learn about myself or the world today',
      'One word for your mood',
      'Something that happened that made you feel that way',
    ].map((question) => text.indexOf(question))

    expect(order.every((index) => index >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    expect(html).not.toContain('required')
    expect(html).not.toContain('aria-invalid')
  })

  it('opens an existing day already filled in, so editing is not a separate mode', () => {
    const existing: JournalEntry = {
      id: 'x',
      entry_date: daysAgo(3),
      rating: 6,
      gratitude_text: 'the good coffee 💀',
      mood_word: 'steady',
      created_at: 1,
      updated_at: 2,
    }
    const html = renderToStaticMarkup(
      createElement(PromptFields, {
        draft: draftFromEntry(existing.entry_date, existing),
        onChange: () => {},
      })
    )
    expect(html).toContain('the good coffee 💀')
    expect(html).toContain('value="steady"')
  })
})

// ---------------------------------------------------------------------------
// structural: the guilt state must be unreachable from the source, not just unrendered
// ---------------------------------------------------------------------------

describe('the journal source itself', () => {
  const root = path.resolve(import.meta.dirname, '..', 'src', 'renderer', 'src')

  async function journalSources(): Promise<{ file: string; code: string }[]> {
    const dir = path.join(root, 'components', 'journal')
    const names = await readdir(dir)
    const files = [
      ...names.filter((name) => name.endsWith('.ts') || name.endsWith('.tsx')).map((name) => path.join(dir, name)),
      path.join(root, 'surfaces', 'JournalSurface.tsx'),
    ]
    return Promise.all(
      files.map(async (file) => ({ file, code: await readFile(file, 'utf8') }))
    )
  }

  /** Comments discuss the rules by name; only executable code is scanned. */
  function stripComments(code: string): string {
    return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  }

  it('never reaches for a danger token or a destructive variant', async () => {
    for (const { file, code } of await journalSources()) {
      const source = stripComments(code)
      expect(source, file).not.toMatch(/\b(?:text|bg|border|ring|outline)-danger\b/)
      expect(source, file).not.toMatch(/variant=["']destructive["']/)
      expect(source, file).not.toMatch(/tone=["']danger["']/)
    }
  })

  it('never keys anything on created_at', async () => {
    for (const { file, code } of await journalSources()) {
      // `created_at` may be typed, never read for placement or ordering.
      expect(stripComments(code), file).not.toMatch(/\.created_at/)
    }
  })

  it('never truncates a string by UTF-16 index', async () => {
    for (const { file, code } of await journalSources()) {
      const source = stripComments(code)
      // `[...text].slice()` is fine; `text.slice()` on prose is the bug.
      expect(source, file).not.toMatch(/\b(?:text|value|preview|prose|entry\.\w+)\.slice\(/)
      expect(source, file).not.toMatch(/\.substring\(|\.substr\(/)
    }
  })

  it('contains no copy that could read as a scold', async () => {
    for (const { file, code } of await journalSources()) {
      const strings = [...stripComments(code).matchAll(/(['"`])((?:(?!\1)[\s\S])*)\1/g)]
        .map((match) => match[2] ?? '')
        .join(' | ')
        .toLowerCase()

      for (const forbidden of [
        'streak lost',
        'broken',
        'days since',
        'you missed',
        'you skipped',
        "you haven't",
        'get back',
        'back on track',
        'keep it up',
        "don't break",
      ]) {
        expect(strings, `${file} contains "${forbidden}"`).not.toContain(forbidden)
      }
    }
  })
})

/** Markup → what a reader actually sees, with entities resolved. */
function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&middot;/g, '·')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}
