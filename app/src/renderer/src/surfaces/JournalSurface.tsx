import { useMemo, useState } from 'react'
import type { Settings } from '@shared/types'

import { Page } from '@/components/Page'
import { StreakBadge } from '@/components/Streak'
import {
  JournalHistory,
  MonthGrid,
  ReflectionCard,
  buildMonthGrid,
  toDateString,
  useJournalDay,
  useJournalEntries,
  useJournalStreak,
  useSettings,
} from '@/components/journal'
import { formatDayLine } from '@/lib/date'
import { ROUTES } from '@/lib/routes'

/**
 * PRD J0 · J2 · J3 · J5 · J6.
 *
 * Two columns. Left is the comp's "Tonight" card — the 1–7 row, the disclosure, the four
 * prompts, and the thirty-day grid under its own hairline, all in one card exactly as the
 * comp composes them. Right is everything ever written, searchable.
 *
 * ── J6, and why this screen is built the way it is ────────────────────────────────────
 *
 * The real corpus decays from 100% adherence in January to 13.8% in July, with a 24-day
 * maximum gap. The person this surface is designed for is not the one on a 20-day run; it
 * is the one opening the app for the first time in three weeks. Every number this screen
 * can render has to survive that moment:
 *
 *   · The streak comes from `<StreakBadge>`, which has no branch that prints 0. A run of
 *     one or more counts up; otherwise it shows the banked longest, framed as something
 *     owned. There is no third case and no "days since".
 *   · The grid's cells come from `GridDay`, which is an entry or `null` — there is no
 *     `missed` field to colour red, and red is reserved for destructive actions anyway.
 *   · The only aggregate shown is `total`: "83 days written". The denominator that would
 *     turn it into 39.3% is available and is deliberately never rendered.
 *
 * Nothing on this page counts down, and nothing on it is red.
 */
export function JournalSurface(): React.JSX.Element {
  const today = useMemo(() => toDateString(), [])
  const [selected, setSelected] = useState(today)

  const entries = useJournalEntries()
  const day = useJournalDay(selected)
  const streak = useJournalStreak()
  const settings = useSettings()

  // `undefined` until the read for *this* date lands — see `useJournalDay`.
  const entryForSelected = day.data?.date === selected ? day.data.entry : undefined

  const grid = useMemo(() => buildMonthGrid(entries.data ?? [], today), [entries.data, today])

  return (
    <Page
      title={ROUTES.journal.title}
      eyebrow={formatDayLine()}
      description={ROUTES.journal.description}
      // The streak and nothing else. The day count lives on the history card, where it
      // describes the list underneath it rather than appearing twice on one screen.
      actions={<StreakBadge streak={streak.data} />}
    >
      <div className="gap-gutter grid min-w-0 grid-cols-1 items-start xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <ReflectionCard
          date={selected}
          today={today}
          entry={entryForSelected}
          error={day.error}
          onBackToToday={() => setSelected(today)}
        >
          <MonthGrid
            days={grid}
            selected={selected}
            onSelect={setSelected}
            loading={!entries.settled && entries.loading}
          />
        </ReflectionCard>

        <JournalHistory
          entries={entries.data}
          loading={entries.loading}
          settled={entries.settled}
          error={entries.error}
          selected={selected}
          onSelect={setSelected}
          privacyNote={privacyNote(settings.data)}
        />
      </div>
    </Page>
  )
}

/**
 * PRD J4 and J8, described accurately or not at all.
 *
 * J4 is about data **at rest**: the prose lives on this Mac and in the iCloud vault, and
 * the Telegram capture path never touches it. J7 is the deliberate exception — synthesis
 * and `/ask` do read entries, and pretending otherwise here would make the UI a liar. What
 * they may read is `settings.synthesis.journal_access`, enforced by a projection inside
 * `journalRepository.readForAgent()` rather than by an instruction in a prompt.
 *
 * This surface reports the setting; it is not the place that changes it.
 */
function privacyNote(settings: Settings | null): string | undefined {
  if (!settings) return undefined
  return settings.synthesis.journal_access === 'metadata'
    ? 'Kept on this Mac and in your vault. Synthesis is set to metadata, so it sees only the date, rating and mood word — the writing itself never reaches it.'
    : 'Kept on this Mac and in your vault. Synthesis reads entries in full so it can quote you back to yourself; switching that to metadata-only is one setting.'
}
