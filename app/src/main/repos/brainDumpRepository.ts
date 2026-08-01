import path from 'node:path'
import type { BrainDumpThread, DateString } from '@shared/types'
import { VAULT_SUBDIRS, vaultPath } from '@shared/vault'
import { atomicWriteFile, readTextFileOrNull } from '../lib/atomic'
import { todayString } from '../lib/dates'
import { NotFoundError } from '../lib/errors'
import {
  parseMarkdown,
  readString,
  readStringArray,
  serializeMarkdown,
} from '../lib/frontmatter'
import type { Frontmatter } from '../lib/frontmatter'
import { withFileLock } from '../lib/lock'
import {
  listDirectory,
  listDirents,
  resolveInVault,
  slugify,
  toVaultRelative,
  uniqueName,
} from '../lib/paths'
import { Issues, checkNonEmptyText } from '../lib/validate'

function brainDumpDir(): string {
  return vaultPath(VAULT_SUBDIRS.brainDump)
}

/**
 * A thread is a *running document on one subject* (PRD B1) — not one file per day. New
 * captures append a dated block to the file that already exists, so a line of thinking
 * stays in one place and reads top to bottom months later.
 */
function toThread(relativePath: string, raw: string): BrainDumpThread {
  const { data, body } = parseMarkdown(raw)
  const segments = relativePath.split('/')
  const topicFromPath = segments.length >= 3 ? (segments[1] as string) : ''
  const fileName = path.basename(relativePath, '.md')

  const created = readString(data, 'created') ?? firstBlockDate(body) ?? todayString()

  return {
    path: relativePath,
    topic: readString(data, 'topic') ?? topicFromPath,
    title: readString(data, 'title') ?? headingTitle(body) ?? fileName,
    created,
    updated: readString(data, 'updated') ?? lastBlockDate(body) ?? created,
    tags: readStringArray(data, 'tags'),
    body,
  }
}

const BLOCK_HEADING = /^##\s+(\d{4}-\d{2}-\d{2})\s*$/gm

function blockDates(body: string): DateString[] {
  const dates: DateString[] = []
  BLOCK_HEADING.lastIndex = 0
  let match = BLOCK_HEADING.exec(body)
  while (match !== null) {
    dates.push(match[1] as string)
    match = BLOCK_HEADING.exec(body)
  }
  return dates
}

function firstBlockDate(body: string): DateString | null {
  return blockDates(body)[0] ?? null
}

function lastBlockDate(body: string): DateString | null {
  const dates = blockDates(body)
  return dates[dates.length - 1] ?? null
}

function headingTitle(body: string): string | null {
  const match = /^#\s+(.+)$/m.exec(body)
  return match?.[1]?.trim() ?? null
}

function toFrontmatter(thread: BrainDumpThread, existing: Frontmatter = {}): Frontmatter {
  const data: Frontmatter = { ...existing }
  data.topic = thread.topic
  data.title = thread.title
  data.created = thread.created
  data.updated = thread.updated
  data.tags = thread.tags
  return data
}

async function readThreadAt(relativePath: string): Promise<BrainDumpThread | null> {
  const absolute = resolveInVault(relativePath, VAULT_SUBDIRS.brainDump)
  const raw = await readTextFileOrNull(absolute)
  if (raw === null) return null
  return toThread(toVaultRelative(absolute), raw)
}

async function readAll(): Promise<BrainDumpThread[]> {
  const root = brainDumpDir()
  const threads: BrainDumpThread[] = []

  for (const topicEntry of await listDirents(root)) {
    if (!topicEntry.isDirectory() || topicEntry.name.startsWith('.')) continue
    const topicDir = path.join(root, topicEntry.name)

    for (const name of await listDirectory(topicDir)) {
      if (!name.endsWith('.md') || name.startsWith('.')) continue
      const absolute = path.join(topicDir, name)
      const raw = await readTextFileOrNull(absolute)
      if (raw === null) continue
      threads.push(toThread(toVaultRelative(absolute), raw))
    }
  }

  // Loose notes dropped straight into `Brain Dump/` still count as threads.
  for (const name of await listDirectory(root)) {
    if (!name.endsWith('.md') || name.startsWith('.')) continue
    const absolute = path.join(root, name)
    const raw = await readTextFileOrNull(absolute)
    if (raw === null) continue
    threads.push(toThread(toVaultRelative(absolute), raw))
  }

  return threads.sort((a, b) => b.updated.localeCompare(a.updated) || a.title.localeCompare(b.title))
}

/**
 * Append `text` under a `## YYYY-MM-DD` heading. A second capture on the same day joins
 * the existing block instead of repeating the heading.
 */
function appendBlock(body: string, text: string, date: DateString): string {
  const trimmedBody = body.replace(/\s+$/, '')
  const heading = `## ${date}`
  const entry = text.trim()

  if (trimmedBody === '') return `${heading}\n${entry}`

  const dates = blockDates(trimmedBody)
  if (dates[dates.length - 1] === date) {
    return `${trimmedBody}\n\n${entry}`
  }

  return `${trimmedBody}\n\n${heading}\n${entry}`
}

export const brainDumpRepository = {
  async listThreads(): Promise<BrainDumpThread[]> {
    return readAll()
  },

  async readThread(threadPath: string): Promise<BrainDumpThread | null> {
    return readThreadAt(threadPath)
  },

  async appendToThread(threadPath: string, text: string): Promise<BrainDumpThread> {
    const issues = new Issues()
    checkNonEmptyText(issues, 'text', text)
    issues.throwIfAny()

    const absolute = resolveInVault(threadPath, VAULT_SUBDIRS.brainDump)
    const today = todayString()

    return withFileLock(absolute, async () => {
      const raw = await readTextFileOrNull(absolute)
      if (raw === null) throw new NotFoundError(`No brain dump thread at ${threadPath}`)

      const { data } = parseMarkdown(raw)
      const current = toThread(toVaultRelative(absolute), raw)
      const next: BrainDumpThread = {
        ...current,
        body: appendBlock(current.body, text, today),
        updated: today,
      }

      await atomicWriteFile(absolute, serializeMarkdown(toFrontmatter(next, data), next.body))
      return next
    })
  },

  /** Topics are created freely by the sort skill — an unknown one is a new folder. */
  async createThread(topic: string, title: string, text: string): Promise<BrainDumpThread> {
    const issues = new Issues()
    checkNonEmptyText(issues, 'topic', topic)
    checkNonEmptyText(issues, 'title', title)
    checkNonEmptyText(issues, 'text', text)
    issues.throwIfAny()

    const topicName = topic.trim()
    const topicDir = resolveInVault(
      `${VAULT_SUBDIRS.brainDump}/${topicName}`,
      VAULT_SUBDIRS.brainDump
    )
    const today = todayString()

    return withFileLock(topicDir, async () => {
      const taken = new Set(
        (await listDirectory(topicDir))
          .filter((name) => name.endsWith('.md'))
          .map((name) => path.basename(name, '.md'))
      )
      const name = uniqueName(slugify(title), taken)
      const absolute = path.join(topicDir, `${name}.md`)

      const thread: BrainDumpThread = {
        path: toVaultRelative(absolute),
        topic: topicName,
        title: title.trim(),
        created: today,
        updated: today,
        tags: [],
        body: appendBlock('', text, today),
      }

      await atomicWriteFile(absolute, serializeMarkdown(toFrontmatter(thread), thread.body))
      return thread
    })
  },

  async listTopics(): Promise<string[]> {
    const entries = await listDirents(brainDumpDir())
    return entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name.normalize('NFC'))
      .sort((a, b) => a.localeCompare(b))
  },
}

export type BrainDumpRepository = typeof brainDumpRepository
