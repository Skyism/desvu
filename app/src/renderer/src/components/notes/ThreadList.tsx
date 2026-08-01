import { useMemo, useState } from 'react'

import type { BrainDumpThread } from '@shared/types'

import { Eyebrow } from '@/components/Card'
import { Input } from '@/components/Input'
import { cn } from '@/lib/cn'
import { previewOf, relativeDay } from './format'

export interface ThreadListProps {
  threads: BrainDumpThread[]
  /** Folders under `Brain Dump/`, including any that hold no threads yet. */
  topics: string[]
  selectedPath: string | null
  onSelect: (thread: BrainDumpThread) => void
}

interface TopicGroup {
  topic: string
  threads: BrainDumpThread[]
  updated: string
}

function group(threads: BrainDumpThread[], topics: string[]): TopicGroup[] {
  const byTopic = new Map<string, BrainDumpThread[]>()
  // Seed with the folders so an empty topic is still visible and still nameable.
  for (const topic of topics) byTopic.set(topic, [])

  for (const thread of threads) {
    const topic = thread.topic.trim() === '' ? 'Unfiled' : thread.topic
    const existing = byTopic.get(topic)
    if (existing) existing.push(thread)
    else byTopic.set(topic, [thread])
  }

  return [...byTopic.entries()]
    .map(([topic, list]) => ({
      topic,
      threads: [...list].sort((a, b) => b.updated.localeCompare(a.updated)),
      updated: list.reduce((newest, thread) => (thread.updated > newest ? thread.updated : newest), ''),
    }))
    .sort((a, b) => {
      // Topics that hold nothing sink to the bottom rather than leading the list.
      if (a.threads.length === 0 !== (b.threads.length === 0)) {
        return a.threads.length === 0 ? 1 : -1
      }
      return b.updated.localeCompare(a.updated) || a.topic.localeCompare(b.topic)
    })
}

export function ThreadList({
  threads,
  topics,
  selectedPath,
  onSelect,
}: ThreadListProps): React.JSX.Element {
  const [filter, setFilter] = useState('')

  const groups = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    const matching =
      needle === ''
        ? threads
        : threads.filter((thread) =>
            [thread.title, thread.topic, thread.body, thread.tags.join(' ')]
              .join(' ')
              .toLowerCase()
              .includes(needle)
          )
    const visibleTopics = needle === '' ? topics : []
    return group(matching, visibleTopics).filter(
      (entry) => entry.threads.length > 0 || needle === ''
    )
  }, [threads, topics, filter])

  const total = groups.reduce((count, entry) => count + entry.threads.length, 0)

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {threads.length > 6 && (
        <Input
          type="search"
          value={filter}
          placeholder="Filter threads"
          aria-label="Filter threads"
          onChange={(event) => setFilter(event.target.value)}
        />
      )}

      {filter.trim() !== '' && total === 0 && (
        <p className="text-muted text-sm">Nothing matches “{filter.trim()}”.</p>
      )}

      <nav className="flex min-w-0 flex-col gap-5" aria-label="Brain dump threads">
        {groups.map((entry) => (
          <div key={entry.topic} className="flex min-w-0 flex-col gap-1.5">
            <Eyebrow className="px-1">{entry.topic}</Eyebrow>

            {entry.threads.length === 0 ? (
              <p className="text-muted px-1 py-1 text-xs">No threads yet.</p>
            ) : (
              entry.threads.map((thread) => (
                <ThreadRow
                  key={thread.path}
                  thread={thread}
                  selected={thread.path === selectedPath}
                  onSelect={onSelect}
                />
              ))
            )}
          </div>
        ))}
      </nav>
    </div>
  )
}

function ThreadRow({
  thread,
  selected,
  onSelect,
}: {
  thread: BrainDumpThread
  selected: boolean
  onSelect: (thread: BrainDumpThread) => void
}): React.JSX.Element {
  const preview = previewOf(thread.body, 64)

  return (
    <button
      type="button"
      onClick={() => onSelect(thread)}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'transition-quiet rounded-nav flex min-w-0 flex-col gap-1 px-3 py-2.5 text-left',
        selected ? 'bg-soft border-accent-border border' : 'border border-transparent hover:bg-hover'
      )}
    >
      {/* `w-full` is load-bearing. A `<button>` carries `align-items: flex-start` from the
          UA sheet, so its flex children are NOT stretched to its width — they take their
          max-content width and `truncate` grows the box instead of clipping the text. */}
      <span className="flex w-full min-w-0 items-baseline justify-between gap-3">
        <span
          className={cn(
            'text-md min-w-0 truncate font-display',
            selected ? 'text-accent-text' : 'text-ink'
          )}
        >
          {thread.title}
        </span>
        <span className="text-muted flex-none text-xs">{relativeDay(thread.updated)}</span>
      </span>
      {preview !== '' && (
        <span className="text-muted w-full min-w-0 truncate text-xs">{preview}</span>
      )}
    </button>
  )
}
