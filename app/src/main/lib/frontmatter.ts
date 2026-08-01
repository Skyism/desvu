/**
 * A deliberately small YAML front-matter reader/writer.
 *
 * Only the subset the vault actually uses is supported: flat scalar keys, inline
 * `[a, b]` lists, `- item` block lists, quoted strings, numbers, booleans, null, and
 * trailing `# comments`. Nested maps are not — nothing in `data/SCHEMAS.md` has any, and
 * pulling a full YAML engine into the main process to parse eight keys is not a trade
 * worth making. Unknown keys survive a read/write round trip untouched.
 */

export type FrontmatterValue = string | number | boolean | null | string[]
export type Frontmatter = Record<string, FrontmatterValue>

export interface ParsedMarkdown {
  data: Frontmatter
  body: string
}

const FENCE = /^---\s*$/
const CLOSING_FENCE = /^(---|\.\.\.)\s*$/

export function parseMarkdown(raw: string): ParsedMarkdown {
  const text = raw.replace(/^﻿/, '')
  const lines = text.split(/\r?\n/)

  if (lines.length === 0 || !FENCE.test(lines[0] ?? '')) {
    return { data: {}, body: text.replace(/^\n+/, '') }
  }

  let end = -1
  for (let index = 1; index < lines.length; index += 1) {
    if (CLOSING_FENCE.test(lines[index] ?? '')) {
      end = index
      break
    }
  }

  // An unterminated fence is not front matter — treat the whole file as body rather
  // than swallowing it.
  if (end === -1) return { data: {}, body: text.replace(/^\n+/, '') }

  const data = parseFrontmatterLines(lines.slice(1, end))
  const body = lines
    .slice(end + 1)
    .join('\n')
    .replace(/^\n+/, '')

  return { data, body }
}

function parseFrontmatterLines(lines: string[]): Frontmatter {
  const data: Frontmatter = {}
  let lastKey: string | null = null

  for (const line of lines) {
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue

    const blockItem = /^\s*-\s+(.*)$/.exec(line)
    if (blockItem && lastKey) {
      const existing = data[lastKey]
      const item = String(parseScalar(blockItem[1] ?? ''))
      if (Array.isArray(existing)) existing.push(item)
      else data[lastKey] = [item]
      continue
    }

    const pair = /^([A-Za-z0-9_.-]+)\s*:\s?(.*)$/.exec(line)
    if (!pair) continue

    const key = pair[1] as string
    const rest = (pair[2] ?? '').trim()
    lastKey = key
    // An empty value is either null or the header of a `- item` block below it.
    data[key] = rest === '' ? null : parseScalar(rest)
  }

  return data
}

function stripComment(value: string): string {
  // Only a `#` that follows whitespace starts a comment; `#tag` inside a value does not.
  const match = /\s+#/.exec(value)
  return match ? value.slice(0, match.index).trim() : value.trim()
}

function unquote(value: string): string | null {
  if (value.length >= 2) {
    const first = value[0]
    const last = value[value.length - 1]
    if (first === '"' && last === '"') {
      return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
    }
    if (first === "'" && last === "'") {
      return value.slice(1, -1).replace(/''/g, "'")
    }
  }
  return null
}

function parseScalar(raw: string): FrontmatterValue {
  const trimmed = raw.trim()

  const quoted = unquote(trimmed)
  if (quoted !== null) return quoted

  const value = stripComment(trimmed)
  if (value === '' || value === 'null' || value === '~') return null
  if (value === 'true') return true
  if (value === 'false') return false

  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim()
    if (inner === '') return []
    return inner
      .split(',')
      .map((item) => {
        const piece = item.trim()
        return unquote(piece) ?? piece
      })
      .filter((item) => item !== '')
  }

  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value)

  return value
}

const NEEDS_QUOTES = /^\s|\s$|[:#[\]{}&*!|>%@`,"']|^-/

function quoteIfNeeded(value: string): string {
  const looksLikeSomethingElse =
    value === '' ||
    value === 'true' ||
    value === 'false' ||
    value === 'null' ||
    value === '~' ||
    /^-?\d+(\.\d+)?$/.test(value)

  if (looksLikeSomethingElse || NEEDS_QUOTES.test(value)) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  }
  return value
}

export function serializeMarkdown(data: Frontmatter, body: string): string {
  const lines: string[] = ['---']

  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) {
      // `key:` reads as null in every YAML parser and looks clean in Obsidian.
      lines.push(`${key}:`)
    } else if (Array.isArray(value)) {
      lines.push(`${key}: [${value.map((item) => quoteIfNeeded(String(item))).join(', ')}]`)
    } else if (typeof value === 'string') {
      lines.push(`${key}: ${quoteIfNeeded(value)}`)
    } else {
      lines.push(`${key}: ${String(value)}`)
    }
  }

  lines.push('---', '')
  const trimmedBody = body.replace(/^\n+/, '').replace(/\s+$/, '')
  return `${lines.join('\n')}\n${trimmedBody}\n`
}

// --- typed readers -------------------------------------------------------------------

export function readString(data: Frontmatter, key: string): string | null {
  const value = data[key]
  if (value === null || value === undefined) return null
  if (Array.isArray(value)) return value.join(', ')
  const text = String(value).trim()
  return text === '' ? null : text
}

export function readNumber(data: Frontmatter, key: string): number | null {
  const value = data[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())) return Number(value)
  return null
}

export function readBoolean(data: Frontmatter, key: string, fallback = false): boolean {
  const value = data[key]
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase()
    if (text === 'true' || text === 'yes') return true
    if (text === 'false' || text === 'no') return false
  }
  return fallback
}

export function readStringArray(data: Frontmatter, key: string): string[] {
  const value = data[key]
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean)
  if (typeof value === 'string' && value.trim() !== '') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
  }
  return []
}

/** Restrict a value to a known set, falling back when the file says something unexpected. */
export function readEnum<T extends string>(
  data: Frontmatter,
  key: string,
  allowed: readonly T[],
  fallback: T
): T {
  const value = readString(data, key)
  if (value && (allowed as readonly string[]).includes(value)) return value as T
  return fallback
}
