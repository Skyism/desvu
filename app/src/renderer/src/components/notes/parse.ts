/**
 * A focused markdown parser for the subset this vault actually contains.
 *
 * WHY NOT A LIBRARY. Three reasons, in order of weight:
 *
 *  1. `[[wikilinks]]` are not markdown. Every general renderer needs a custom plugin or
 *     an AST walk to handle them, and resolution has to happen against a vault index that
 *     only this app has. Once that work exists, the library is carrying the easy half.
 *  2. This produces React elements, never an HTML string. Nothing in the corpus can reach
 *     `dangerouslySetInnerHTML`, so a note containing `<img onerror=…>` renders as the
 *     text it is. In an Electron renderer that is worth more than feature completeness.
 *  3. `app/package.json` is orchestrator-owned and no dependency may be added unasked.
 *
 * The cost is honest: no footnotes, no definition lists, no raw HTML, no reference links,
 * no setext headings. Nothing in `Brain Dump/`, `Synthesis/` or `Library/` uses them —
 * those files are written by the sort skill, the synthesis agent, and by hand in Obsidian.
 * Anything unrecognised degrades to its literal text rather than disappearing.
 */

// ---------------------------------------------------------------------------
// inline
// ---------------------------------------------------------------------------

export type Inline =
  | { type: 'text'; value: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'del'; children: Inline[] }
  | { type: 'mark'; children: Inline[] }
  | { type: 'code'; value: string }
  | { type: 'link'; href: string; children: Inline[] }
  | { type: 'wikilink'; target: string; heading: string | null; alias: string | null; embed: boolean }

export type ListItem = { checked: boolean | null; children: Block[] }

export type Block =
  | { type: 'heading'; level: number; children: Inline[]; text: string }
  | { type: 'paragraph'; children: Inline[] }
  | { type: 'list'; ordered: boolean; start: number; tight: boolean; items: ListItem[] }
  | { type: 'quote'; children: Block[] }
  | { type: 'code'; lang: string | null; value: string }
  | { type: 'hr' }
  | { type: 'table'; header: Inline[][]; align: (('left' | 'center' | 'right') | null)[]; rows: Inline[][][] }

const PUNCTUATION = new Set([
  '\\', '`', '*', '_', '{', '}', '[', ']', '(', ')', '#', '+', '-', '.', '!', '|', '>', '~', '=',
])

/** `[[Target#Heading|Alias]]` — Obsidian's shape, with both parts optional. */
export function parseWikilinkTarget(raw: string): {
  target: string
  heading: string | null
  alias: string | null
} {
  const pipe = raw.indexOf('|')
  const head = (pipe === -1 ? raw : raw.slice(0, pipe)).trim()
  const alias = pipe === -1 ? null : raw.slice(pipe + 1).trim() || null

  // `#` splits a heading or block reference off the note name. `[[#Section]]` is a link
  // into the current note, which leaves an empty target — that is legal and kept as such.
  const hash = head.indexOf('#')
  const target = (hash === -1 ? head : head.slice(0, hash)).trim()
  const heading = hash === -1 ? null : head.slice(hash + 1).trim() || null

  return { target, heading, alias }
}

function pushText(out: Inline[], value: string): void {
  if (value === '') return
  const last = out[out.length - 1]
  if (last && last.type === 'text') last.value += value
  else out.push({ type: 'text', value })
}

/** Find the closing run of `marker`, skipping code spans so `**a `b**` c**` behaves. */
function findClosing(text: string, from: number, marker: string): number {
  let index = from
  while (index < text.length) {
    const char = text[index]
    if (char === '\\') {
      index += 2
      continue
    }
    if (char === '`') {
      const tick = /`+/.exec(text.slice(index))?.[0] ?? '`'
      const close = text.indexOf(tick, index + tick.length)
      index = close === -1 ? text.length : close + tick.length
      continue
    }
    if (text.startsWith(marker, index)) return index
    index += 1
  }
  return -1
}

const AUTOLINK = /^(https?:\/\/|obsidian:\/\/)[^\s<>()[\]]+[^\s<>()[\].,;:!?'"]/

export function parseInline(input: string): Inline[] {
  const out: Inline[] = []
  let index = 0

  while (index < input.length) {
    const char = input[index] as string
    const rest = input.slice(index)

    // Escapes first — `\[[not a link]]` must stay text.
    if (char === '\\') {
      const next = input[index + 1]
      if (next !== undefined && PUNCTUATION.has(next)) {
        pushText(out, next)
        index += 2
        continue
      }
    }

    // Code spans win over everything; their content is never re-parsed.
    if (char === '`') {
      const fence = /^`+/.exec(rest)?.[0] as string
      const close = input.indexOf(fence, index + fence.length)
      if (close !== -1) {
        out.push({ type: 'code', value: input.slice(index + fence.length, close).trim() })
        index = close + fence.length
        continue
      }
    }

    // `![[embed]]` and `[[wikilink]]`.
    const wiki = /^(!?)\[\[([^\]\n]+)\]\]/.exec(rest)
    if (wiki) {
      const { target, heading, alias } = parseWikilinkTarget(wiki[2] as string)
      out.push({ type: 'wikilink', target, heading, alias, embed: wiki[1] === '!' })
      index += wiki[0].length
      continue
    }

    // `![alt](url)` — an external image cannot load under the app's CSP, so it becomes a
    // link labelled with its alt text rather than a broken frame.
    const image = /^!\[([^\]]*)\]\(\s*([^\s)]+)(?:\s+"[^"]*")?\s*\)/.exec(rest)
    if (image) {
      const alt = (image[1] as string).trim()
      out.push({
        type: 'link',
        href: image[2] as string,
        children: [{ type: 'text', value: alt === '' ? (image[2] as string) : alt }],
      })
      index += image[0].length
      continue
    }

    const link = /^\[([^\]]*)\]\(\s*([^\s)]+)(?:\s+"[^"]*")?\s*\)/.exec(rest)
    if (link) {
      const label = link[1] as string
      out.push({
        type: 'link',
        href: link[2] as string,
        children: label === '' ? [{ type: 'text', value: link[2] as string }] : parseInline(label),
      })
      index += link[0].length
      continue
    }

    if (char === '<') {
      const auto = /^<((?:https?|obsidian):\/\/[^>\s]+)>/.exec(rest)
      if (auto) {
        const href = auto[1] as string
        out.push({ type: 'link', href, children: [{ type: 'text', value: href }] })
        index += auto[0].length
        continue
      }
    }

    for (const [marker, type] of [
      ['**', 'strong'],
      ['__', 'strong'],
      ['~~', 'del'],
      ['==', 'mark'],
    ] as const) {
      if (rest.startsWith(marker)) {
        const close = findClosing(input, index + marker.length, marker)
        if (close !== -1 && close > index + marker.length) {
          out.push({ type, children: parseInline(input.slice(index + marker.length, close)) })
          index = close + marker.length
          break
        }
      }
    }
    if (index >= input.length || input.slice(index) !== rest) continue

    if ((char === '*' || char === '_') && input[index + 1] !== char) {
      // `snake_case_names` must not become emphasis, so `_` only opens at a word boundary.
      const previous = input[index - 1]
      const opens = char === '*' || previous === undefined || /[\s(["']/.test(previous)
      const close = opens ? findClosing(input, index + 1, char) : -1
      if (close !== -1 && close > index + 1 && input[close + 1] !== char) {
        out.push({ type: 'em', children: parseInline(input.slice(index + 1, close)) })
        index = close + 1
        continue
      }
    }

    if (char === 'h' || char === 'o') {
      const bare = AUTOLINK.exec(rest)
      if (bare) {
        const href = bare[0]
        out.push({ type: 'link', href, children: [{ type: 'text', value: href }] })
        index += href.length
        continue
      }
    }

    pushText(out, char)
    index += 1
  }

  return out
}

/** The visible text of an inline tree — for headings, titles and previews. */
export function inlineText(nodes: Inline[]): string {
  let out = ''
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
      case 'code':
        out += node.value
        break
      case 'wikilink':
        out += node.alias ?? node.target ?? ''
        break
      default:
        out += inlineText(node.children)
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// blocks
// ---------------------------------------------------------------------------

const HEADING = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/
const HR = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/
const FENCE = /^ {0,3}(```+|~~~+)\s*([^\s`]*)\s*$/
const QUOTE = /^ {0,3}>\s?(.*)$/
const LIST_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])(\s+)(.*)$/
const TASK = /^\[([ xX])\]\s+(.*)$/
const TABLE_DELIMITER = /^\s*\|?(\s*:?-{1,}:?\s*\|)+\s*:?-{1,}:?\s*\|?\s*$/

function isBlank(line: string | undefined): boolean {
  return line === undefined || line.trim() === ''
}

function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  const cells: string[] = []
  let current = ''
  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index] as string
    if (char === '\\' && trimmed[index + 1] === '|') {
      current += '|'
      index += 1
      continue
    }
    if (char === '|') {
      cells.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  cells.push(current.trim())
  return cells
}

function alignmentOf(cell: string): 'left' | 'center' | 'right' | null {
  const value = cell.trim()
  const left = value.startsWith(':')
  const right = value.endsWith(':')
  if (left && right) return 'center'
  if (right) return 'right'
  if (left) return 'left'
  return null
}

/** True when `line` would begin a different block, ending a lazy paragraph. */
function interrupts(line: string | undefined): boolean {
  if (line === undefined) return true
  if (isBlank(line)) return true
  return (
    HEADING.test(line) ||
    HR.test(line) ||
    FENCE.test(line) ||
    QUOTE.test(line) ||
    LIST_ITEM.test(line)
  )
}

export function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index] as string

    if (isBlank(line)) {
      index += 1
      continue
    }

    const fence = FENCE.exec(line)
    if (fence) {
      const marker = (fence[1] as string).slice(0, 3)
      const body: string[] = []
      index += 1
      while (index < lines.length && !(lines[index] as string).trimStart().startsWith(marker)) {
        body.push(lines[index] as string)
        index += 1
      }
      index += 1 // the closing fence, or the end of the file
      blocks.push({ type: 'code', lang: (fence[2] as string) || null, value: body.join('\n') })
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      const children = parseInline(heading[2] as string)
      blocks.push({
        type: 'heading',
        level: (heading[1] as string).length,
        children,
        text: inlineText(children),
      })
      index += 1
      continue
    }

    if (HR.test(line)) {
      blocks.push({ type: 'hr' })
      index += 1
      continue
    }

    if (QUOTE.test(line)) {
      const inner: string[] = []
      while (index < lines.length) {
        const current = lines[index] as string
        const quoted = QUOTE.exec(current)
        if (quoted) {
          inner.push(quoted[1] as string)
          index += 1
          continue
        }
        // Lazy continuation: an unprefixed line still belongs to the quote's paragraph.
        if (!isBlank(current) && !interrupts(current) && inner.length > 0) {
          inner.push(current)
          index += 1
          continue
        }
        break
      }
      blocks.push({ type: 'quote', children: parseBlocks(inner.join('\n')) })
      continue
    }

    if (
      line.includes('|') &&
      !isBlank(lines[index + 1]) &&
      TABLE_DELIMITER.test(lines[index + 1] as string)
    ) {
      const header = splitRow(line).map((cell) => parseInline(cell))
      const align = splitRow(lines[index + 1] as string).map(alignmentOf)
      index += 2
      const rows: Inline[][][] = []
      while (index < lines.length && !isBlank(lines[index]) && (lines[index] as string).includes('|')) {
        rows.push(splitRow(lines[index] as string).map((cell) => parseInline(cell)))
        index += 1
      }
      blocks.push({ type: 'table', header, align, rows })
      continue
    }

    const item = LIST_ITEM.exec(line)
    if (item) {
      const [list, next] = parseList(lines, index)
      blocks.push(list)
      index = next
      continue
    }

    const paragraph: string[] = [line]
    index += 1
    while (index < lines.length && !interrupts(lines[index])) {
      paragraph.push(lines[index] as string)
      index += 1
    }
    blocks.push({ type: 'paragraph', children: parseInline(paragraph.join('\n')) })
  }

  return blocks
}

function markerIsOrdered(marker: string): boolean {
  return /\d/.test(marker)
}

function parseList(lines: string[], start: number): [Block, number] {
  const first = LIST_ITEM.exec(lines[start] as string) as RegExpExecArray
  const baseIndent = (first[1] as string).length
  const ordered = markerIsOrdered(first[2] as string)
  const startNumber = ordered ? Number.parseInt(first[2] as string, 10) || 1 : 1

  const items: ListItem[] = []
  let index = start
  let tight = true

  while (index < lines.length) {
    const line = lines[index]
    if (line === undefined) break

    if (isBlank(line)) {
      // A blank line only continues the list if what follows is indented into it.
      let lookahead = index
      while (lookahead < lines.length && isBlank(lines[lookahead])) lookahead += 1
      const following = lines[lookahead]
      if (following === undefined) break
      const followingIndent = following.length - following.trimStart().length
      const followingItem = LIST_ITEM.exec(following)
      const continues =
        followingIndent > baseIndent ||
        (followingItem !== null && (followingItem[1] as string).length === baseIndent)
      if (!continues) break
      tight = false
      index = lookahead
      continue
    }

    const match = LIST_ITEM.exec(line)
    if (match === null) break
    const indent = (match[1] as string).length
    if (indent < baseIndent) break
    if (indent > baseIndent) break // handled as nested content of the previous item

    if (markerIsOrdered(match[2] as string) !== ordered) break

    const contentIndent = indent + (match[2] as string).length + (match[3] as string).length
    const content: string[] = [match[4] as string]
    index += 1

    while (index < lines.length) {
      const current = lines[index]
      if (current === undefined) break
      if (isBlank(current)) {
        const next = lines[index + 1]
        const nextIndent = next === undefined ? 0 : next.length - next.trimStart().length
        if (next !== undefined && !isBlank(next) && nextIndent >= contentIndent) {
          content.push('')
          index += 1
          continue
        }
        break
      }
      const currentIndent = current.length - current.trimStart().length
      if (currentIndent >= contentIndent) {
        content.push(current.slice(contentIndent))
        index += 1
        continue
      }
      // Lazy continuation of the item's paragraph.
      if (!interrupts(current)) {
        content.push(current.trim())
        index += 1
        continue
      }
      break
    }

    const task = TASK.exec(content[0] as string)
    let checked: boolean | null = null
    if (task) {
      checked = (task[1] as string).toLowerCase() === 'x'
      content[0] = task[2] as string
    }

    items.push({ checked, children: parseBlocks(content.join('\n')) })
  }

  return [{ type: 'list', ordered, start: startNumber, tight, items }, index]
}

/** Parse a whole note. Front matter is stripped by the repository, but be tolerant. */
export function parseNote(source: string): Block[] {
  const text = source.replace(/^﻿/, '')
  if (!/^---\s*\n/.test(text)) return parseBlocks(text)
  const end = text.indexOf('\n---', 3)
  if (end === -1) return parseBlocks(text)
  return parseBlocks(text.slice(text.indexOf('\n', end + 1) + 1))
}

/** Every wikilink in a note, in document order. Used to count a synthesis note's sources. */
export function collectWikilinks(blocks: Block[]): Extract<Inline, { type: 'wikilink' }>[] {
  const found: Extract<Inline, { type: 'wikilink' }>[] = []

  const walkInline = (nodes: Inline[]): void => {
    for (const node of nodes) {
      if (node.type === 'wikilink') found.push(node)
      else if (node.type !== 'text' && node.type !== 'code') walkInline(node.children)
    }
  }

  const walk = (list: Block[]): void => {
    for (const block of list) {
      switch (block.type) {
        case 'heading':
        case 'paragraph':
          walkInline(block.children)
          break
        case 'quote':
          walk(block.children)
          break
        case 'list':
          for (const item of block.items) walk(item.children)
          break
        case 'table':
          for (const cell of block.header) walkInline(cell)
          for (const row of block.rows) for (const cell of row) walkInline(cell)
          break
        default:
          break
      }
    }
  }

  walk(blocks)
  return found
}

/**
 * The distinct records a note cites, in first-mention order.
 *
 * This is the audit behind PRD B3 — "every claim linked to sources". Embeds and
 * same-note `[[#Section]]` references are not citations and are excluded, so a week whose
 * only links are its own headings reads as uncited, which it is.
 */
export function citedTargets(source: string): string[] {
  const seen = new Map<string, string>()
  for (const link of collectWikilinks(parseNote(source))) {
    if (link.embed || link.target === '') continue
    const key = link.target.trim().toLowerCase()
    if (key !== '' && !seen.has(key)) seen.set(key, link.target.trim())
  }
  return [...seen.values()]
}
