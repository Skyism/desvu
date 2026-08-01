/**
 * A foreign implementation of the vault lock protocol, standing in for `/sort-inbox`.
 *
 * It shares no code with `src/vault-lock.js` on purpose: the test is that the protocol in
 * `docs/lockfile-protocol.md` is reimplementable from the document alone, not that our
 * implementation can talk to itself.
 *
 *   node foreign-lock-holder.mjs <vaultRoot> <holdMs> [lineToAppend] [dayFile]
 *
 * Acquires the lock, prints `HELD` on stdout so the parent knows the window has opened,
 * holds it for `holdMs`, optionally does a read-modify-write of an Inbox day file — the
 * exact cycle an atomic append cannot defend against — then releases and prints `RELEASED`.
 */
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import { hostname } from 'node:os'
import path from 'node:path'

const [vaultRoot, holdMsRaw, line, dayFile] = process.argv.slice(2)
const holdMs = Number(holdMsRaw ?? 0)

// This is a spawned helper, not a test file. `npm test` uses an explicit glob so it is
// never collected, but bare `node --test` would otherwise execute it with no arguments.
if (!vaultRoot) {
  process.exit(0)
}

const lockPath = path.join(vaultRoot, 'data', '.desvu.lock')

/** Synchronous sleep — Node permits Atomics.wait on the main thread. */
function sleep(ms) {
  if (ms > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function acquire() {
  const deadline = Date.now() + 10_000
  mkdirSync(path.dirname(lockPath), { recursive: true })
  for (;;) {
    try {
      const fd = openSync(lockPath, 'wx') // O_CREAT | O_EXCL
      const record = {
        pid: process.pid,
        host: hostname(),
        acquired_at: Date.now(),
        holder: 'sort-inbox',
      }
      writeSync(fd, `${JSON.stringify(record)}\n`)
      fsyncSync(fd)
      closeSync(fd)
      return record
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      if (Date.now() > deadline) throw new Error('foreign writer could not get the lock')
      sleep(20)
    }
  }
}

function release(record) {
  try {
    const current = JSON.parse(readFileSync(lockPath, 'utf8'))
    if (current.pid !== record.pid || current.acquired_at !== record.acquired_at) return
  } catch {
    return
  }
  unlinkSync(lockPath)
}

const held = acquire()
process.stdout.write('HELD\n')
try {
  sleep(holdMs)

  if (line && dayFile) {
    // Read-modify-write of the whole file, via temp + rename, exactly as the app does.
    const target = path.join(vaultRoot, 'Inbox', dayFile)
    mkdirSync(path.dirname(target), { recursive: true })
    let body = ''
    try {
      body = readFileSync(target, 'utf8')
    } catch {
      body = `# ${dayFile.replace(/\.md$/, '')}\n\n`
    }
    const temp = `${target}.tmp-${process.pid}`
    writeFileSync(temp, `${body}${line}\n`, 'utf8')
    renameSync(temp, target)
  }
} finally {
  release(held)
  process.stdout.write('RELEASED\n')
}
