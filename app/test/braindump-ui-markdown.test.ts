import { describe, expect, it } from 'vitest'

import {
  collectWikilinks,
  inlineText,
  parseBlocks,
  parseInline,
  parseNote,
  parseWikilinkTarget,
  type Block,
  type Inline,
} from '../src/renderer/src/components/notes/parse'
import {
  attachmentPath,
  buildNoteIndex,
  isAttachmentTarget,
  linkKey,
  resolveWikilink,
  wikilinkLabel,
  type NoteRef,
} from '../src/renderer/src/components/notes/wikilinks'
import {
  formatWeekLabel,
  isoWeekOf,
  isoWeekRange,
  previewOf,
  relativeDay,
} from '../src/renderer/src/components/notes/format'

/**
 * The markdown here is not a general renderer, so these tests are the contract for what
 * it does cover — and, just as importantly, for how it fails: an unrecognised construct
 * has to survive as its literal text rather than disappear from the note.
 */

function block(blocks: Block[], index: number): Block {
  const found = blocks[index]
  if (!found) throw new Error(`no block at ${index}`)
  return found
}

function inline(nodes: Inline[], index: number): Inline {
  const found = nodes[index]
  if (!found) throw new Error(`no inline node at ${index}`)
  return found
}

describe('inline parsing', () => {
  it('reads bold, italic, strikethrough, highlight and code', () => {
    const nodes = parseInline('**hard** and *soft* and ~~gone~~ and ==lit== and `code`')
    expect(nodes.map((node) => node.type)).toEqual([
      'strong',
      'text',
      'em',
      'text',
      'del',
      'text',
      'mark',
      'text',
      'code',
    ])
    expect(inlineText(nodes)).toBe('hard and soft and gone and lit and code')
  })

  it('does not turn snake_case into emphasis', () => {
    const nodes = parseInline('call estimate_minutes_left on it')
    expect(nodes).toEqual([{ type: 'text', value: 'call estimate_minutes_left on it' }])
  })

  it('never re-parses the inside of a code span', () => {
    const nodes = parseInline('use `[[not a link]]` here')
    expect(inline(nodes, 1)).toEqual({ type: 'code', value: '[[not a link]]' })
  })

  it('honours a backslash escape', () => {
    expect(parseInline('\\[[literal]]')).toEqual([{ type: 'text', value: '[[literal]]' }])
    expect(parseInline('2 \\* 3')).toEqual([{ type: 'text', value: '2 * 3' }])
  })

  it('renders markdown links and bare URLs', () => {
    const nodes = parseInline('see [DDIA](https://example.com/ddia) or https://example.com/raw')
    expect(inline(nodes, 1)).toMatchObject({ type: 'link', href: 'https://example.com/ddia' })
    expect(inline(nodes, 3)).toMatchObject({ type: 'link', href: 'https://example.com/raw' })
  })

  it('drops trailing sentence punctuation from a bare URL', () => {
    const nodes = parseInline('read https://example.com/a, then stop')
    expect(inline(nodes, 0)).toEqual({ type: 'text', value: 'read ' })
    expect(inline(nodes, 1)).toMatchObject({ type: 'link', href: 'https://example.com/a' })
    expect(inline(nodes, 2)).toEqual({ type: 'text', value: ', then stop' })
  })

  it('turns an external image into a link, since the CSP forbids loading it', () => {
    const nodes = parseInline('![a chart](https://example.com/chart.png)')
    expect(inline(nodes, 0)).toMatchObject({
      type: 'link',
      href: 'https://example.com/chart.png',
      children: [{ type: 'text', value: 'a chart' }],
    })
  })

  it('leaves raw HTML as text rather than rendering it', () => {
    // The renderer emits React elements only, so this can never become a live element.
    const nodes = parseInline('<img src=x onerror=alert(1)>')
    expect(nodes).toEqual([{ type: 'text', value: '<img src=x onerror=alert(1)>' }])
  })
})

describe('wikilink syntax', () => {
  it('splits target, heading and alias', () => {
    expect(parseWikilinkTarget('malloc-lab')).toEqual({
      target: 'malloc-lab',
      heading: null,
      alias: null,
    })
    expect(parseWikilinkTarget('2026-07-28-ddia-ch4|DDIA ch.4')).toEqual({
      target: '2026-07-28-ddia-ch4',
      heading: null,
      alias: 'DDIA ch.4',
    })
    expect(parseWikilinkTarget('Systems design#Read path')).toEqual({
      target: 'Systems design',
      heading: 'Read path',
      alias: null,
    })
    expect(parseWikilinkTarget('#Later today')).toEqual({
      target: '',
      heading: 'Later today',
      alias: null,
    })
  })

  it('recognises an embed and keeps it distinct from a link', () => {
    const nodes = parseInline('photo: ![[Attachments/receipt.jpg]] and [[Groceries]]')
    expect(inline(nodes, 1)).toMatchObject({ type: 'wikilink', embed: true })
    expect(inline(nodes, 3)).toMatchObject({ type: 'wikilink', embed: false, target: 'Groceries' })
  })

  it('labels a link the way Obsidian does', () => {
    expect(wikilinkLabel({ target: 'a', heading: null, alias: 'A thing' })).toBe('A thing')
    expect(wikilinkLabel({ target: 'a', heading: 'Section', alias: null })).toBe('a › Section')
    expect(wikilinkLabel({ target: 'a', heading: null, alias: null })).toBe('a')
  })

  it('spots attachment embeds by extension', () => {
    expect(isAttachmentTarget('receipt.jpg')).toBe(true)
    expect(isAttachmentTarget('voice-2026-08-01.m4a')).toBe(true)
    expect(isAttachmentTarget('Systems design')).toBe(false)
    expect(attachmentPath('receipt.jpg')).toBe('Attachments/receipt.jpg')
    expect(attachmentPath('Attachments/receipt.jpg')).toBe('Attachments/receipt.jpg')
  })
})

describe('wikilink resolution', () => {
  const refs: NoteRef[] = [
    { path: 'Brain Dump/School/malloc-lab.md', title: 'Malloc lab', kind: 'brain-dump' },
    { path: 'Brain Dump/Recruiting/systems-design.md', title: 'Systems design', kind: 'brain-dump' },
    { path: 'Library/2026-07-28-ddia-ch4.md', title: 'DDIA ch.4', kind: 'library' },
  ]
  const index = buildNoteIndex(refs)

  it('matches on the file stem, which is what the sort skill emits as a link target', () => {
    expect(resolveWikilink('malloc-lab', index)?.path).toBe('Brain Dump/School/malloc-lab.md')
    expect(resolveWikilink('2026-07-28-ddia-ch4', index)?.kind).toBe('library')
  })

  it('matches a full vault path, with or without the extension', () => {
    expect(resolveWikilink('Brain Dump/School/malloc-lab', index)?.title).toBe('Malloc lab')
    expect(resolveWikilink('Brain Dump/School/malloc-lab.md', index)?.title).toBe('Malloc lab')
  })

  it('is case- and accent-normalisation insensitive', () => {
    expect(resolveWikilink('MALLOC-LAB', index)?.title).toBe('Malloc lab')
    expect(linkKey('Dès vu.md')).toBe(linkKey('Dès vu'.normalize('NFD')))
  })

  it('returns null for a note that does not exist — which is not an error', () => {
    // Obsidian treats an unresolved link as a deliberate forward reference. The UI
    // renders this case as plain text; nothing may present it as damage.
    expect(resolveWikilink('Distributed systems reading', index)).toBeNull()
    expect(resolveWikilink('', index)).toBeNull()
  })

  it('breaks a same-stem tie on the shortest path, so the choice is stable', () => {
    const ambiguous = buildNoteIndex([
      { path: 'Brain Dump/Deep/Nested/notes.md', title: 'deep', kind: 'brain-dump' },
      { path: 'Brain Dump/notes.md', title: 'shallow', kind: 'brain-dump' },
    ])
    expect(resolveWikilink('notes', ambiguous)?.title).toBe('shallow')
  })
})

describe('block parsing', () => {
  it('reads the thread shape from data/SCHEMAS.md', () => {
    const source = [
      '---',
      'topic: Recruiting',
      'created: 2026-07-14',
      'updated: 2026-08-01',
      'tags: [interviews, systems-design]',
      '---',
      '',
      '# Systems design prep',
      '',
      '## 2026-07-14',
      'First thought that started this thread.',
      '',
      '## 2026-08-01',
      'Later addition. Related: [[Distributed systems reading]].',
      '',
    ].join('\n')

    const blocks = parseNote(source)
    expect(blocks.map((entry) => entry.type)).toEqual([
      'heading',
      'heading',
      'paragraph',
      'heading',
      'paragraph',
    ])
    expect(block(blocks, 1)).toMatchObject({ type: 'heading', level: 2, text: '2026-07-14' })
    expect(collectWikilinks(blocks).map((link) => link.target)).toEqual([
      'Distributed systems reading',
    ])
  })

  it('keeps front matter out of the body even when the repository did not strip it', () => {
    const blocks = parseNote('---\ntopic: X\n---\n\nBody.\n')
    expect(blocks).toHaveLength(1)
    expect(inlineText((block(blocks, 0) as { children: Inline[] }).children)).toBe('Body.')
  })

  it('parses nested and task lists', () => {
    const blocks = parseBlocks(
      ['- [ ] book the flight', '- [x] email prof', '- plain', '    - nested'].join('\n')
    )
    const list = block(blocks, 0)
    if (list.type !== 'list') throw new Error('expected a list')
    // `    - nested` is content of the third item, not a fourth sibling.
    expect(list.items.map((item) => item.checked)).toEqual([false, true, null])
    const third = list.items[2]
    if (!third) throw new Error('expected a third item')
    expect(third.children.map((entry) => entry.type)).toEqual(['paragraph', 'list'])
  })

  it('numbers an ordered list from its own start', () => {
    const blocks = parseBlocks('3. three\n4. four')
    const list = block(blocks, 0)
    if (list.type !== 'list') throw new Error('expected a list')
    expect(list.ordered).toBe(true)
    expect(list.start).toBe(3)
  })

  it('parses fenced code without touching its contents', () => {
    const blocks = parseBlocks(['```python', 'x = [[1, 2]]', '# not a heading', '```'].join('\n'))
    expect(block(blocks, 0)).toEqual({
      type: 'code',
      lang: 'python',
      value: 'x = [[1, 2]]\n# not a heading',
    })
  })

  it('parses blockquotes, rules and tables', () => {
    const blocks = parseBlocks(
      ['> a quiet aside', '', '---', '', '| week | mood |', '|---|---:|', '| 31 | restless |'].join(
        '\n'
      )
    )
    expect(blocks.map((entry) => entry.type)).toEqual(['quote', 'hr', 'table'])
    const table = block(blocks, 2)
    if (table.type !== 'table') throw new Error('expected a table')
    expect(table.align).toEqual([null, 'right'])
    expect(table.rows).toHaveLength(1)
  })

  it('finds wikilinks wherever they hide', () => {
    const blocks = parseBlocks(
      [
        '> quoted [[A]]',
        '',
        '- listed [[B]]',
        '',
        '| [[C]] |',
        '|---|',
        '| [[D]] |',
        '',
        '## heading [[E]]',
      ].join('\n')
    )
    expect(collectWikilinks(blocks).map((link) => link.target)).toEqual(['A', 'B', 'C', 'D', 'E'])
  })

  it('does not lose text it cannot classify', () => {
    const odd = 'A line with [an unclosed bracket and a | pipe'
    const blocks = parseBlocks(odd)
    expect(inlineText((block(blocks, 0) as { children: Inline[] }).children)).toBe(odd)
  })
})

describe('formatting helpers', () => {
  const now = new Date(2026, 7, 1) // 1 August 2026, local

  it('never counts a gap back at the user', () => {
    expect(relativeDay('2026-08-01', now)).toBe('today')
    expect(relativeDay('2026-07-31', now)).toBe('yesterday')
    expect(relativeDay('2026-07-29', now)).toBe('3 days ago')
    // Past a week it states the date instead of a growing "days since" number (J6).
    expect(relativeDay('2026-07-04', now)).toBe('4 Jul')
    expect(relativeDay('2025-12-30', now)).toBe('30 Dec 2025')
  })

  it('parses YYYY-MM-DD as a local date, not UTC', () => {
    expect(relativeDay('2026-08-01', new Date(2026, 7, 1, 0, 30))).toBe('today')
  })

  it('slices previews by code point so an emoji cannot be split', () => {
    const preview = previewOf(`${'a'.repeat(20)}👨‍👩‍👧‍👦${'b'.repeat(40)}`, 22)
    expect(preview.endsWith('…')).toBe(true)
    expect([...preview].some((point) => point.charCodeAt(0) >= 0xd800 && point.charCodeAt(0) <= 0xdbff && point.length === 1)).toBe(false)
  })

  it('strips markup and wikilink brackets from a preview', () => {
    expect(previewOf('## 2026-08-01\n**Bold** and [[Some note|an alias]] here.')).toBe(
      'Bold and an alias here.'
    )
  })

  it('reads ISO week names', () => {
    expect(formatWeekLabel('2026-W31')).toBe('Week 31 · 2026')
    expect(isoWeekRange('2026-W31')).toBe('27 Jul – 2 Aug 2026')
    expect(isoWeekRange('2026-W32')).toBe('3 – 9 Aug 2026')
    expect(isoWeekOf(new Date(2026, 6, 30))).toBe('2026-W31')
    // 1 January 2027 is a Friday, so ISO puts it in week 53 of 2026.
    expect(isoWeekOf(new Date(2027, 0, 1))).toBe('2026-W53')
  })
})
