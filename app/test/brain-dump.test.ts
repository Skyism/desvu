import { readFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { brainDumpRepository } from '../src/main/repos/brainDumpRepository'
import { createTempVault, dayOffset, type TempVault } from './helpers/vault'

let vault: TempVault

beforeEach(async () => {
  vault = await createTempVault('braindump')
})

afterEach(async () => {
  await vault.dispose()
})

const today = () => dayOffset(0)

const EXISTING_THREAD = [
  '---',
  'topic: Recruiting',
  'created: 2026-07-14',
  'updated: 2026-07-14',
  'tags: [interviews, systems-design]',
  '---',
  '',
  '## 2026-07-14',
  'First thought that started this thread.',
  '',
].join('\n')

describe('threads', () => {
  it('creates a thread under its topic folder with a dated block', async () => {
    const thread = await brainDumpRepository.createThread(
      'Recruiting',
      'Systems design prep',
      'Start from the read path, not the write path.'
    )

    expect(thread.path).toBe('Brain Dump/Recruiting/systems-design-prep.md')
    expect(thread.topic).toBe('Recruiting')
    expect(thread.created).toBe(today())

    const raw = await readFile(vault.at(thread.path), 'utf8')
    expect(raw).toContain('topic: Recruiting')
    expect(raw).toContain(`## ${today()}`)
    expect(raw).toContain('Start from the read path')
  })

  it('lists threads and topics', async () => {
    await brainDumpRepository.createThread('Recruiting', 'Interviews', 'a')
    await brainDumpRepository.createThread('School', 'Malloc lab', 'b')

    await expect(brainDumpRepository.listTopics()).resolves.toEqual(['Recruiting', 'School'])
    const threads = await brainDumpRepository.listThreads()
    expect(threads.map((thread) => thread.title).sort()).toEqual(['Interviews', 'Malloc lab'])
  })

  it('reads a hand-written thread and returns null for one that is not there', async () => {
    await vault.write('Brain Dump/Recruiting/systems-design.md', EXISTING_THREAD)

    const thread = await brainDumpRepository.readThread('Brain Dump/Recruiting/systems-design.md')
    expect(thread?.topic).toBe('Recruiting')
    expect(thread?.created).toBe('2026-07-14')
    expect(thread?.tags).toEqual(['interviews', 'systems-design'])
    expect(thread?.body).toContain('## 2026-07-14')

    await expect(brainDumpRepository.readThread('Brain Dump/nope.md')).resolves.toBeNull()
  })
})

describe('appending (B1) — one running document, not one file per day', () => {
  it('appends a dated block to the existing file rather than creating a new one', async () => {
    const path = 'Brain Dump/Recruiting/systems-design.md'
    await vault.write(path, EXISTING_THREAD)

    const updated = await brainDumpRepository.appendToThread(
      path,
      'Later addition. Related: [[Distributed systems reading]].'
    )

    expect(await vault.ls('Brain Dump/Recruiting')).toEqual(['systems-design.md'])
    expect(updated.body).toContain('## 2026-07-14')
    expect(updated.body).toContain(`## ${today()}`)
    expect(updated.body).toContain('First thought that started this thread.')
    expect(updated.updated).toBe(today())

    const raw = await readFile(vault.at(path), 'utf8')
    expect(raw).toContain(`updated: ${today()}`)
    expect(raw.indexOf('## 2026-07-14')).toBeLessThan(raw.indexOf(`## ${today()}`))
  })

  it('joins a second capture on the same day to the same block', async () => {
    const thread = await brainDumpRepository.createThread('Ideas', 'Loose ends', 'first')
    await brainDumpRepository.appendToThread(thread.path, 'second')
    const final = await brainDumpRepository.appendToThread(thread.path, 'third')

    const headings = final.body.match(new RegExp(`## ${today()}`, 'g')) ?? []
    expect(headings).toHaveLength(1)
    expect(final.body).toContain('first')
    expect(final.body).toContain('second')
    expect(final.body).toContain('third')
  })

  it('rejects empty text, a missing thread, and a path outside Brain Dump', async () => {
    const thread = await brainDumpRepository.createThread('Ideas', 'Loose ends', 'first')

    await expect(brainDumpRepository.appendToThread(thread.path, '   ')).rejects.toThrow(
      /text cannot be empty/
    )
    await expect(brainDumpRepository.appendToThread('Brain Dump/ghost.md', 'x')).rejects.toThrow(
      /No brain dump thread at/
    )
    await expect(
      brainDumpRepository.appendToThread('../../secrets.md', 'x')
    ).rejects.toThrow(/outside Brain Dump/)
  })

  it('serializes concurrent appends to the same thread without losing any', async () => {
    const thread = await brainDumpRepository.createThread('Ideas', 'Concurrent', 'seed')

    await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        brainDumpRepository.appendToThread(thread.path, `line ${index}`)
      )
    )

    const final = await brainDumpRepository.readThread(thread.path)
    for (let index = 0; index < 10; index += 1) {
      expect(final?.body).toContain(`line ${index}`)
    }
  })
})
