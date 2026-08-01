import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isWeekKey, synthesisRepository } from '../src/main/repos/synthesisRepository'
import { createTempVault, type TempVault } from './helpers/vault'

let vault: TempVault

beforeEach(async () => {
  vault = await createTempVault('synthesis')
})

afterEach(async () => {
  await vault.dispose()
})

describe('week keys', () => {
  it('accepts ISO week keys including the 53rd week of a long year', () => {
    expect(isWeekKey('2026-W31')).toBe(true)
    expect(isWeekKey('2026-W01')).toBe(true)
    expect(isWeekKey('2026-W53')).toBe(true)
  })

  it('rejects anything that is not one', () => {
    for (const bad of ['2026-W00', '2026-W54', '2026-W1', '2026-31', 'W31', '', '../secrets']) {
      expect(isWeekKey(bad)).toBe(false)
    }
  })
})

describe('reading the weekly write-up', () => {
  it('lists newest week first and ignores files that are not weeks', async () => {
    await vault.write('Synthesis/2026-W30.md', '# earlier week\n')
    await vault.write('Synthesis/2026-W31.md', '# Week of 27 July\n\nYou shipped it.\n')
    await vault.write('Synthesis/scratch.md', 'a stray note someone dropped in\n')

    const notes = await synthesisRepository.list()
    expect(notes.map((note) => note.week)).toEqual(['2026-W31', '2026-W30'])
    expect(notes.some((note) => note.path.includes('scratch'))).toBe(false)
    expect(notes[0]?.path).toBe('Synthesis/2026-W31.md')
    expect(notes[0]?.body).toContain('You shipped it.')
  })

  it('reads one week whole, body included', async () => {
    await vault.write('Synthesis/2026-W31.md', '# Week of 27 July\n\nSee [[malloc-lab]].\n')
    const note = await synthesisRepository.read('2026-W31')
    expect(note?.week).toBe('2026-W31')
    // Every claim links back to its source, which is what makes this a hub in the graph.
    expect(note?.body).toContain('[[malloc-lab]]')
  })

  it('returns null for a week that has not been written', async () => {
    await expect(synthesisRepository.read('2026-W52')).resolves.toBeNull()
  })

  it('reads as empty when the agent has never run', async () => {
    await expect(synthesisRepository.list()).resolves.toEqual([])
  })

  it('refuses a path traversal rather than joining it', async () => {
    await expect(synthesisRepository.read('../../../etc/passwd')).rejects.toThrow(/ISO week key/)
    await expect(synthesisRepository.read('   ')).rejects.toThrow(/cannot be empty/)
  })
})
