import { describe, expect, it } from 'vitest'

import {
  citedTargets,
  parseNote,
  type Block,
} from '../src/renderer/src/components/notes/parse'
import {
  buildNoteIndex,
  resolveWikilink,
  type NoteRef,
} from '../src/renderer/src/components/notes/wikilinks'
import {
  formatWeekLabel,
  isoWeekOf,
  isoWeekRange,
} from '../src/renderer/src/components/notes/format'

/**
 * PRD B3 — the weekly synthesis, and the property that makes it worth reading: every
 * claim carries a `[[wikilink]]` back to the record it came from. That is what makes the
 * note a hub in the Obsidian graph rather than a plausible-sounding summary, and the
 * Sources card on the surface is the audit of it.
 */

const WRITE_UP = [
  '---',
  'week: 2026-W31',
  'generated: 2026-08-02',
  '---',
  '',
  '# Week 31',
  '',
  'You spent the week on allocators. Three separate captures land in',
  '[[malloc-lab]], and the reading you saved — [[2026-07-28-ddia-ch4|DDIA ch.4]] —',
  'is about the same problem from the storage side.',
  '',
  '## What you said you would do',
  '',
  '- Email the Ramp recruiter — still open since 2026-07-26. See [[systems-design]].',
  '- Ship the writeup. Done Thursday.',
  '',
  '## Correlations',
  '',
  '| tracker | observation |',
  '|---|---|',
  '| workouts | three sessions, all on days you rated 5 or above |',
  '| finance | coffee is 31% of discretionary spend, up from [[2026-W30]] |',
  '',
  '> The one that surprised me: every 6-rated day this month followed a lift.',
  '',
  'Nothing here reads the journal beyond what the projection allows — see [[#Access]].',
  '',
  '## Access',
  '',
  'Journal access was `full` this week.',
].join('\n')

describe('the write-up parses as a reading surface', () => {
  const blocks = parseNote(WRITE_UP)

  it('keeps front matter out of the prose', () => {
    expect(blocks[0]).toMatchObject({ type: 'heading', level: 1, text: 'Week 31' })
    expect(WRITE_UP).toContain('week: 2026-W31')
  })

  it('carries the structures a synthesis agent actually writes', () => {
    const kinds = new Set(blocks.map((block: Block) => block.type))
    expect(kinds).toContain('heading')
    expect(kinds).toContain('paragraph')
    expect(kinds).toContain('list')
    expect(kinds).toContain('table')
    expect(kinds).toContain('quote')
  })
})

describe('every claim links back to a record', () => {
  it('collects the cited records in first-mention order', () => {
    expect(citedTargets(WRITE_UP)).toEqual([
      'malloc-lab',
      '2026-07-28-ddia-ch4',
      'systems-design',
      '2026-W30',
    ])
  })

  it('does not count a same-note section reference as a citation', () => {
    // `[[#Access]]` points inside this file. Counting it would inflate the audit with
    // links that prove nothing.
    expect(citedTargets(WRITE_UP)).not.toContain('')
    expect(WRITE_UP).toContain('[[#Access]]')
  })

  it('does not count an attachment embed as a citation', () => {
    expect(citedTargets('Photo: ![[Attachments/whiteboard.jpg]] and [[malloc-lab]].')).toEqual([
      'malloc-lab',
    ])
  })

  it('reports an unsourced week as unsourced', () => {
    // The empty result is what makes the surface able to say "nothing cited" honestly
    // instead of quietly rendering a claim nobody can check.
    expect(citedTargets('A confident paragraph with no links at all.')).toEqual([])
  })

  it('resolves its citations against the notes the app can see', () => {
    const index = buildNoteIndex([
      { path: 'Brain Dump/School/malloc-lab.md', title: 'Malloc lab', kind: 'brain-dump' },
      { path: 'Library/2026-07-28-ddia-ch4.md', title: 'DDIA ch.4', kind: 'library' },
      { path: 'Synthesis/2026-W30.md', title: 'Week 30 · 2026', kind: 'synthesis' },
    ] satisfies NoteRef[])

    const resolved = citedTargets(WRITE_UP).map((target) => resolveWikilink(target, index)?.kind ?? null)
    // `systems-design` has not been written yet — that link stays plain text and is not
    // an error. The other three open the record they name.
    expect(resolved).toEqual(['brain-dump', 'library', null, 'synthesis'])
  })

  it('follows an alias without losing the target it points at', () => {
    const index = buildNoteIndex([
      { path: 'Library/2026-07-28-ddia-ch4.md', title: 'DDIA ch.4', kind: 'library' },
    ])
    expect(resolveWikilink('2026-07-28-ddia-ch4', index)?.path).toBe(
      'Library/2026-07-28-ddia-ch4.md'
    )
  })
})

describe('ISO week naming', () => {
  it('reads the file name the synthesis agent writes', () => {
    expect(formatWeekLabel('2026-W31')).toBe('Week 31 · 2026')
    expect(formatWeekLabel('2026-W05')).toBe('Week 5 · 2026')
  })

  it('spans Monday to Sunday, crossing a month boundary correctly', () => {
    expect(isoWeekRange('2026-W31')).toBe('27 Jul – 2 Aug 2026')
    expect(isoWeekRange('2026-W01')).toBe('29 Dec – 4 Jan 2026')
  })

  it('handles the 53-week year and the January boundary', () => {
    // 2026 has 53 ISO weeks; 1 January 2027 is a Friday and belongs to 2026-W53.
    expect(isoWeekOf(new Date(2026, 11, 31))).toBe('2026-W53')
    expect(isoWeekOf(new Date(2027, 0, 1))).toBe('2026-W53')
    expect(isoWeekOf(new Date(2027, 0, 4))).toBe('2027-W01')
  })

  it('leaves a name it does not recognise alone rather than guessing', () => {
    expect(formatWeekLabel('draft')).toBe('draft')
    expect(isoWeekRange('draft')).toBeNull()
  })
})
