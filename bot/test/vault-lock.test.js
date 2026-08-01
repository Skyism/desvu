/**
 * The cross-process vault lock, per docs/lockfile-protocol.md.
 *
 * Contention is tested against a real child process running a foreign implementation of
 * the protocol, not against another copy of ours.
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { hostname } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, before, after, describe, test } from 'node:test'
import { captureToInbox, appendInboxLine } from '../src/inbox.js'
import {
  LOCK_STALE_MS,
  LOCK_TIMEOUT_MS,
  VAULT_LOCK_FILE,
  VaultLockError,
  configureVaultLock,
  drainVaultLock,
  resetVaultLockConfig,
  vaultLockPath,
  withVaultLock,
} from '../src/vault-lock.js'
import { makeTempVault } from './helpers.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FOREIGN = path.join(HERE, 'helpers', 'foreign-lock-holder.mjs')

let vault

before(async () => {
  vault = await makeTempVault('lock')
})
after(async () => {
  await vault.cleanup()
})
afterEach(() => {
  resetVaultLockConfig()
})

const lockFile = () => vaultLockPath(vault.root)

async function writeLockRecord(record) {
  await writeFile(lockFile(), `${JSON.stringify(record)}\n`, 'utf8')
}

/** A pid that is guaranteed not to be running: spawn something, then wait for it to exit. */
async function deadPid() {
  const child = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' })
  const pid = child.pid
  await new Promise((resolve) => child.on('exit', resolve))
  return pid
}

/** Start the foreign holder and resolve once it reports the lock is actually held. */
function startForeignHolder(args) {
  const child = spawn(process.execPath, [FOREIGN, vault.root, ...args], {
    stdio: ['ignore', 'pipe', 'inherit'],
  })
  const exited = new Promise((resolve) => child.on('exit', resolve))
  const held = new Promise((resolve, reject) => {
    let buffer = ''
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString()
      if (buffer.includes('HELD')) resolve()
    })
    child.on('exit', () => reject(new Error('foreign holder exited before acquiring')))
  })
  return { child, held, exited }
}

describe('protocol constants match the spec', () => {
  test('30s staleness, 10s timeout, data/.desvu.lock', () => {
    assert.equal(LOCK_STALE_MS, 30_000)
    assert.equal(LOCK_TIMEOUT_MS, 10_000)
    assert.equal(VAULT_LOCK_FILE, '.desvu.lock')
    assert.equal(lockFile(), path.join(vault.root, 'data', '.desvu.lock'))
  })
})

describe('lock lifecycle', () => {
  test('an Inbox append takes the lock and cleans it up', async () => {
    const at = new Date(2026, 9, 1, 10, 0, 0)
    await captureToInbox({ text: 'locked capture', at })
    assert.equal(existsSync(lockFile()), false, 'lock must not be left behind')
    const body = await readFile(path.join(vault.root, 'Inbox', '2026-10-01.md'), 'utf8')
    assert.ok(body.includes('locked capture'))
  })

  test('writes a diagnosable record while it is held', async () => {
    let seen = null
    await withVaultLock(
      async () => {
        seen = JSON.parse(await readFile(lockFile(), 'utf8'))
      },
      { root: vault.root }
    )
    assert.equal(seen.pid, process.pid)
    assert.equal(seen.host, hostname())
    assert.equal(seen.holder, 'bot', 'the bot must identify itself as "bot"')
    assert.equal(typeof seen.acquired_at, 'number')
    assert.ok(Math.abs(Date.now() - seen.acquired_at) < 60_000, 'acquired_at is epoch ms')
    assert.equal(existsSync(lockFile()), false)
  })

  test('releases the lock when the operation throws', async () => {
    await assert.rejects(
      () =>
        withVaultLock(
          async () => {
            throw new Error('boom')
          },
          { root: vault.root }
        ),
      /boom/
    )
    assert.equal(existsSync(lockFile()), false, 'a throw must not strand the lock')
  })

  test('leaves no lock behind after many concurrent appends', async () => {
    const at = new Date(2026, 9, 2, 11, 0, 0)
    await Promise.all(
      Array.from({ length: 25 }, (_, i) => captureToInbox({ text: `concurrent lock ${i}`, at }))
    )
    await drainVaultLock()
    assert.equal(existsSync(lockFile()), false)
    const lines = (await readFile(path.join(vault.root, 'Inbox', '2026-10-02.md'), 'utf8'))
      .split('\n')
      .filter((l) => l.startsWith('- [ ] '))
    assert.equal(lines.length, 25)
    assert.equal(new Set(lines).size, 25)
  })
})

describe('two processes contending', () => {
  test('waits for a foreign writer and loses neither line', async () => {
    const at = new Date(2026, 9, 3, 12, 0, 0)
    const dayFile = '2026-10-03.md'
    const foreignLine = '- [ ] 11:59 · sort-inbox · written by the other process'

    // The foreign process holds the lock for 600ms *before* its read-modify-write. An
    // unlocked appender would slip its line in during the hold and then be clobbered by
    // the foreign writer's rename.
    const { held, exited } = startForeignHolder(['600', foreignLine, dayFile])
    await held

    const started = Date.now()
    await captureToInbox({ text: 'written by the bot', at })
    const waited = Date.now() - started
    await exited

    assert.ok(waited >= 250, `bot should have waited for the lock, waited ${waited}ms`)

    const body = await readFile(path.join(vault.root, 'Inbox', dayFile), 'utf8')
    assert.ok(body.includes('written by the other process'), `foreign line lost:\n${body}`)
    assert.ok(body.includes('written by the bot'), `bot line lost:\n${body}`)
    assert.equal(existsSync(lockFile()), false)
  })

  test('a foreign writer waits for us', async () => {
    const dayFile = '2026-10-04.md'
    let foreignExited = null

    await withVaultLock(
      async () => {
        // Spawned while we hold the lock: it must block until we let go. Its exit is
        // awaited *after* the lock is released — awaiting it in here would deadlock.
        foreignExited = startForeignHolder([
          '0',
          '- [ ] 13:01 · sort-inbox · second',
          dayFile,
        ]).exited
        await new Promise((resolve) => setTimeout(resolve, 300))
        await writeFile(
          path.join(vault.root, 'Inbox', dayFile),
          '# 2026-10-04\n\n- [ ] 13:00 · telegram · first\n',
          'utf8'
        )
        // Still ours the whole time we hold it.
        const record = JSON.parse(await readFile(lockFile(), 'utf8'))
        assert.equal(record.pid, process.pid)
      },
      { root: vault.root }
    )

    await foreignExited

    const body = await readFile(path.join(vault.root, 'Inbox', dayFile), 'utf8')
    assert.ok(body.includes('· telegram · first'), `our line lost:\n${body}`)
    assert.ok(body.includes('· sort-inbox · second'), `foreign line lost:\n${body}`)
    assert.equal(existsSync(lockFile()), false)
  })
})

describe('stale lock recovery', () => {
  test('steals a lock whose pid is dead, and says so loudly', async () => {
    await writeLockRecord({
      pid: await deadPid(),
      host: hostname(),
      acquired_at: Date.now() - 60_000,
      holder: 'sort-inbox',
    })

    const warnings = []
    const originalWrite = process.stderr.write.bind(process.stderr)
    process.stderr.write = (chunk, ...rest) => {
      warnings.push(String(chunk))
      return originalWrite(chunk, ...rest)
    }
    try {
      const at = new Date(2026, 9, 5, 14, 0, 0)
      await captureToInbox({ text: 'recovered after a crash', at })
    } finally {
      process.stderr.write = originalWrite
    }

    assert.equal(existsSync(lockFile()), false)
    const body = await readFile(path.join(vault.root, 'Inbox', '2026-10-05.md'), 'utf8')
    assert.ok(body.includes('recovered after a crash'))

    const logged = warnings.join(' ')
    assert.match(logged, /stealing an abandoned vault lock/i)
    assert.ok(logged.includes('sort-inbox'), logged)
  })

  test('steals a truncated lock file once it is older than the staleness window', async () => {
    await writeFile(lockFile(), '{"pid": 12', 'utf8')
    configureVaultLock({ staleMs: 0, timeoutMs: 1000 })
    const at = new Date(2026, 9, 6, 15, 0, 0)
    await captureToInbox({ text: 'recovered from debris', at })
    assert.equal(existsSync(lockFile()), false)
  })

  test('refuses to steal a lock whose process is alive, and fails actionably', async () => {
    const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], {
      stdio: 'ignore',
    })
    try {
      await writeLockRecord({
        pid: child.pid,
        host: hostname(),
        // Far older than the staleness window: age alone must never be enough.
        acquired_at: Date.now() - 10 * 60_000,
        holder: 'sort-inbox',
      })
      configureVaultLock({ timeoutMs: 400 })

      const at = new Date(2026, 9, 7, 16, 0, 0)
      await assert.rejects(
        () => captureToInbox({ text: 'should not land', at }),
        (err) => {
          assert.ok(err instanceof VaultLockError, `expected VaultLockError, got ${err.name}`)
          assert.match(err.message, /Could not get the vault write lock/)
          assert.match(err.message, new RegExp(`sort-inbox \\(pid ${child.pid}`))
          assert.match(err.message, /Nothing was written/)
          assert.match(err.message, /\.desvu\.lock/)
          return true
        }
      )

      // The live holder's lock is untouched, and nothing was written.
      assert.equal(existsSync(lockFile()), true)
      assert.equal(existsSync(path.join(vault.root, 'Inbox', '2026-10-07.md')), false)
    } finally {
      child.kill()
      await new Promise((resolve) => child.on('exit', resolve))
      await writeFile(lockFile(), '', 'utf8').catch(() => {})
      await import('node:fs/promises').then(({ rm }) => rm(lockFile(), { force: true }))
    }
  })

  test('never steals a lock written by another machine, however old', async () => {
    await writeLockRecord({
      pid: 999999,
      host: `${hostname()}-someone-elses-laptop`,
      acquired_at: Date.now() - 24 * 60 * 60_000,
      holder: 'app',
    })
    configureVaultLock({ timeoutMs: 300 })

    const at = new Date(2026, 9, 8, 17, 0, 0)
    await assert.rejects(() => captureToInbox({ text: 'should not land', at }), VaultLockError)
    assert.equal(existsSync(lockFile()), true, 'a foreign host lock is never stolen')
    assert.equal(existsSync(path.join(vault.root, 'Inbox', '2026-10-08.md')), false)

    const { rm } = await import('node:fs/promises')
    await rm(lockFile(), { force: true })
  })

  test('EPERM counts as alive — a root-owned pid is not stolen from', async () => {
    // pid 1 is launchd: it exists, and process.kill(1, 0) raises EPERM for a normal user.
    await writeLockRecord({
      pid: 1,
      host: hostname(),
      acquired_at: Date.now() - 10 * 60_000,
      holder: 'app',
    })
    configureVaultLock({ timeoutMs: 250 })

    const at = new Date(2026, 9, 9, 18, 0, 0)
    await assert.rejects(() => captureToInbox({ text: 'should not land', at }), VaultLockError)
    assert.equal(existsSync(lockFile()), true)

    const { rm } = await import('node:fs/promises')
    await rm(lockFile(), { force: true })
  })

  test('waits out a fresh lock rather than stealing it', async () => {
    await writeLockRecord({
      pid: await deadPid(),
      host: hostname(),
      // Dead pid, but young: staleness is required before the pid check even applies.
      acquired_at: Date.now(),
      holder: 'sort-inbox',
    })
    configureVaultLock({ timeoutMs: 250 })

    const at = new Date(2026, 9, 10, 19, 0, 0)
    await assert.rejects(() => captureToInbox({ text: 'should not land', at }), VaultLockError)
    assert.equal(existsSync(lockFile()), true)

    const { rm } = await import('node:fs/promises')
    await rm(lockFile(), { force: true })
  })
})

describe('release safety', () => {
  test('does not delete a lock that was taken over while we held it', async () => {
    const takeover = {
      pid: 424242,
      host: hostname(),
      acquired_at: Date.now(),
      holder: 'app',
    }

    await withVaultLock(
      async () => {
        // Simulate a third party judging our lock abandoned and replacing the record.
        await writeLockRecord(takeover)
      },
      { root: vault.root }
    )

    assert.equal(existsSync(lockFile()), true, 'someone else holds it now; leave it alone')
    const current = JSON.parse(await readFile(lockFile(), 'utf8'))
    assert.equal(current.pid, takeover.pid)

    const { rm } = await import('node:fs/promises')
    await rm(lockFile(), { force: true })
  })
})

describe('the lock file is not a C7 hole', () => {
  test('the lock lives in data/ and is the only thing written there', async () => {
    assert.equal(path.basename(path.dirname(lockFile())), 'data')
    const at = new Date(2026, 9, 11, 20, 0, 0)
    await appendInboxLine('- [ ] 20:00 · telegram · still only Inbox', { at, root: vault.root })
    const { readdir } = await import('node:fs/promises')
    assert.deepEqual((await readdir(path.join(vault.root, 'data'))).sort(), [])
    assert.equal(existsSync(path.join(vault.root, 'Journal')), false)
    void stat
  })
})
