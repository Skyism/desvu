import { readFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { libraryRepository } from '../src/main/repos/libraryRepository'
import { settingsRepository } from '../src/main/repos/settingsRepository'
import { parseMarkdown } from '../src/main/lib/frontmatter'
import { createTempVault, dayOffset, type TempVault } from './helpers/vault'

let vault: TempVault

beforeEach(async () => {
  vault = await createTempVault('library')
})

afterEach(async () => {
  await vault.dispose()
})

/** A note in exactly the shape `data/SCHEMAS.md` documents, comments included. */
function note(overrides: Partial<Record<string, string>> = {}): string {
  const fields = {
    title: 'Designing Data-Intensive Applications, ch.5',
    url: 'https://example.com/ddia-ch5',
    type: 'article          # article | video | paper | other',
    status: 'unread         # unread | reading | done',
    source: 'news.ycombinator.com',
    tags: '[distributed-systems, databases]',
    estimated_minutes: '12',
    saved: dayOffset(0),
    archived: 'false',
    ...overrides,
  }

  return [
    '---',
    ...Object.entries(fields).map(([key, value]) => `${key}: ${value}`),
    '---',
    '',
    'One-paragraph summary written at save time.',
    '',
    '## Notes',
    'Link freely — [[Replication]], [[15-440]].',
    '',
  ].join('\n')
}

describe('reading library notes', () => {
  it('parses the documented frontmatter, including inline comments and lists', async () => {
    await vault.write('Library/2026-08-01-ddia-ch5.md', note())

    const [item] = await libraryRepository.list()
    expect(item?.title).toBe('Designing Data-Intensive Applications, ch.5')
    expect(item?.url).toBe('https://example.com/ddia-ch5')
    expect(item?.type).toBe('article')
    expect(item?.status).toBe('unread')
    expect(item?.source).toBe('news.ycombinator.com')
    expect(item?.tags).toEqual(['distributed-systems', 'databases'])
    expect(item?.estimated_minutes).toBe(12)
    expect(item?.archived).toBe(false)
    expect(item?.body).toContain('[[Replication]]')
    expect(item?.path).toBe('Library/2026-08-01-ddia-ch5.md')
  })

  it('returns an empty list when the directory does not exist', async () => {
    await expect(libraryRepository.list()).resolves.toEqual([])
  })

  it('survives a note with no frontmatter at all', async () => {
    await vault.write('Library/loose-note.md', 'just some text a human dropped in here\n')
    const [item] = await libraryRepository.list()
    expect(item?.title).toBe('loose-note')
    expect(item?.status).toBe('unread')
  })
})

describe('creating library items (E1, E5)', () => {
  it('writes a markdown note with a dated slug and a derived source', async () => {
    const item = await libraryRepository.create({
      title: 'The Log: What every software engineer should know',
      url: 'https://www.example.org/posts/the-log?utm_source=x',
      type: 'article',
      tags: ['logs', 'kafka'],
      estimated_minutes: 45,
      body: 'A summary.',
    })

    expect(item.path).toMatch(/^Library\/\d{4}-\d{2}-\d{2}-the-log-what-every-software-engineer/)
    expect(item.source).toBe('example.org')
    expect(item.status).toBe('unread')
    expect(item.archived).toBe(false)

    const raw = await readFile(vault.at(item.path), 'utf8')
    expect(raw.startsWith('---\n')).toBe(true)
    const { data, body } = parseMarkdown(raw)
    expect(data.title).toBe('The Log: What every software engineer should know')
    expect(data.tags).toEqual(['logs', 'kafka'])
    expect(body.trim()).toBe('A summary.')
  })

  it('never overwrites an existing note when two saves share a slug', async () => {
    const first = await libraryRepository.create({ title: 'Same Title' })
    const second = await libraryRepository.create({ title: 'Same Title' })

    expect(second.path).not.toBe(first.path)
    expect(await libraryRepository.list()).toHaveLength(2)
  })

  it('rejects an empty title and an unknown type', async () => {
    await expect(libraryRepository.create({ title: '  ' })).rejects.toThrow(/title cannot be empty/)
    await expect(
      libraryRepository.create({ title: 'x', type: 'tweet' as never })
    ).rejects.toThrow(/type must be one of/)
  })
})

describe('status and archiving (E4, E7)', () => {
  it('round-trips a status change without losing the body or unknown keys', async () => {
    await vault.write('Library/2026-08-01-ddia-ch5.md', note({ mycustomkey: 'kept' }))

    const updated = await libraryRepository.setStatus('Library/2026-08-01-ddia-ch5.md', 'reading')
    expect(updated.status).toBe('reading')

    const raw = await readFile(vault.at('Library/2026-08-01-ddia-ch5.md'), 'utf8')
    const { data, body } = parseMarkdown(raw)
    expect(data.status).toBe('reading')
    expect(data.mycustomkey).toBe('kept')
    expect(body).toContain('[[Replication]]')
  })

  it('hides archived items from the queue but keeps them in the vault', async () => {
    const item = await libraryRepository.create({ title: 'old link' })
    await libraryRepository.setArchived(item.path, true)

    await expect(libraryRepository.list()).resolves.toEqual([])
    await expect(libraryRepository.list({ includeArchived: true })).resolves.toHaveLength(1)
    await expect(libraryRepository.listAll()).resolves.toHaveLength(1)
    expect(await vault.ls('Library')).toHaveLength(1)
  })

  it('auto-archives unread items past the configured age, and nothing else', async () => {
    await vault.write('Library/old-unread.md', note({ saved: dayOffset(-31), status: 'unread' }))
    await vault.write('Library/old-reading.md', note({ saved: dayOffset(-31), status: 'reading' }))
    await vault.write('Library/old-done.md', note({ saved: dayOffset(-31), status: 'done' }))
    await vault.write('Library/new-unread.md', note({ saved: dayOffset(-3), status: 'unread' }))

    const result = await libraryRepository.runAutoArchive()
    expect(result.archived).toBe(1)

    const all = await libraryRepository.listAll()
    const byPath = new Map(all.map((item) => [item.path, item]))
    expect(byPath.get('Library/old-unread.md')?.archived).toBe(true)
    expect(byPath.get('Library/old-reading.md')?.archived).toBe(false)
    expect(byPath.get('Library/old-done.md')?.archived).toBe(false)
    expect(byPath.get('Library/new-unread.md')?.archived).toBe(false)
  })

  it('honours a changed auto_archive_days and is idempotent', async () => {
    await settingsRepository.update({ library: { auto_archive_days: 7 } })
    await vault.write('Library/week-old.md', note({ saved: dayOffset(-8) }))

    await expect(libraryRepository.runAutoArchive()).resolves.toEqual({ archived: 1 })
    await expect(libraryRepository.runAutoArchive()).resolves.toEqual({ archived: 0 })
  })

  it('reports a clear error for a path that is not there, and refuses to escape the vault', async () => {
    await expect(libraryRepository.setStatus('Library/ghost.md', 'done')).rejects.toThrow(
      /No library item at/
    )
    await expect(
      libraryRepository.setArchived('../../../etc/hosts', true)
    ).rejects.toThrow(/outside Library/)
  })
})

describe('fitting (E6)', () => {
  it('surfaces the best use of the gap, largest first, ignoring archived and done', async () => {
    await vault.write('Library/short.md', note({ estimated_minutes: '10' }))
    await vault.write('Library/perfect.md', note({ estimated_minutes: '35' }))
    await vault.write('Library/toolong.md', note({ estimated_minutes: '90' }))
    await vault.write('Library/done.md', note({ estimated_minutes: '20', status: 'done' }))
    await vault.write('Library/archived.md', note({ estimated_minutes: '15', archived: 'true' }))
    await vault.write('Library/untimed.md', note({ estimated_minutes: '' }))

    const fits = await libraryRepository.fitting(40)
    expect(fits.map((item) => item.path)).toEqual(['Library/perfect.md', 'Library/short.md'])
  })

  it('rejects a negative window', async () => {
    await expect(libraryRepository.fitting(-5)).rejects.toThrow(/cannot be negative/)
  })
})
