import { useCallback, useEffect, useMemo, useState } from 'react'

import type { BrainDumpThread } from '@shared/types'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { EmptyState } from '@/components/EmptyState'
import { Page } from '@/components/Page'
import { Skeleton, SkeletonLines } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import {
  EMPTY_NOTE_INDEX,
  NewThreadDialog,
  NoteLinkProvider,
  ThreadList,
  ThreadReader,
  type NoteRef,
} from '@/components/notes'
import { readableMessage } from '@/lib/bridge'
import { ROUTES } from '@/lib/routes'
import {
  appendToThread,
  createThread,
  openInObsidian,
  useNoteIndex,
  useThreadSelection,
  useThreads,
  useTopics,
} from '@/store/brainDump'

/**
 * PRD B1 · B2 — the brain dump.
 *
 * A thread is a **running document on one subject**, not a file per day. That is the
 * whole feature: the alternative — `2026-07-14.md`, `2026-08-01.md`, `2026-09-02.md` in
 * one folder — is a pile of fragments nobody re-reads, which is precisely the failure
 * this replaces. So the surface is a reader with an append box, never a "new note" box.
 *
 * The vault changes underneath this screen constantly (the bot, Obsidian, `/sort-inbox`),
 * so every read goes through `useVaultQuery` and re-runs on `vaultChanged`. There is no
 * local copy of a thread to go stale.
 */
export function BrainDumpSurface(): React.JSX.Element {
  const threads = useThreads()
  const topics = useTopics()
  const index = useNoteIndex()
  const { toast } = useToast()

  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)

  const requested = useThreadSelection((state) => state.requested)
  const clearRequest = useThreadSelection((state) => state.clear)

  const list = useMemo(() => threads.data ?? [], [threads.data])

  // A wikilink followed from another surface names the thread it wants.
  useEffect(() => {
    if (requested === null) return
    setSelectedPath(requested)
    clearRequest()
  }, [requested, clearRequest])

  // Keep a selection that still exists; otherwise fall to the most recently touched.
  useEffect(() => {
    if (list.length === 0) return
    if (selectedPath !== null && list.some((thread) => thread.path === selectedPath)) return
    setSelectedPath(list[0]?.path ?? null)
  }, [list, selectedPath])

  const selected = list.find((thread) => thread.path === selectedPath) ?? null

  const openNote = useCallback(
    (ref: NoteRef) => {
      if (ref.kind === 'brain-dump') {
        setSelectedPath(ref.path)
        return
      }
      // Library items and loose notes have no in-app reader yet, so the link still goes
      // where it points — just in Obsidian.
      void openInObsidian(ref.path).catch((thrown: unknown) => {
        toast(`Obsidian didn't open. The note is still at ${ref.path}.`)
        console.error('[desvu] openInObsidian failed', thrown)
      })
    },
    [toast]
  )

  const openPath = useCallback(
    (path: string) => {
      void openInObsidian(path).catch((thrown: unknown) => {
        toast(`Obsidian didn't open. The file is still at ${path}.`)
        console.error('[desvu] openInObsidian failed', thrown)
      })
    },
    [toast]
  )

  /** Must stay in step with `openNote` above — the tooltip is a promise about the click. */
  const describeNote = useCallback(
    (ref: NoteRef) =>
      ref.kind === 'brain-dump'
        ? `Open the ${ref.title} thread`
        : `Open ${ref.path} in Obsidian`,
    []
  )

  const onAppend = useCallback(
    async (text: string) => {
      if (!selected) return
      await appendToThread(selected.path, text)
      toast('Added to the thread.', { tone: 'accent' })
    },
    [selected, toast]
  )

  const onCreate = useCallback(
    async (topic: string, title: string, text: string) => {
      const thread = await createThread(topic, title, text)
      setSelectedPath(thread.path)
      toast(`Started “${thread.title}” in ${thread.topic}.`, { tone: 'accent' })
    },
    [toast]
  )

  const knownTopics = topics.data ?? []
  const settled = threads.settled && topics.settled
  const failed = threads.error ?? topics.error

  return (
    <Page
      title={ROUTES['brain-dump'].title}
      eyebrow={eyebrowFor(list)}
      description={ROUTES['brain-dump'].description}
      actions={
        <Button size="md" shape="pill" variant="soft" onClick={() => setComposing(true)}>
          Start a thread
        </Button>
      }
    >
      <NoteLinkProvider
        index={index.data ?? EMPTY_NOTE_INDEX}
        openNote={openNote}
        openPath={openPath}
        describeNote={describeNote}
      >
        {!settled && !failed && <LoadingCards />}

        {failed && (
          <Card title="Threads" meta="nothing was written">
            <p className="text-ink2 text-sm">{readableMessage(failed)}</p>
            <p className="text-muted mt-3 text-xs">
              The files are untouched — this was a read. Anything captured is still in the vault.
            </p>
            <div className="mt-6">
              <Button
                variant="soft"
                size="sm"
                onClick={() => {
                  threads.refetch()
                  topics.refetch()
                }}
              >
                Try again
              </Button>
            </div>
          </Card>
        )}

        {settled && !failed && list.length === 0 && (
          <Card>
            <EmptyState
              title="No threads yet."
              action={
                <Button variant="soft" size="sm" onClick={() => setComposing(true)}>
                  Start a thread
                </Button>
              }
            >
              Thoughts sent to the bot land here once <code className="font-mono text-xs">/sort-inbox</code>{' '}
              files them, under {knownTopics.length > 0 ? knownTopics.join(', ') : 'a topic of their own'}.
            </EmptyState>
          </Card>
        )}

        {settled && !failed && list.length > 0 && (
          <div className="gap-gutter flex min-w-0 flex-col lg:flex-row lg:items-start">
            <Card
              className="lg:w-[302px] lg:flex-none"
              title="Threads"
              meta={`${list.length} across ${countTopics(list)}`}
            >
              <ThreadList
                threads={list}
                topics={knownTopics}
                selectedPath={selectedPath}
                onSelect={(thread) => setSelectedPath(thread.path)}
              />
            </Card>

            <Card className="min-w-0 flex-1">
              {selected ? (
                <ThreadReader thread={selected} onOpenInObsidian={openPath} onAppend={onAppend} />
              ) : (
                <EmptyState title="Pick a thread." compact>
                  Each one is a single running subject, oldest thought at the top.
                </EmptyState>
              )}
            </Card>
          </div>
        )}
      </NoteLinkProvider>

      <NewThreadDialog
        open={composing}
        onClose={() => setComposing(false)}
        topics={knownTopics}
        initialTopic={selected?.topic ?? null}
        onCreate={onCreate}
      />
    </Page>
  )
}

function eyebrowFor(threads: BrainDumpThread[]): string {
  if (threads.length === 0) return 'Ongoing threads'
  const newest = threads.reduce(
    (latest, thread) => (thread.updated > latest ? thread.updated : latest),
    threads[0]?.updated ?? ''
  )
  return `Last added to ${newest}`
}

function countTopics(threads: BrainDumpThread[]): string {
  const count = new Set(threads.map((thread) => thread.topic)).size
  return count === 1 ? '1 topic' : `${count} topics`
}

/** The frame must not flicker, so loading fills the cards rather than replacing them. */
function LoadingCards(): React.JSX.Element {
  return (
    <div className="gap-gutter flex min-w-0 flex-col lg:flex-row lg:items-start">
      <Card className="lg:w-[302px] lg:flex-none" title="Threads">
        <SkeletonLines lines={6} />
      </Card>
      <Card className="min-w-0 flex-1">
        <div className="flex flex-col gap-6">
          <Skeleton width="42%" height={26} radius="control" />
          <SkeletonLines lines={7} />
        </div>
      </Card>
    </div>
  )
}
