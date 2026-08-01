import { Card } from '@/components/Card'
import { EmptyState } from '@/components/EmptyState'
import { Page } from '@/components/Page'
import { SkeletonLines } from '@/components/Skeleton'
import { formatDayLine } from '@/lib/date'
import { ROUTES } from '@/lib/routes'
import { useInboxLines } from '@/store/inbox'

/**
 * PRD T9 — Today is the default surface on launch.
 *
 * Not built yet. The Inbox card below is real, and is the reference implementation of the
 * data-fetching pattern every other surface should copy: `useVaultQuery` for the read,
 * four rendered states (loading / failed / empty / data), and no white screen in any of
 * them. See `store/inbox.ts`.
 */
export function TodaySurface(): React.JSX.Element {
  return (
    <Page title={ROUTES.today.title} eyebrow={formatDayLine()} description={ROUTES.today.description}>
      <Card title="Not built yet" meta="PRD T5 · T8 · T9 · T11">
        <ul className="flex flex-col gap-3.5">
          {[
            'A hero line naming the next thing — "Next — 15-451 lecture, 10:00, in 40 minutes." With nothing scheduled it reads as open time, never as an error.',
            'The day as a full-width rail, 8a→11p, on the ruled-paper gradient. Calendar events are solid blocks; todos due today are placed into the gaps, sized by estimate_minutes.',
            'A quiet annotation under the rail: "2h 10m of tasks don\'t fit today." Gold, never red — being over is information, not failure.',
            'A "won\'t fit today" tray beside the rail for the overflow.',
            "Below the rail, the card grid: Today's list · Tonight · Inbox · Spending · Eaten & moved · Brain dump · Synthesis.",
          ].map((line) => (
            <li key={line} className="flex items-baseline gap-3">
              <span aria-hidden className="bg-faint rounded-pill mt-2 h-1 w-1 flex-none" />
              <span className="text-ink2 text-sm">{line}</span>
            </li>
          ))}
        </ul>
      </Card>

      <InboxCard />
    </Page>
  )
}

/**
 * The worked example, rendered. Copy this component's shape — the four states and the
 * order they are checked in — for every card that reads from the vault.
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
          The Inbox can&apos;t be read yet — the storage layer isn&apos;t wired up. Nothing is
          lost; captures are still appended to the vault.
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
