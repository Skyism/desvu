import { useMemo } from 'react'

import { Card } from '@/components/Card'
import { EmptyState } from '@/components/EmptyState'
import { Page } from '@/components/Page'
import { SkeletonLines } from '@/components/Skeleton'
import { RepeatingCard, TodoList, todaysList } from '@/components/todos'
import { TimelineHero, useClockBucket, useNowMinute } from '@/components/timeline'
import { formatDayLine, toDateString } from '@/lib/date'
import { ROUTES } from '@/lib/routes'
import { useCalendarForDate } from '@/store/calendar'
import { useInboxLines } from '@/store/inbox'
import { useDayLoad, useSettings, useTodos, useTodosForDate, useTodoTemplates } from '@/store/todos'

/**
 * PRD T5 · T7 · T8 · T9 · T10 · T11 — Today, the default surface on launch.
 *
 * The day reads top to bottom as one thing: what is next, the day drawn as a single rail
 * with the tasks laid into its gaps, the ones that will not fit named beside it, and then
 * the list itself. Two competing panels — "calendar" and "todos" — is exactly the shape
 * T8 exists to prevent.
 *
 * Every read on this surface goes through `useVaultQuery`, so all of it re-runs when the
 * vault changes underneath the app. That is not hypothetical here: the Telegram bot,
 * `/sort-inbox` and Obsidian all write to the same corpus while this screen is open.
 */
export function TodaySurface(): React.JSX.Element {
  const date = useMemo(() => toDateString(), [])
  const nowMinute = useNowMinute()
  // Free time shrinks as the day passes; a coarse bucket re-reads it every five minutes
  // without asking the filesystem sixty times an hour.
  const bucket = useClockBucket(5)

  // `forDate` is the one that materializes recurrence instances, so it is what the rail
  // and `dayLoad` are built from. The list is built from `list()` instead, because
  // `forDate` drops a task the instant it is ticked — see `todaysList`.
  const live = useTodosForDate(date, bucket)
  const all = useTodos()
  const dayLoad = useDayLoad(date, bucket)
  const events = useCalendarForDate(date)
  const templates = useTodoTemplates()
  const settings = useSettings()

  const fallbackEstimate = settings.data?.todos.default_estimate_minutes ?? 30
  const defaultPriority = settings.data?.todos.default_priority ?? 2

  const list = useMemo(
    () => (all.data ? todaysList(all.data, date) : null),
    [all.data, date]
  )

  return (
    <Page
      title={ROUTES.today.title}
      eyebrow={formatDayLine()}
      description={ROUTES.today.description}
    >
      <TimelineHero
        date={date}
        events={events.data}
        todos={live.data}
        dayLoad={dayLoad.data}
        fallbackEstimate={fallbackEstimate}
        nowMinute={nowMinute}
        loading={dayLoad.loading || live.loading}
        error={dayLoad.error ?? live.error}
      />

      <section className="gap-gutter grid min-w-0 grid-cols-1 items-start xl:grid-cols-[2fr_1fr]">
        <TodoList
          todos={list}
          date={date}
          fallbackEstimate={fallbackEstimate}
          defaultPriority={defaultPriority}
          loading={all.loading}
          error={all.error}
        />

        <div className="gap-gutter flex min-w-0 flex-col">
          <RepeatingCard
            templates={templates.data}
            allTodos={all.data}
            defaultPriority={defaultPriority}
            defaultEstimate={fallbackEstimate}
            loading={templates.loading}
            error={templates.error}
          />
          <InboxCard />
        </div>
      </section>
    </Page>
  )
}

/**
 * The reference implementation of the data-fetching pattern, kept from the scaffold: four
 * rendered states, checked in this order — not-yet, failed, empty, data — and no white
 * screen in any of them.
 */
function InboxCard(): React.JSX.Element {
  const { data, error, loading, settled } = useInboxLines()

  return (
    <Card
      title="Inbox"
      meta={data ? (data.length > 0 ? `${data.length} unsorted` : 'clear') : undefined}
    >
      {!settled && loading && <SkeletonLines lines={3} />}

      {error && (
        // Quiet, not red, and it says what is actually true rather than "Error".
        <p className="text-muted text-sm">
          The Inbox can&apos;t be read yet. Nothing is lost; captures are still appended to
          the vault.
        </p>
      )}

      {!error && settled && data?.length === 0 && (
        <EmptyState compact title="Nothing captured yet.">
          Text the bot, or press ⌘⇧Space. Lines land here raw and get sorted later.
        </EmptyState>
      )}

      {!error && data && data.length > 0 && (
        <ul className="text-ink2 flex flex-col gap-2.5 font-mono text-xs">
          {data.map((line, index) => (
            <li key={`${line.file}-${index}`} className="bg-fill rounded-field px-3 py-2.5 leading-[1.45]">
              <span className="text-muted">{line.at}</span> {line.line}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
