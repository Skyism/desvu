import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { JournalEntry } from '@shared/types'
import { journalRepository } from '../src/main/repos/journalRepository'
import { settingsRepository } from '../src/main/repos/settingsRepository'
import { createTempVault, dayOffset, type TempVault } from './helpers/vault'

let vault: TempVault

beforeEach(async () => {
  vault = await createTempVault('journal')
})

afterEach(async () => {
  await vault.dispose()
})

async function seedDays(offsets: number[]): Promise<void> {
  const now = Date.now()
  await vault.writeJson(
    'data/journal.json',
    offsets.map((offset, index) => ({
      id: `seed-${index}`,
      entry_date: dayOffset(offset),
      rating: 4,
      created_at: now,
      updated_at: now,
    }))
  )
}

describe('journal entries (J0)', () => {
  it('accepts a bare rating as a complete entry', async () => {
    const entry = await journalRepository.upsert({ entry_date: dayOffset(0), rating: 5 })
    expect(entry.rating).toBe(5)
    expect(entry.gratitude_text).toBeUndefined()
    expect(entry.learned).toBeUndefined()
    expect(entry.mood_word).toBeUndefined()
    expect(entry.mood_context).toBeUndefined()
  })

  it('keeps the 1-7 scale so imported 6s and 7s survive', async () => {
    await expect(
      journalRepository.upsert({ entry_date: dayOffset(0), rating: 7 })
    ).resolves.toMatchObject({ rating: 7 })

    await expect(
      journalRepository.upsert({ entry_date: dayOffset(0), rating: 8 as never })
    ).rejects.toThrow(/rating must be from 1 to 7/)

    await expect(
      journalRepository.upsert({ entry_date: dayOffset(0), rating: 0 as never })
    ).rejects.toThrow(/rating must be from 1 to 7/)
  })

  it('upserts rather than refusing a second entry for the same day', async () => {
    const first = await journalRepository.upsert({ entry_date: dayOffset(0), rating: 3 })
    const second = await journalRepository.upsert({
      entry_date: dayOffset(0),
      rating: 6,
      mood_word: 'restless',
    })

    expect(second.id).toBe(first.id)
    expect(second.rating).toBe(6)
    expect(second.mood_word).toBe('restless')
    await expect(journalRepository.list()).resolves.toHaveLength(1)
  })

  it('reads back by date and removes by id', async () => {
    const entry = await journalRepository.upsert({ entry_date: dayOffset(-1), rating: 2 })
    await expect(journalRepository.byDate(dayOffset(-1))).resolves.toMatchObject({ rating: 2 })
    await expect(journalRepository.byDate(dayOffset(-2))).resolves.toBeNull()

    await journalRepository.remove(entry.id)
    await expect(journalRepository.list()).resolves.toEqual([])
    await expect(journalRepository.remove(entry.id)).rejects.toThrow(/No journal entry/)
  })
})

describe('streaks (J6) — never representable as broken', () => {
  it('exposes only current, longest and total', async () => {
    const info = await journalRepository.streak()
    expect(Object.keys(info).sort()).toEqual(['current', 'longest', 'total'])
    expect(info).not.toHaveProperty('broken')
    expect(info).not.toHaveProperty('last_entry')
    expect(info).not.toHaveProperty('days_since')
  })

  it('counts a run ending today', async () => {
    await seedDays([0, -1, -2, -3])
    await expect(journalRepository.streak()).resolves.toMatchObject({ current: 4, total: 4 })
  })

  it('still counts a run ending yesterday — the day is not lost until it is over', async () => {
    await seedDays([-1, -2, -3])
    const info = await journalRepository.streak()
    expect(info.current).toBe(3)
  })

  it('reports 0 rather than anything broken after a 24-day gap', async () => {
    // The real journal's worst gap. Coming back must never produce a guilt state.
    await seedDays([-30, -29, -28, -27, -26, -25])
    const info = await journalRepository.streak()

    expect(info.current).toBe(0)
    expect(info.current).toBeGreaterThanOrEqual(0)
    expect(info.longest).toBe(6)
    expect(info.total).toBe(6)
    expect(JSON.stringify(info)).not.toMatch(/broken|lost|missed|gap/i)
  })

  it('banks the longest streak so it never decreases, even if entries are deleted', async () => {
    await seedDays([-5, -4, -3, -2, -1])
    const before = await journalRepository.streak()
    expect(before.longest).toBe(5)

    await vault.writeJson('data/journal.json', [])
    const after = await journalRepository.streak()

    expect(after.longest).toBe(5)
    expect(after.current).toBe(0)
    expect(after.total).toBe(0)
  })

  it('finds the longest run anywhere in history, not just the recent one', async () => {
    await seedDays([-40, -39, -38, -37, -36, -35, -34, 0])
    const info = await journalRepository.streak()
    expect(info.longest).toBe(7)
    expect(info.current).toBe(1)
  })
})

describe('journal_access projection (J8)', () => {
  const prose = {
    entry_date: dayOffset(0),
    rating: 5 as const,
    gratitude_text: 'a long walk by the river with nobody around',
    learned: 'I procrastinate hardest on the things I care most about',
    mood_word: 'restless',
    mood_context: 'the Ramp rejection landed at 4pm',
  }

  it('hands over full entries when the setting is "full"', async () => {
    await journalRepository.upsert(prose)
    const rows = (await journalRepository.readForAgent()) as JournalEntry[]

    expect(rows).toHaveLength(1)
    expect(rows[0]?.gratitude_text).toContain('long walk')
    expect(rows[0]?.mood_context).toContain('Ramp')
  })

  it('withholds every word of prose when the setting is "metadata"', async () => {
    await journalRepository.upsert(prose)
    await settingsRepository.update({ synthesis: { journal_access: 'metadata' } })

    const rows = await journalRepository.readForAgent()
    const serialized = JSON.stringify(rows)

    expect(serialized).not.toContain('long walk')
    expect(serialized).not.toContain('procrastinate')
    expect(serialized).not.toContain('Ramp')

    expect(rows).toHaveLength(1)
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(['entry_date', 'mood_word', 'rating'])
  })

  it('is enforced in the repository, not by the caller', async () => {
    // The projection is applied on the way out of the repository, so there is no code
    // path that returns prose while the setting says metadata.
    await journalRepository.upsert(prose)
    await settingsRepository.update({ synthesis: { journal_access: 'metadata' } })

    const rows = await journalRepository.readForAgent()
    expect(rows.every((row) => !('gratitude_text' in row) && !('learned' in row))).toBe(true)
  })
})
