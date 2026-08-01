import { formatDayLine } from '@/lib/date'
import { Placeholder } from './Placeholder'

/**
 * The spec below is the contract for this surface. Replace the <Placeholder> with the
 * real implementation, keeping the requirement IDs satisfied. Return exactly one <Page>.
 */
export function JournalSurface(): React.JSX.Element {
  return (
    <Placeholder
      route="journal"
      eyebrow={formatDayLine()}
      requirements="PRD J0 · J2 · J3 · J5 · J6"
      willHold={[
        'The rating row, 1–7, and nothing else visible on open. A rating alone is a complete entry — a 5-second entry must always be possible.',
        '"Say a little more ↓" / "Just the number is fine ↑" — progressive disclosure that grants permission to do less.',
        'Four optional prompts: grateful for · what I learned · a mood word · what caused it.',
        'The 30-day grid, with neutral empty days and the caption "Empty is just empty."',
        'The current streak when it is ≥1, via <StreakBadge>. It may count up and may never render as broken — no "0 days", no red, no guilt on return.',
        'The full history, searchable. Prose never leaves the machine.',
      ]}
    />
  )
}
