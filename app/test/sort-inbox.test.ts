import { describe, expect, it } from 'vitest'
import type { SortInboxResult } from '@shared/types'
import { describeResult } from '../src/renderer/src/store/sortInbox'

/**
 * The sort button's honesty guarantees.
 *
 * Running the real CLI costs 40–115 seconds and real tokens, so the spawn itself is not
 * exercised here — see the note in `ipc-contract.test.ts`. What is pinned is everything
 * that decides what the user is *told*, because that is where this feature would fail
 * quietly rather than loudly.
 */

const base: SortInboxResult = {
  ok: true,
  cancelled: false,
  filed: 0,
  needsYou: 0,
  summary: 'whatever the model said',
  duration_ms: 41_000,
}

describe('what the user is told about a finished sort', () => {
  it('reports what was filed', () => {
    expect(describeResult({ ...base, filed: 5 })).toBe('5 filed')
  })

  it('names unsorted leftovers as a decision to make, not a failure', () => {
    const text = describeResult({ ...base, filed: 3, needsYou: 2 })
    expect(text).toContain('3 filed')
    expect(text).toContain('2 still unsorted')
    // Headless cannot ask questions, so it must say where the question can be answered.
    expect(text).toContain('/sort-inbox in Claude Code')
    // Never scolding, never alarming — an unsorted line is a pending decision.
    expect(text).not.toMatch(/fail|error|couldn|unable|problem|\!/i)
  })

  it('says an empty inbox is simply empty', () => {
    expect(describeResult(base)).toBe('Inbox was already clear.')
  })

  it('promises nothing half-written when a run is stopped', () => {
    const text = describeResult({ ...base, cancelled: true })
    expect(text).toContain('Stopped')
    expect(text).toContain('Nothing was left half-filed')
  })
})

describe('the counts cannot be faked by the model', () => {
  it('describes only what the Inbox delta says, ignoring the summary prose', () => {
    // The agent claims five; the Inbox says one moved. The user is told one.
    const result: SortInboxResult = {
      ...base,
      filed: 1,
      needsYou: 0,
      summary: 'I filed 5 captures across todos, finance, meals, workouts and Library.',
    }
    expect(describeResult(result)).toBe('1 filed')
    expect(describeResult(result)).not.toContain('5')
  })
})

describe('permission scope', () => {
  /**
   * Code only. The file explains in prose *why* it does not use the bypass flag, and a
   * naive substring check would fire on that explanation — which would push the next
   * person to delete the comment rather than keep the guarantee.
   */
  async function code(): Promise<string> {
    const raw = await import('node:fs/promises').then((fs) =>
      fs.readFile('src/main/repos/sortInboxRepository.ts', 'utf8')
    )
    return raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  }

  it('never reaches for --dangerously-skip-permissions', async () => {
    const source = await code()
    // A convenience button is not worth unrestricted tool access to the machine.
    expect(source).not.toContain('--dangerously-skip-permissions')
    expect(source).not.toContain('bypassPermissions')
    expect(source).not.toContain('acceptEdits')
  })

  it('passes an explicit allowlist, because headless denies silently without one', async () => {
    const source = await code()
    expect(source).toContain('--allowedTools')
    expect(source).toContain('Bash(python3:*)')
    // Nothing wider than the command file declares.
    expect(source).not.toMatch(/'Bash'[,\]]/)
    expect(source).not.toContain('Bash(*)')
  })

  it('pins DESVU_VAULT so the spawned session cannot pick a different vault', async () => {
    const source = await code()
    expect(source).toContain('DESVU_VAULT: vault')
  })
})
