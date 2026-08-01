import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { hostname } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createJsonStore, expectArray } from '../src/main/lib/json-store'
import {
  LOCK_STALE_MS,
  LOCK_TIMEOUT_MS,
  VAULT_LOCK_FILE,
  configureVaultLock,
  vaultLockPath,
  withVaultLock,
} from '../src/main/lib/vault-lock'
import { todoRepository } from '../src/main/repos/todoRepository'
import { createTempVault, type TempVault } from './helpers/vault'

const FOREIGN_WRITER = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  'helpers',
  'foreign-writer.mjs'
)

let vault: TempVault

beforeEach(async () => {
  vault = await createTempVault('lock')
  configureVaultLock({ timeoutMs: LOCK_TIMEOUT_MS, staleMs: LOCK_STALE_MS, holder: 'app' })
})

afterEach(async () => {
  configureVaultLock({ timeoutMs: LOCK_TIMEOUT_MS, staleMs: LOCK_STALE_MS, holder: 'app' })
  vi.restoreAllMocks()
  await vault.dispose()
})

const lockFile = () => vault.at('data', VAULT_LOCK_FILE)

async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (await predicate()) return
    if (Date.now() > deadline) throw new Error('timed out waiting for a condition')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

async function readTodos(): Promise<{ id: string; text: string }[]> {
  return JSON.parse(await readFile(vault.at('data', 'todos.json'), 'utf8'))
}

function writeLockRecord(record: Record<string, unknown>): Promise<void> {
  return writeFile(lockFile(), `${JSON.stringify(record)}\n`, 'utf8')
}

/** A pid that has definitely exited — a real process we started and reaped. */
async function deadPid(): Promise<number> {
  const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' })
  const pid = child.pid as number
  await new Promise((resolve) => child.on('exit', resolve))
  // Give the OS a moment to actually reap it.
  await new Promise((resolve) => setTimeout(resolve, 50))
  return pid
}

describe('lock lifecycle', () => {
  it('resolves the lock inside data/ and cleans it up after a write', async () => {
    expect(vaultLockPath()).toBe(lockFile())

    await todoRepository.create({ text: 'a todo' })
    expect(existsSync(lockFile())).toBe(false)
  })

  it('leaves no lock behind after many concurrent writes', async () => {
    await Promise.all(
      Array.from({ length: 15 }, (_, index) => todoRepository.create({ text: `todo ${index}` }))
    )
    expect(existsSync(lockFile())).toBe(false)
    await expect(readTodos()).resolves.toHaveLength(15)
  })

  it('writes a diagnosable record while it is held', async () => {
    let seen: Record<string, unknown> = {}
    await withVaultLock(async () => {
      seen = JSON.parse(await readFile(lockFile(), 'utf8'))
    })

    expect(seen.pid).toBe(process.pid)
    expect(seen.host).toBe(hostname())
    expect(seen.holder).toBe('app')
    expect(typeof seen.acquired_at).toBe('number')
    expect(Date.now() - (seen.acquired_at as number)).toBeLessThan(5000)
  })

  it('releases the lock when the operation throws', async () => {
    const store = createJsonStore<unknown[]>(
      () => vault.at('data', 'todos.json'),
      () => [],
      (parsed, filePath) => expectArray(parsed, filePath)
    )

    await expect(
      store.mutate(() => {
        throw new Error('validation blew up mid-mutation')
      })
    ).rejects.toThrow('validation blew up mid-mutation')

    expect(existsSync(lockFile())).toBe(false)
    // And the next write still works, so nothing is wedged.
    await expect(todoRepository.create({ text: 'after the failure' })).resolves.toBeDefined()
  })

  it('releases the lock when the operation rejects', async () => {
    await expect(
      withVaultLock(async () => {
        throw new Error('async failure')
      })
    ).rejects.toThrow('async failure')
    expect(existsSync(lockFile())).toBe(false)
  })
})

describe('two processes contending', () => {
  it('waits for a foreign writer and loses neither record', async () => {
    const child = spawn(process.execPath, [FOREIGN_WRITER, vault.root, '500', 'from-sort-inbox'], {
      stdio: 'inherit',
    })
    const exited = new Promise<number>((resolve) => child.on('exit', (code) => resolve(code ?? 0)))

    // Wait until the foreign process actually holds the lock, so the app's write is
    // guaranteed to contend rather than slipping in first.
    await waitFor(async () => {
      if (!existsSync(lockFile())) return false
      const raw = await readFile(lockFile(), 'utf8').catch(() => '')
      return raw.includes('sort-inbox')
    })

    const startedAt = Date.now()
    await todoRepository.create({ text: 'from the app' })
    const waited = Date.now() - startedAt

    await expect(exited).resolves.toBe(0)

    const todos = await readTodos()
    expect(todos.map((todo) => todo.text).sort()).toEqual(['from the app', 'from-sort-inbox'])

    // It genuinely blocked rather than racing through: the foreign writer holds for 500ms
    // before it writes anything at all.
    expect(waited).toBeGreaterThan(250)
    expect(existsSync(lockFile())).toBe(false)
  }, 20_000)

  it('lets a foreign writer wait for us', async () => {
    const child = spawn(process.execPath, [FOREIGN_WRITER, vault.root, '0', 'second'], {
      stdio: 'inherit',
    })
    const exited = new Promise<number>((resolve) => child.on('exit', (code) => resolve(code ?? 0)))

    await withVaultLock(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300))
      await writeFile(
        vault.at('data', 'todos.json'),
        `${JSON.stringify([{ id: 'first', text: 'first' }], null, 2)}\n`,
        'utf8'
      )
    })

    await expect(exited).resolves.toBe(0)
    const todos = await readTodos()
    expect(todos.map((todo) => todo.text).sort()).toEqual(['first', 'second'])
  }, 20_000)
})

describe('stale lock recovery', () => {
  it('steals a lock whose pid is dead, and says so loudly', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    await writeLockRecord({
      pid: await deadPid(),
      host: hostname(),
      acquired_at: Date.now() - 60_000,
      holder: 'sort-inbox',
    })

    await expect(todoRepository.create({ text: 'recovered' })).resolves.toBeDefined()
    expect(existsSync(lockFile())).toBe(false)

    expect(warn).toHaveBeenCalled()
    const message = warn.mock.calls.flat().join(' ')
    expect(message).toMatch(/Stealing an abandoned vault lock/)
    expect(message).toContain('sort-inbox')
  })

  it('steals a truncated lock file once it is older than the staleness window', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await writeFile(lockFile(), '{"pid": 12', 'utf8')
    configureVaultLock({ staleMs: 0, timeoutMs: 1000 })

    await expect(todoRepository.create({ text: 'recovered from debris' })).resolves.toBeDefined()
  })

  it('refuses to steal a lock whose process is alive, and fails with an actionable error', async () => {
    const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], {
      stdio: 'ignore',
    })
    try {
      await writeLockRecord({
        pid: child.pid,
        host: hostname(),
        // Far older than the staleness window: age alone must not be enough.
        acquired_at: Date.now() - 10 * 60_000,
        holder: 'sort-inbox',
      })
      configureVaultLock({ timeoutMs: 400 })

      await expect(todoRepository.create({ text: 'should not land' })).rejects.toThrow(
        /Could not get the vault write lock/
      )
      await expect(todoRepository.create({ text: 'should not land' })).rejects.toThrow(
        new RegExp(`sort-inbox \\(pid ${child.pid}`)
      )
      // The error tells the user exactly what to delete if they are sure.
      await expect(todoRepository.create({ text: 'should not land' })).rejects.toThrow(
        /\.desvu\.lock/
      )

      // The live holder's lock is still there, untouched.
      expect(existsSync(lockFile())).toBe(true)
      await expect(readTodos()).rejects.toThrow()
    } finally {
      child.kill()
    }
  }, 20_000)

  it('never steals a lock written by another machine, however old', async () => {
    await writeLockRecord({
      pid: 1,
      host: `${hostname()}-someone-elses-laptop`,
      acquired_at: Date.now() - 24 * 60 * 60_000,
      holder: 'app',
    })
    configureVaultLock({ timeoutMs: 300 })

    await expect(todoRepository.create({ text: 'should not land' })).rejects.toThrow(
      /Could not get the vault write lock/
    )
    expect(existsSync(lockFile())).toBe(true)
  })

  it('waits out a fresh lock rather than stealing it', async () => {
    await writeLockRecord({
      pid: await deadPid(),
      host: hostname(),
      // Dead pid, but young: staleness is required before the pid check even applies.
      acquired_at: Date.now(),
      holder: 'sort-inbox',
    })
    configureVaultLock({ timeoutMs: 250 })

    await expect(todoRepository.create({ text: 'should not land' })).rejects.toThrow(
      /Could not get the vault write lock/
    )
  })
})
