import { readFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { libraryRepository } from '../src/main/repos/libraryRepository'
import {
  DEFAULT_FILTERS,
  applyFilters,
  countsFor,
} from '../src/renderer/src/components/library/library'
import { createTempVault, dayOffset, type TempVault } from './helpers/vault'

/**
 * PRD E7 end to end, from the files on disk through to what the Explore surface renders.
 *
 * The whole mechanic is only trustworthy if "archived" is provably not "deleted", so this
 * suite asserts both halves every time: the item leaves the queue **and** the note is
 * still on disk, still complete, and still reachable through a scope the UI offers.
 */

let vault: TempVault

beforeEach(async () => {
  vault = await createTempVault('library-ui')
})

afterEach(async () => {
  await vault.dispose()
})

async function writeNote(
  name: string,
  frontmatter: Record<string, string>,
  body: string
): Promise<void> {
  const lines = Object.entries(frontmatter).map(([key, value]) => `${key}: ${value}`)
  await vault.write(`Library/${name}`, `---\n${lines.join('\n')}\n---\n\n${body}\n`)
}

async function seed(): Promise<void> {
  await writeNote(
    '2026-01-02-old-unread.md',
    {
      title: 'An old unread thing',
      url: 'https://example.com/old',
      type: 'article',
      status: 'unread',
      source: 'example.com',
      tags: '[distributed-systems]',
      estimated_minutes: '12',
      saved: dayOffset(-60),
      archived: 'false',
    },
    'A summary that must survive being set aside.\n\n## Notes\nMy own notes, also preserved.'
  )

  await writeNote(
    '2026-07-20-old-but-reading.md',
    {
      title: 'Old, but I started it',
      type: 'paper',
      status: 'reading',
      saved: dayOffset(-45),
      archived: 'false',
    },
    'Half read.'
  )

  await writeNote(
    '2026-07-30-recent.md',
    {
      title: 'Saved this week',
      type: 'video',
      status: 'unread',
      estimated_minutes: '20',
      saved: dayOffset(-2),
      archived: 'false',
    },
    'Recent, stays put.'
  )
}

describe('auto-archive takes items out of the queue, not out of the vault (E7)', () => {
  it('archives only unread items past the window', async () => {
    await seed()

    const result = await libraryRepository.runAutoArchive()
    expect(result.archived).toBe(1)

    const queue = await libraryRepository.list()
    expect(queue.map((item) => item.title).sort()).toEqual([
      'Old, but I started it',
      'Saved this week',
    ])
  })

  it('leaves the note on disk, complete, with only one frontmatter key changed', async () => {
    await seed()
    const before = await vault.ls('Library')

    await libraryRepository.runAutoArchive()

    const after = await vault.ls('Library')
    expect(after).toEqual(before) // nothing deleted, nothing renamed, nothing moved

    const raw = await readFile(vault.at('Library', '2026-01-02-old-unread.md'), 'utf8')
    expect(raw).toContain('archived: true')
    expect(raw).toContain('A summary that must survive being set aside.')
    expect(raw).toContain('## Notes')
    expect(raw).toContain('My own notes, also preserved.')
    // Still a markdown note with YAML front matter — Obsidian renders it unchanged (E5).
    expect(raw.startsWith('---\n')).toBe(true)
    expect(raw).toContain('title: An old unread thing')
  })

  it('is idempotent — a second tidy finds nothing and writes nothing', async () => {
    await seed()
    expect((await libraryRepository.runAutoArchive()).archived).toBe(1)
    expect((await libraryRepository.runAutoArchive()).archived).toBe(0)
  })

  it('the archived item is still in listAll, which is what search reads (S3)', async () => {
    await seed()
    await libraryRepository.runAutoArchive()

    const all = await libraryRepository.listAll()
    const archived = all.find((item) => item.title === 'An old unread thing')
    expect(archived).toBeDefined()
    expect(archived?.archived).toBe(true)
    expect(archived?.body).toContain('A summary that must survive being set aside.')
  })
})

describe('what the Explore surface then shows', () => {
  it('drops the archived item from the queue view but keeps it under "set aside"', async () => {
    await seed()
    await libraryRepository.runAutoArchive()
    const items = await libraryRepository.list({ includeArchived: true })

    const queue = applyFilters(items, DEFAULT_FILTERS)
    expect(queue.map((item) => item.title)).not.toContain('An old unread thing')

    const setAside = applyFilters(items, { ...DEFAULT_FILTERS, scope: 'set-aside' })
    expect(setAside.map((item) => item.title)).toEqual(['An old unread thing'])

    const everything = applyFilters(items, { ...DEFAULT_FILTERS, scope: 'everything' })
    expect(everything).toHaveLength(3)
  })

  it('counts it as set aside without losing it from the total', async () => {
    await seed()
    await libraryRepository.runAutoArchive()
    const counts = countsFor(await libraryRepository.list({ includeArchived: true }))

    expect(counts.total).toBe(3)
    expect(counts.queue).toBe(2)
    expect(counts.setAside).toBe(1)
  })

  it('keeps set-aside items out of "what fits right now" (E6)', async () => {
    await seed()
    await libraryRepository.runAutoArchive()

    const fits = await libraryRepository.fitting(30)
    expect(fits.map((item) => item.title)).toEqual(['Saved this week'])
  })

  it('puts an item back in the queue on request, with no other change', async () => {
    await seed()
    await libraryRepository.runAutoArchive()

    const restored = await libraryRepository.setArchived(
      'Library/2026-01-02-old-unread.md',
      false
    )
    expect(restored.archived).toBe(false)
    expect(restored.status).toBe('unread')
    expect(restored.body).toContain('My own notes, also preserved.')

    const queue = await libraryRepository.list()
    expect(queue.map((item) => item.title)).toContain('An old unread thing')
  })
})

describe('marking read (E4)', () => {
  it('cycles status without touching anything else, and never deletes', async () => {
    await seed()
    const path = 'Library/2026-07-30-recent.md'

    for (const status of ['reading', 'done', 'unread'] as const) {
      const updated = await libraryRepository.setStatus(path, status)
      expect(updated.status).toBe(status)
      expect(updated.body).toContain('Recent, stays put.')
    }

    expect(await vault.ls('Library')).toHaveLength(3)
  })

  it('read items are not on the auto-archive clock at all', async () => {
    await writeNote(
      '2026-01-02-read-long-ago.md',
      { title: 'Read months ago', status: 'done', saved: dayOffset(-90), archived: 'false' },
      'Finished.'
    )

    expect((await libraryRepository.runAutoArchive()).archived).toBe(0)
    expect((await libraryRepository.list()).map((item) => item.title)).toEqual(['Read months ago'])
  })
})
