import type { DateString, LibraryItem, LibraryStatus, LibraryType } from '@shared/types'
import { VAULT_SUBDIRS, vaultPath } from '@shared/vault'
import path from 'node:path'
import { atomicWriteFile, readTextFileOrNull } from '../lib/atomic'
import { daysBetween, todayString } from '../lib/dates'
import { NotFoundError, ValidationError } from '../lib/errors'
import {
  parseMarkdown,
  readBoolean,
  readEnum,
  readNumber,
  readString,
  readStringArray,
  serializeMarkdown,
} from '../lib/frontmatter'
import type { Frontmatter } from '../lib/frontmatter'
import { withFileLock } from '../lib/lock'
import { listDirectory, resolveInVault, slugify, toVaultRelative, uniqueName } from '../lib/paths'
import { Issues, checkNonEmptyText, checkNonNegativeInt, checkTags } from '../lib/validate'
import { settingsRepository } from './settingsRepository'

const LIBRARY_TYPES: readonly LibraryType[] = ['article', 'video', 'paper', 'other']
const LIBRARY_STATUSES: readonly LibraryStatus[] = ['unread', 'reading', 'done']

function libraryDir(): string {
  return vaultPath(VAULT_SUBDIRS.library)
}

/**
 * Library items are markdown notes rather than JSON rows (PRD E5) so they show up as
 * nodes in the Obsidian graph and can be `[[linked]]` from brain-dump threads. The file
 * *is* the record; there is no index to fall out of sync with it.
 */
function toItem(relativePath: string, raw: string): LibraryItem {
  const { data, body } = parseMarkdown(raw)
  const fallbackTitle = path.basename(relativePath, '.md').replace(/^\d{4}-\d{2}-\d{2}-/, '')

  return {
    path: relativePath,
    title: readString(data, 'title') ?? fallbackTitle,
    url: readString(data, 'url'),
    type: readEnum(data, 'type', LIBRARY_TYPES, 'article'),
    status: readEnum(data, 'status', LIBRARY_STATUSES, 'unread'),
    source: readString(data, 'source'),
    tags: readStringArray(data, 'tags'),
    estimated_minutes: readNumber(data, 'estimated_minutes'),
    saved: readString(data, 'saved') ?? fallbackDate(relativePath),
    archived: readBoolean(data, 'archived', false),
    body,
  }
}

function fallbackDate(relativePath: string): DateString {
  const match = /(\d{4}-\d{2}-\d{2})/.exec(path.basename(relativePath))
  return match?.[1] ?? todayString()
}

function toFrontmatter(item: LibraryItem, existing: Frontmatter = {}): Frontmatter {
  // Unknown keys a human or an agent added survive the round trip.
  const data: Frontmatter = { ...existing }
  data.title = item.title
  data.url = item.url
  data.type = item.type
  data.status = item.status
  data.source = item.source
  data.tags = item.tags
  data.estimated_minutes = item.estimated_minutes
  data.saved = item.saved
  data.archived = item.archived
  return data
}

async function readItem(relativePath: string): Promise<LibraryItem | null> {
  const absolute = resolveInVault(relativePath, VAULT_SUBDIRS.library)
  const raw = await readTextFileOrNull(absolute)
  if (raw === null) return null
  return toItem(toVaultRelative(absolute), raw)
}

async function readAll(): Promise<LibraryItem[]> {
  const directory = libraryDir()
  const names = (await listDirectory(directory)).filter(
    (name) => name.endsWith('.md') && !name.startsWith('.')
  )

  const items: LibraryItem[] = []
  for (const name of names) {
    const absolute = path.join(directory, name)
    const raw = await readTextFileOrNull(absolute)
    if (raw === null) continue
    items.push(toItem(toVaultRelative(absolute), raw))
  }

  return items.sort((a, b) => b.saved.localeCompare(a.saved) || a.title.localeCompare(b.title))
}

/** Read-modify-write one note under its own lock. */
async function patchItem(
  relativePath: string,
  change: (item: LibraryItem) => LibraryItem
): Promise<LibraryItem> {
  const absolute = resolveInVault(relativePath, VAULT_SUBDIRS.library)

  return withFileLock(absolute, async () => {
    const raw = await readTextFileOrNull(absolute)
    if (raw === null) throw new NotFoundError(`No library item at ${relativePath}`)

    const { data } = parseMarkdown(raw)
    const current = toItem(toVaultRelative(absolute), raw)
    const next = change(current)
    await atomicWriteFile(absolute, serializeMarkdown(toFrontmatter(next, data), next.body))
    return next
  })
}

function hostOf(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

export interface CreateLibraryInput {
  title: string
  url?: string | null
  type?: LibraryType
  tags?: string[]
  estimated_minutes?: number | null
  body?: string
}

export const libraryRepository = {
  /** Archived items are out of the queue by default but never out of the vault (E7). */
  async list(options?: { includeArchived?: boolean }): Promise<LibraryItem[]> {
    const items = await readAll()
    return options?.includeArchived ? items : items.filter((item) => !item.archived)
  },

  async create(input: CreateLibraryInput): Promise<LibraryItem> {
    const issues = new Issues()
    checkNonEmptyText(issues, 'title', input.title)
    if (input.type !== undefined && !LIBRARY_TYPES.includes(input.type)) {
      issues.add(`type must be one of ${LIBRARY_TYPES.join(', ')}`)
    }
    if (input.tags !== undefined) checkTags(issues, 'tags', input.tags)
    if (input.estimated_minutes !== undefined) {
      checkNonNegativeInt(issues, 'estimated_minutes', input.estimated_minutes)
    }
    if (input.url !== undefined && input.url !== null && typeof input.url !== 'string') {
      issues.add('url must be text or null')
    }
    issues.throwIfAny()

    const saved = todayString()
    const directory = libraryDir()

    // The directory lock, not a file lock: two creates in the same tick must not both
    // pick the same free filename.
    return withFileLock(directory, async () => {
      const taken = new Set(
        (await listDirectory(directory))
          .filter((name) => name.endsWith('.md'))
          .map((name) => path.basename(name, '.md'))
      )
      const base = `${saved}-${slugify(input.title)}`
      const name = uniqueName(base, taken)
      const absolute = path.join(directory, `${name}.md`)

      const item: LibraryItem = {
        path: toVaultRelative(absolute),
        title: input.title.trim(),
        url: input.url ?? null,
        type: input.type ?? 'article',
        status: 'unread',
        source: hostOf(input.url ?? null),
        tags: input.tags ?? [],
        estimated_minutes: input.estimated_minutes ?? null,
        saved,
        archived: false,
        body: input.body ?? '',
      }

      await atomicWriteFile(absolute, serializeMarkdown(toFrontmatter(item), item.body))
      return item
    })
  },

  async setStatus(itemPath: string, status: LibraryStatus): Promise<LibraryItem> {
    if (!LIBRARY_STATUSES.includes(status)) {
      throw new ValidationError(`status must be one of ${LIBRARY_STATUSES.join(', ')}`)
    }
    return patchItem(itemPath, (item) => ({ ...item, status }))
  },

  async setArchived(itemPath: string, archived: boolean): Promise<LibraryItem> {
    if (typeof archived !== 'boolean') {
      throw new ValidationError('archived must be true or false')
    }
    return patchItem(itemPath, (item) => ({ ...item, archived }))
  },

  /**
   * "What fits right now" (PRD E6) — the reading queue pointed at the free minutes the
   * Today view already computes. Best fit first: the largest thing that still fits, so a
   * 40-minute gap surfaces the 35-minute paper rather than a 4-minute link.
   */
  async fitting(freeMinutes: number): Promise<LibraryItem[]> {
    const issues = new Issues()
    checkNonNegativeInt(issues, 'freeMinutes', freeMinutes, { nullable: false })
    issues.throwIfAny()

    return (await readAll())
      .filter(
        (item) =>
          !item.archived &&
          item.status !== 'done' &&
          item.estimated_minutes !== null &&
          item.estimated_minutes <= freeMinutes
      )
      .sort(
        (a, b) =>
          (b.estimated_minutes ?? 0) - (a.estimated_minutes ?? 0) ||
          b.saved.localeCompare(a.saved)
      )
  },

  /**
   * PRD E7, the anti-graveyard mechanic. Unread items older than
   * `settings.library.auto_archive_days` leave the queue. Nothing is deleted: the note
   * stays in the vault, in the graph, and in search.
   */
  async runAutoArchive(now: Date = new Date()): Promise<{ archived: number }> {
    const settings = await settingsRepository.get()
    const cutoffDays = settings.library.auto_archive_days
    const today = todayString(now)

    const stale = (await readAll()).filter(
      (item) =>
        !item.archived && item.status === 'unread' && daysBetween(item.saved, today) >= cutoffDays
    )

    for (const item of stale) {
      await patchItem(item.path, (current) => ({ ...current, archived: true }))
    }

    return { archived: stale.length }
  },

  /** Everything including archived — search must reach it (PRD S3). */
  async listAll(): Promise<LibraryItem[]> {
    return readAll()
  },

  readItem,
}

export type LibraryRepository = typeof libraryRepository
