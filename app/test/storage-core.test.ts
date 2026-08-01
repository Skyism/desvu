import { readFile, readdir, writeFile } from 'node:fs/promises'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { atomicWriteFile } from '../src/main/lib/atomic'
import { CorruptFileError } from '../src/main/lib/errors'
import { createJsonStore, expectArray } from '../src/main/lib/json-store'
import { withFileLock } from '../src/main/lib/lock'
import { todoRepository } from '../src/main/repos/todoRepository'
import { createTempVault, type TempVault } from './helpers/vault'

let vault: TempVault

beforeEach(async () => {
  vault = await createTempVault('core')
})

afterEach(async () => {
  await vault.dispose()
})

describe('mutation lock', () => {
  it('runs operations one at a time, never interleaved', async () => {
    const events: string[] = []

    const slow = withFileLock('/tmp/fake-key', async () => {
      events.push('a:start')
      await new Promise((resolve) => setTimeout(resolve, 25))
      events.push('a:end')
    })

    const fast = withFileLock('/tmp/fake-key', async () => {
      events.push('b:start')
      events.push('b:end')
    })

    await Promise.all([slow, fast])
    expect(events).toEqual(['a:start', 'a:end', 'b:start', 'b:end'])
  })

  it('does not wedge the queue when an operation throws', async () => {
    const failing = withFileLock('/tmp/fake-key-2', async () => {
      throw new Error('boom')
    })
    await expect(failing).rejects.toThrow('boom')

    await expect(withFileLock('/tmp/fake-key-2', async () => 'still works')).resolves.toBe(
      'still works'
    )
  })

  it('serializes concurrent writes so no record is lost to a read-modify-write race', async () => {
    const count = 30
    await Promise.all(
      Array.from({ length: count }, (_, index) =>
        todoRepository.create({ text: `concurrent ${index}`, category: 'school' })
      )
    )

    const onDisk = JSON.parse(await readFile(vault.at('data', 'todos.json'), 'utf8'))
    expect(onDisk).toHaveLength(count)
    expect(new Set(onDisk.map((todo: { text: string }) => todo.text)).size).toBe(count)
  })

  it('keeps separate files independent — one file`s lock does not block another', async () => {
    const order: string[] = []
    const held = withFileLock('/tmp/file-one', async () => {
      await new Promise((resolve) => setTimeout(resolve, 30))
      order.push('one')
    })
    const other = withFileLock('/tmp/file-two', async () => {
      order.push('two')
    })

    await Promise.all([held, other])
    expect(order).toEqual(['two', 'one'])
  })
})

describe('atomic writes', () => {
  it('leaves no temp files behind', async () => {
    const target = vault.at('data', 'atomic.json')
    await Promise.all(
      Array.from({ length: 20 }, (_, index) => atomicWriteFile(target, `{"n":${index}}\n`))
    )

    const entries = await readdir(vault.at('data'))
    expect(entries.filter((name) => name.includes('.tmp'))).toEqual([])
    expect(entries).toContain('atomic.json')
  })

  it('cleans up its temp file when the write fails', async () => {
    // A directory cannot be replaced by a file rename, so this fails after the temp file
    // has already been created.
    const target = vault.at('data')
    await expect(atomicWriteFile(target, 'nope')).rejects.toThrow()

    const entries = await readdir(vault.root)
    expect(entries.filter((name) => name.includes('.tmp'))).toEqual([])
  })

  it('never exposes a partially written file to a concurrent reader', async () => {
    const target = vault.at('data', 'todos.json')
    const big = JSON.stringify(
      Array.from({ length: 400 }, (_, index) => ({ id: String(index), text: 'x'.repeat(200) })),
      null,
      2
    )

    let stop = false
    const reader = (async () => {
      const seen: number[] = []
      while (!stop) {
        try {
          const raw = await readFile(target, 'utf8')
          seen.push(JSON.parse(raw).length) // throws if a torn write is ever visible
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
      }
      return seen
    })()

    for (let round = 0; round < 15; round += 1) {
      await atomicWriteFile(target, round % 2 === 0 ? big : '[]')
    }
    stop = true

    await expect(reader).resolves.toBeInstanceOf(Array)
  })
})

describe('reading files', () => {
  it('treats a missing file as an empty collection', async () => {
    await expect(todoRepository.list()).resolves.toEqual([])
  })

  it('treats a zero-byte file as an empty collection', async () => {
    await writeFile(vault.at('data', 'todos.json'), '', 'utf8')
    await expect(todoRepository.list()).resolves.toEqual([])
  })

  it('fails loudly with the path when the JSON is malformed, and writes nothing', async () => {
    const target = vault.at('data', 'todos.json')
    const damaged = '[{"id": "1", "text": "half a rec'
    await writeFile(target, damaged, 'utf8')

    await expect(todoRepository.list()).rejects.toThrow(/todos\.json/)
    await expect(todoRepository.create({ text: 'should not land' })).rejects.toThrow(/todos\.json/)

    // The damaged bytes are still there — the user's data was not replaced.
    expect(await readFile(target, 'utf8')).toBe(damaged)
  })

  it('rejects a file whose top level is the wrong shape', async () => {
    const store = createJsonStore<unknown[]>(
      () => vault.at('data', 'shape.json'),
      () => [],
      (parsed, filePath) => expectArray(parsed, filePath)
    )
    await writeFile(vault.at('data', 'shape.json'), '{"not":"an array"}', 'utf8')

    await expect(store.read()).rejects.toBeInstanceOf(CorruptFileError)
    await expect(store.read()).rejects.toThrow(/not a JSON array/)
  })
})
