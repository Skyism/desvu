import type { Settings } from '@shared/types'

import { bridge } from '@/lib/bridge'
import { useVaultQuery, type VaultQuery } from './useVaultQuery'

/**
 * Reading `Synthesis/YYYY-Www.md`.
 *
 * ⚠️ THERE IS NO SYNTHESIS CHANNEL YET. `DesvuApi` (`src/shared/ipc.ts`) has no
 * `synthesis` domain and `src/main/repos/` has no `synthesisRepository`, so the renderer
 * currently has no way to read the body of a weekly note. Both files are orchestrator- and
 * storage-owned, and the instruction for this workstream is to report the gap rather than
 * route around it — see `.progress/braindump-synthesis.md` for the exact request.
 *
 * So this module *detects* the domain rather than assuming it. The preload builds
 * `window.desvu` mechanically from `IPC_CHANNELS`, so the day `synthesis:list` and
 * `synthesis:read` are added to the contract and given handlers, this lights up with no
 * change here. Until then `supported: false` reaches the surface, which says so plainly
 * instead of pretending the week is empty. Those are different facts and the UI must never
 * conflate them.
 */

export interface SynthesisNote {
  /** Vault-relative, e.g. `Synthesis/2026-W31.md`. */
  path: string
  /** The ISO week the file is named for, e.g. `2026-W31`. */
  week: string
  /** Markdown below the front matter. */
  body: string
}

interface SynthesisDomain {
  list: () => Promise<SynthesisNote[]>
}

export interface SynthesisState {
  /** False when the app has no way to read `Synthesis/` at all. Not the same as "empty". */
  supported: boolean
  /** Newest week first. Empty on a supported bridge means the week is simply unwritten. */
  notes: SynthesisNote[]
}

function domain(): SynthesisDomain | null {
  const api = bridge() as unknown as Record<string, unknown>
  const candidate = api['synthesis']
  if (candidate === null || typeof candidate !== 'object') return null
  const list = (candidate as Record<string, unknown>)['list']
  return typeof list === 'function' ? (candidate as unknown as SynthesisDomain) : null
}

const WEEK_FROM_PATH = /(\d{4}-W\d{1,2})/i

function normalize(raw: SynthesisNote): SynthesisNote {
  const week = raw.week ?? WEEK_FROM_PATH.exec(raw.path)?.[1] ?? raw.path
  return { path: raw.path, week: week.toUpperCase(), body: raw.body ?? '' }
}

export function useSynthesis(): VaultQuery<SynthesisState> {
  return useVaultQuery(async () => {
    const api = domain()
    if (api === null) return { supported: false, notes: [] }
    const notes = (await api.list()).map(normalize)
    return {
      supported: true,
      notes: notes.sort((a, b) => b.week.localeCompare(a.week)),
    }
  }, [])
}

/**
 * PRD J8 — what a synthesis or `/ask` agent is allowed to read from the journal.
 *
 * `journalRepository.readForAgent()` projects entries down to
 * `{entry_date, rating, mood_word}` when this is `metadata`. It is a projection on the way
 * out of the repository, not a sentence in a prompt, which is the entire point: there is no
 * code path that returns prose while the setting says otherwise, so no amount of clever
 * phrasing can talk a model past it.
 */
export function useJournalAccess(): VaultQuery<Settings['synthesis']['journal_access']> {
  return useVaultQuery(async () => (await bridge().settings.get()).synthesis.journal_access, [])
}

/**
 * PRD B4 — `/ask`.
 *
 * The agent that answers does not exist. There is no `ask` channel, no retrieval layer and
 * no answering model wired to this vault; the PRD defers agentic RAG explicitly and §5.5
 * describes `/ask` running in Claude Code, not in this window. So this returns `false` and
 * the surface says so. It must never render a fabricated answer, a fake citation, or a
 * spinner that resolves to nothing.
 */
export function askIsWired(): boolean {
  const api = bridge() as unknown as Record<string, unknown>
  const candidate = api['ask']
  return typeof candidate === 'function' || (typeof candidate === 'object' && candidate !== null)
}
