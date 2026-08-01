import { create } from 'zustand'

import type { BrainDumpThread } from '@shared/types'

import { buildNoteIndex, type NoteIndex, type NoteRef } from '@/components/notes/wikilinks'
import { bridge } from '@/lib/bridge'
import { useVaultQuery, type VaultQuery } from './useVaultQuery'
import { invalidateVault } from './vault'

/**
 * Brain dump reads and writes, following `store/inbox.ts`: a read is a hook over
 * `useVaultQuery`, a write is a plain async function that ends in `invalidateVault()`,
 * and nothing from the vault is mirrored into zustand.
 */

export function useThreads(): VaultQuery<BrainDumpThread[]> {
  return useVaultQuery(() => bridge().brainDump.listThreads(), [])
}

/**
 * Topics are folders, and the sort skill creates them freely (PRD §9). Listing them
 * separately means a topic with no threads yet is still visible and still selectable.
 */
export function useTopics(): VaultQuery<string[]> {
  return useVaultQuery(() => bridge().brainDump.listTopics(), [])
}

/**
 * Append a dated block to an existing thread — never a new file. This is the whole point
 * of B1: a thread is a running document on one subject, so a second thought in September
 * joins the July one instead of becoming `2026-09-14.md` next to it.
 */
export async function appendToThread(path: string, text: string): Promise<BrainDumpThread> {
  const thread = await bridge().brainDump.appendToThread(path, text.trim())
  invalidateVault()
  return thread
}

export async function createThread(
  topic: string,
  title: string,
  text: string
): Promise<BrainDumpThread> {
  const thread = await bridge().brainDump.createThread(topic.trim(), title.trim(), text.trim())
  invalidateVault()
  return thread
}

export async function openInObsidian(relativePath: string): Promise<void> {
  await bridge().system.openInObsidian(relativePath)
}

// ---------------------------------------------------------------------------
// the note index that `[[wikilinks]]` resolve against
// ---------------------------------------------------------------------------

/**
 * Every note the app can currently see, for wikilink resolution.
 *
 * `Journal/` is deliberately absent, matching the sort skill's `LINK_TARGET_EXCLUDE`:
 * journal prose is local-only (J4) and is not a link target anywhere in this corpus.
 * Archived library items ARE included — archived is not deleted, and a link into one
 * must keep resolving (E7).
 */
export function useNoteIndex(): VaultQuery<NoteIndex> {
  return useVaultQuery(async () => {
    const [threads, library] = await Promise.all([
      bridge().brainDump.listThreads(),
      bridge().library.list({ includeArchived: true }),
    ])

    const refs: NoteRef[] = [
      ...threads.map<NoteRef>((thread) => ({
        path: thread.path,
        title: thread.title,
        kind: 'brain-dump',
      })),
      ...library.map<NoteRef>((item) => ({
        path: item.path,
        title: item.title,
        kind: 'library',
      })),
    ]

    return buildNoteIndex(refs)
  }, [])
}

// ---------------------------------------------------------------------------
// cross-surface navigation
// ---------------------------------------------------------------------------

interface ThreadSelection {
  /** The thread the Brain dump surface should open, or null for "whatever it had". */
  requested: string | null
  request: (path: string) => void
  clear: () => void
}

/**
 * A wikilink in the Synthesis write-up has to be able to open the thread it cites, and
 * the two surfaces do not share a parent. The route hash carries a route id and nothing
 * else (`lib/routes.ts`), so the target rides in this one-shot field instead: the Brain
 * dump surface consumes it on mount and clears it. Nothing is persisted.
 */
export const useThreadSelection = create<ThreadSelection>((set) => ({
  requested: null,
  request: (path) => set({ requested: path }),
  clear: () => set({ requested: null }),
}))
