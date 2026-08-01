import { useEffect, useState } from 'react'

import type { BrainDumpThread } from '@shared/types'

import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { Textarea } from '@/components/Input'
import { cn } from '@/lib/cn'
import { relativeDay } from './format'
import { Markdown } from './Markdown'

export interface ThreadReaderProps {
  thread: BrainDumpThread
  onOpenInObsidian: (path: string) => void
  onAppend: (text: string) => Promise<void>
}

export function ThreadReader({
  thread,
  onOpenInObsidian,
  onAppend,
}: ThreadReaderProps): React.JSX.Element {
  return (
    <article className="flex min-w-0 flex-col gap-7">
      <header className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-2">
          <h2 className="font-display text-hero tracking-display min-w-0 font-normal">
            {thread.title}
          </h2>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onOpenInObsidian(thread.path)}
            title={`Open ${thread.path} in Obsidian`}
          >
            Open in Obsidian
          </Button>
        </div>

        <div className="text-muted flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
          <span>{thread.topic}</span>
          <span aria-hidden className="bg-faint rounded-pill h-1 w-1" />
          <span>started {relativeDay(thread.created)}</span>
          <span aria-hidden className="bg-faint rounded-pill h-1 w-1" />
          <span>last added to {relativeDay(thread.updated)}</span>
          {thread.tags.length > 0 && (
            <span className="flex flex-wrap items-center gap-1.5">
              {thread.tags.map((tag) => (
                <Badge key={tag} className="px-2.5 py-[3px] text-[11px]">
                  {tag}
                </Badge>
              ))}
            </span>
          )}
        </div>
      </header>

      {/* The reading measure. Long-form prose past ~72 characters a line stops being read. */}
      <div className="max-w-[70ch] min-w-0">
        <Markdown source={thread.body} variant="prose" dayHeadings omitTitle={thread.title} />
      </div>

      <AppendToThread thread={thread} onAppend={onAppend} />
    </article>
  )
}

/**
 * Adding to a thread from the app. This writes through
 * `brainDump.appendToThread`, which appends a `## YYYY-MM-DD` block to the file that
 * already exists — the same shape `/sort-inbox` writes, so the two writers cannot
 * disagree about what a thread looks like.
 */
function AppendToThread({
  thread,
  onAppend,
}: {
  thread: BrainDumpThread
  onAppend: (text: string) => Promise<void>
}): React.JSX.Element {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  // A new thread starts with an empty box rather than the previous thread's draft.
  useEffect(() => {
    setText('')
    setProblem(null)
  }, [thread.path])

  const submit = async (): Promise<void> => {
    const trimmed = text.trim()
    if (trimmed === '' || busy) return
    setBusy(true)
    setProblem(null)
    try {
      await onAppend(trimmed)
      setText('')
    } catch (thrown) {
      // The text stays in the box. Losing a capture to a failed write is the worst thing
      // this surface could do, so nothing is cleared until the write actually landed.
      setProblem(
        thrown instanceof Error ? thrown.message : 'The vault could not be written to just now.'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="border-rule flex flex-col gap-3 border-t pt-6">
      <Textarea
        label="Add to this thread"
        value={text}
        rows={3}
        placeholder="Another thought on the same subject…"
        hint="Lands under today's date in the same file. ⌘↵ to add."
        error={problem}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault()
            void submit()
          }
        }}
      />
      <div className={cn('flex items-center justify-end gap-3')}>
        <Button
          variant="primary"
          size="sm"
          loading={busy}
          disabled={text.trim() === ''}
          onClick={() => void submit()}
        >
          Add to thread
        </Button>
      </div>
    </section>
  )
}
