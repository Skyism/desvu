/**
 * A deliberately *foreign* implementation of the vault lock protocol.
 *
 * This stands in for `/sort-inbox`, which is a separate Python process. It shares no code
 * with `src/main/lib/vault-lock.ts` on purpose — the point of the test is that the
 * protocol in `docs/lockfile-protocol.md` is reimplementable from the document alone, not
 * that our implementation can talk to itself.
 *
 *   node foreign-writer.mjs <vaultRoot> <holdMs> <recordId>
 *
 * Acquires the lock, holds it for `holdMs` *before* writing, then read-modify-writes
 * `data/todos.json` and releases. Holding before writing is what makes a lost update
 * visible: an unlocked competitor reads the file during the hold and clobbers this
 * record when it writes back.
 */
import {
  closeSync,
  fsyncSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from 'node:fs'
import { hostname } from 'node:os'
import path from 'node:path'

const [vaultRoot, holdMsRaw, recordId] = process.argv.slice(2)
const holdMs = Number(holdMsRaw ?? 0)

const lockPath = path.join(vaultRoot, 'data', '.desvu.lock')
const todosPath = path.join(vaultRoot, 'data', 'todos.json')

/** Synchronous sleep — Node permits Atomics.wait on the main thread. */
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function acquire() {
  const deadline = Date.now() + 10_000
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
try {
  sleep(holdMs)

  let todos = []
  try {
    const raw = readFileSync(todosPath, 'utf8')
    if (raw.trim() !== '') todos = JSON.parse(raw)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  const now = Date.now()
  todos.push({
    id: recordId,
    text: recordId,
    category: 'personal',
    priority: 2,
    estimate_minutes: null,
    actual_minutes: null,
    due: null,
    status: 'open',
    recurrence: null,
    recurrence_parent: null,
    tags: [],
    notes: '',
    source: 'import',
    created_at: now,
    updated_at: now,
    completed_at: null,
  })

  const temp = path.join(vaultRoot, 'data', '.todos.json.foreign.tmp')
  writeFileSync(temp, `${JSON.stringify(todos, null, 2)}\n`, 'utf8')
  renameSync(temp, todosPath)
} finally {
  release(held)
}
