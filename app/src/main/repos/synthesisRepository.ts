import path from 'node:path'
import type { SynthesisNote } from '@shared/types'
import { VAULT_SUBDIRS, vaultPath } from '@shared/vault'
import { readTextFileOrNull } from '../lib/atomic'
import { listDirectory } from '../lib/paths'
import { Issues, checkNonEmptyText } from '../lib/validate'

/**
 * `Synthesis/YYYY-Www.md` — the weekly write-up.
 *
 * Read-only to the app. These files are written by the synthesis agent, and every claim in
 * them links back to the record it came from, which is what makes a synthesis note a hub in
 * the Obsidian graph. Bodies are returned whole because the folder is one small file per
 * week; there is no paging worth building here.
 */

/** `2026-W31`. Anchored so a stray `Synthesis/notes.md` is ignored rather than half-parsed. */
const WEEK_KEY = /^(\d{4})-W(\d{2})$/

export function isWeekKey(value: string): boolean {
  const match = WEEK_KEY.exec(value)
  if (!match) return false
  const week = Number(match[2])
  // ISO 8601 allows 53 weeks in a long year.
  return week >= 1 && week <= 53
}

function synthesisDir(): string {
  return vaultPath(VAULT_SUBDIRS.synthesis)
}

function weekFromFileName(name: string): string | null {
  if (!name.endsWith('.md')) return null
  const week = path.basename(name, '.md').normalize('NFC')
  return isWeekKey(week) ? week : null
}

async function readWeek(week: string): Promise<SynthesisNote | null> {
  const relative = `${VAULT_SUBDIRS.synthesis}/${week}.md`
  const body = await readTextFileOrNull(vaultPath(VAULT_SUBDIRS.synthesis, `${week}.md`))
  if (body === null) return null
  return { path: relative, week, body }
}

export const synthesisRepository = {
  /** Newest week first. A missing folder is not an error — the agent has just never run. */
  async list(): Promise<SynthesisNote[]> {
    const weeks = (await listDirectory(synthesisDir()))
      .map(weekFromFileName)
      .filter((week): week is string => week !== null)
      // Week keys are zero-padded, so lexical order is chronological order.
      .sort((a, b) => b.localeCompare(a))

    const notes = await Promise.all(weeks.map(readWeek))
    return notes.filter((note): note is SynthesisNote => note !== null)
  },

  async read(week: string): Promise<SynthesisNote | null> {
    const issues = new Issues()
    checkNonEmptyText(issues, 'week', week)
    issues.throwIfAny()

    const key = week.trim().normalize('NFC')
    if (!isWeekKey(key)) {
      // Rejecting here rather than joining the path is what keeps `../` out of the vault.
      throw new Error(`week must be an ISO week key like 2026-W31 (got "${week}")`)
    }
    return readWeek(key)
  },
}

export type SynthesisRepository = typeof synthesisRepository
