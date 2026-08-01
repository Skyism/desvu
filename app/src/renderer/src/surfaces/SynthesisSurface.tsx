import { useCallback, useEffect, useMemo, useState } from 'react'

import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Card, Eyebrow } from '@/components/Card'
import { EmptyState } from '@/components/EmptyState'
import { Input } from '@/components/Input'
import { Page } from '@/components/Page'
import { Skeleton, SkeletonLines } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import {
  buildNoteIndex,
  citedTargets,
  EMPTY_NOTE_INDEX,
  formatWeekLabel,
  isoWeekOf,
  isoWeekRange,
  Markdown,
  NoteLinkProvider,
  WikiLink,
  type NoteRef,
} from '@/components/notes'
import { readableMessage } from '@/lib/bridge'
import { ROUTES } from '@/lib/routes'
import { openInObsidian, useNoteIndex, useThreadSelection } from '@/store/brainDump'
import { askIsWired, useJournalAccess, useSynthesis, type SynthesisNote } from '@/store/synthesis'
import { useUi } from '@/store/ui'

/**
 * PRD B3 · B4 · J7 · J8 — the weekly synthesis, and asking the corpus questions.
 *
 * This is a **reading surface**, not a dashboard. One column, Cormorant at reading size,
 * a measure that stops around 68 characters, and no charts. What makes it worth reading
 * is that every claim carries a `[[wikilink]]` back to the record it came from — which is
 * also what makes the note a hub in the Obsidian graph rather than a dead end.
 */
export function SynthesisSurface(): React.JSX.Element {
  const synthesis = useSynthesis()
  const noteIndex = useNoteIndex()
  const { toast } = useToast()

  const navigate = useUi((state) => state.navigate)
  const requestThread = useThreadSelection((state) => state.request)

  const notes = useMemo(() => synthesis.data?.notes ?? [], [synthesis.data])
  const supported = synthesis.data?.supported ?? false

  const [week, setWeek] = useState<string | null>(null)

  useEffect(() => {
    if (notes.length === 0) return
    if (week !== null && notes.some((note) => note.week === week)) return
    setWeek(notes[0]?.week ?? null)
  }, [notes, week])

  const current = notes.find((note) => note.week === week) ?? null
  const position = notes.findIndex((note) => note.week === week)

  // Synthesis notes cite each other, so they belong in the index the links resolve against.
  const index = useMemo(() => {
    const base = noteIndex.data ?? EMPTY_NOTE_INDEX
    if (notes.length === 0) return base
    return buildNoteIndex([
      ...base.all,
      ...notes.map<NoteRef>((note) => ({
        path: note.path,
        title: formatWeekLabel(note.week),
        kind: 'synthesis',
      })),
    ])
  }, [noteIndex.data, notes])

  const openNote = useCallback(
    (ref: NoteRef) => {
      if (ref.kind === 'synthesis') {
        const match = /(\d{4}-W\d{1,2})/i.exec(ref.path)?.[1]
        if (match) {
          setWeek(match.toUpperCase())
          return
        }
      }
      if (ref.kind === 'brain-dump') {
        // A cited thread opens where threads are read, not in a popup here.
        requestThread(ref.path)
        navigate('brain-dump')
        return
      }
      void openInObsidian(ref.path).catch((thrown: unknown) => {
        toast(`Obsidian didn't open. The note is still at ${ref.path}.`)
        console.error('[desvu] openInObsidian failed', thrown)
      })
    },
    [navigate, requestThread, toast]
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

  return (
    <Page
      title={ROUTES.synthesis.title}
      eyebrow={current ? (isoWeekRange(current.week) ?? formatWeekLabel(current.week)) : 'Weekly'}
      description={ROUTES.synthesis.description}
      actions={
        notes.length > 1 && (
          <WeekNav
            weeks={notes.map((note) => note.week)}
            week={week}
            position={position}
            onChange={setWeek}
          />
        )
      }
    >
      <NoteLinkProvider index={index} openNote={openNote} openPath={openPath}>
        {!synthesis.settled && !synthesis.error && (
          <Card variant="band">
            <div className="mx-auto flex max-w-[68ch] flex-col gap-5">
              <Skeleton width="38%" height={28} radius="control" />
              <SkeletonLines lines={8} />
            </div>
          </Card>
        )}

        {synthesis.error && (
          <Card title="This week" meta="nothing was written">
            <p className="text-ink2 text-sm">{readableMessage(synthesis.error)}</p>
            <p className="text-muted mt-3 text-xs">
              This was a read, so the vault is untouched. The write-up is still on disk under{' '}
              <code className="font-mono">Synthesis/</code>.
            </p>
          </Card>
        )}

        {synthesis.settled && !synthesis.error && !supported && <ReaderNotWired />}

        {synthesis.settled && !synthesis.error && supported && current === null && (
          <Card variant="band">
            <EmptyState title="This week hasn't been written yet.">
              The synthesis agent writes <code className="font-mono text-xs">Synthesis/{isoWeekOf()}.md</code>{' '}
              once a week from the whole corpus. Nothing is missing — it just hasn&apos;t run.
            </EmptyState>
          </Card>
        )}

        {current !== null && <WriteUp note={current} onOpenInObsidian={openPath} />}
        {current !== null && <Sources note={current} />}

        <AskCard />
        <JournalAccessCard />
      </NoteLinkProvider>
    </Page>
  )
}

// ---------------------------------------------------------------------------
// the write-up
// ---------------------------------------------------------------------------

function WriteUp({
  note,
  onOpenInObsidian,
}: {
  note: SynthesisNote
  onOpenInObsidian: (path: string) => void
}): React.JSX.Element {
  return (
    <Card variant="band">
      <div className="mx-auto flex min-w-0 max-w-[68ch] flex-col gap-7">
        <header className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-2">
          <div className="min-w-0">
            <Eyebrow>{formatWeekLabel(note.week)}</Eyebrow>
            <h2 className="font-display text-hero tracking-display mt-1.5 font-normal">
              {isoWeekRange(note.week) ?? note.week}
            </h2>
          </div>
          <Button size="sm" variant="ghost" onClick={() => onOpenInObsidian(note.path)}>
            Open in Obsidian
          </Button>
        </header>

        <Markdown source={note.body} variant="prose" />
      </div>
    </Card>
  )
}

/**
 * Every record the write-up leans on, gathered in one place.
 *
 * B3 says every claim links back to its sources; this is the audit of that. A claim with
 * no link is a claim you cannot check, and seeing the list makes an unsourced week
 * obvious at a glance rather than plausible-sounding.
 */
function Sources({ note }: { note: SynthesisNote }): React.JSX.Element {
  const links = useMemo(() => citedTargets(note.body), [note.body])

  if (links.length === 0) {
    return (
      <Card title="Sources" meta="none cited">
        <p className="text-muted text-sm">
          Nothing in this week&apos;s write-up links back to a record. Claims that cite their
          source are what make the synthesis checkable — and what makes it a hub in the graph.
        </p>
      </Card>
    )
  }

  return (
    <Card title="Sources" meta={links.length === 1 ? '1 record' : `${links.length} records`}>
      <ul className="flex flex-wrap gap-x-5 gap-y-2.5">
        {links.map((target) => (
          <li key={target} className="text-sm">
            <WikiLink target={target} heading={null} alias={null} embed={false} />
          </li>
        ))}
      </ul>
      <p className="text-muted mt-5 text-xs">
        Links that resolve open the record. Links that do not are shown as plain text — in
        Obsidian a link to a note that does not exist yet is a deliberate mark, not a mistake.
      </p>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// week navigation
// ---------------------------------------------------------------------------

function WeekNav({
  weeks,
  week,
  position,
  onChange,
}: {
  weeks: string[]
  week: string | null
  position: number
  onChange: (week: string) => void
}): React.JSX.Element {
  // `weeks` is newest first, so "newer" walks backwards through the array.
  const newer = position > 0 ? weeks[position - 1] : undefined
  const older = position >= 0 && position < weeks.length - 1 ? weeks[position + 1] : undefined

  return (
    <div className="flex items-center gap-1.5">
      <Button
        size="sm"
        variant="ghost"
        shape="pill"
        disabled={older === undefined}
        onClick={() => older && onChange(older)}
        aria-label="Earlier week"
      >
        ←
      </Button>
      <span className="text-muted min-w-[92px] text-center text-xs">
        {week ? formatWeekLabel(week) : '—'}
      </span>
      <Button
        size="sm"
        variant="ghost"
        shape="pill"
        disabled={newer === undefined}
        onClick={() => newer && onChange(newer)}
        aria-label="Later week"
      >
        →
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// honest unavailable states
// ---------------------------------------------------------------------------

/**
 * Not an empty state. An empty Synthesis means the week has not been written; THIS means
 * the app cannot read `Synthesis/` at all, because no IPC channel exposes it yet. Saying
 * "nothing this week" here would be a lie the user has no way to catch.
 */
function ReaderNotWired(): React.JSX.Element {
  return (
    <Card variant="band" title="The weekly reader isn't connected yet" meta="one contract addition">
      <div className="flex max-w-[68ch] flex-col gap-3.5">
        <p className="text-ink2 text-sm">
          The write-ups themselves are fine — the agent writes{' '}
          <code className="font-mono text-xs">Synthesis/YYYY-Www.md</code> into the vault and
          Obsidian reads them today. What is missing is a way for this window to read them:{' '}
          <code className="font-mono text-xs">DesvuApi</code> has no{' '}
          <code className="font-mono text-xs">synthesis</code> domain, so there is no channel
          to call.
        </p>
        <p className="text-muted text-xs">
          Requested in <code className="font-mono">.progress/braindump-synthesis.md</code>:{' '}
          <code className="font-mono">synthesis:list</code> and{' '}
          <code className="font-mono">synthesis:read</code>, plus a repository behind them.
          This surface detects the domain at runtime, so it starts working the moment they land
          — nothing here needs changing.
        </p>
      </div>
    </Card>
  )
}

/**
 * PRD B4 — `/ask` over the vault, with citations.
 *
 * The answering agent does not exist. There is no retrieval layer, no `ask` channel and no
 * model wired to this corpus. The field is here so the shape of the feature is legible, and
 * it is inert on purpose: a stubbed answer would be indistinguishable from a real one and
 * would poison the one thing this surface sells, which is that claims are checkable.
 */
function AskCard(): React.JSX.Element {
  const wired = askIsWired()

  return (
    <Card title="Ask" meta={wired ? undefined : 'not built yet'}>
      <div className="flex max-w-[68ch] flex-col gap-4">
        <Input
          disabled={!wired}
          placeholder="What have I been thinking about distributed systems?"
          aria-label="Ask the vault a question"
          hint={
            wired
              ? 'Answers cite the notes they came from.'
              : 'Inert. Nothing is sent anywhere and no answer is generated.'
          }
        />
        {!wired && (
          <p className="text-muted text-xs">
            The agent that would answer this hasn&apos;t been built. When it exists it will
            traverse the vault&apos;s markdown and quote the records it used, the same way the
            weekly write-up does — no index, no embedding store. Until then, asking Claude Code
            in the vault directory does the same job by hand.
          </p>
        )}
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// J8
// ---------------------------------------------------------------------------

function JournalAccessCard(): React.JSX.Element {
  const access = useJournalAccess()
  const value = access.data

  return (
    <Card title="What agents may read" meta="journal access · PRD J8">
      {!access.settled && !access.error && <SkeletonLines lines={2} />}

      {access.error && (
        <p className="text-muted text-sm">
          The setting could not be read just now, so it is not shown rather than guessed at.
        </p>
      )}

      {value && (
        <div className="flex max-w-[68ch] flex-col gap-5">
          <div className="flex flex-col gap-2.5">
            <AccessRow
              active={value === 'full'}
              name="full"
              detail="agents read the whole journal, prose included"
            />
            <AccessRow
              active={value === 'metadata'}
              name="metadata"
              detail="agents read the date, the rating and the mood word — nothing else"
            />
          </div>

          <p className="text-ink2 text-sm">
            This is enforced by a <em className="font-serif italic">projection in the repository</em>,
            not by an instruction in a prompt. When it reads{' '}
            <code className="font-mono text-xs">metadata</code> there is no code path that
            returns prose at all, so a model cannot be argued, tricked or jailbroken past it.
          </p>

          <p className="text-muted text-xs">
            Separately and always: journal prose is stored only on this Mac and in your iCloud
            — never in Telegram, never in a database, never pushed to a remote (J4). This
            setting governs only what an agent may read at the moment it is asked to.
            Change it in <code className="font-mono">data/settings.json</code>.
          </p>
        </div>
      )}
    </Card>
  )
}

function AccessRow({
  active,
  name,
  detail,
}: {
  active: boolean
  name: string
  detail: string
}): React.JSX.Element {
  return (
    <div className="flex items-baseline gap-3">
      <Badge tone={active ? 'accent' : 'neutral'} className="min-w-[92px] justify-center">
        {name}
      </Badge>
      <span className={active ? 'text-ink text-sm' : 'text-muted text-sm'}>
        {detail}
        {active && <span className="text-accent-text"> · in effect</span>}
      </span>
    </div>
  )
}
