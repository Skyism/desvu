import type { RouteId } from '@/lib/routes'
import { formatDayLine } from '@/lib/date'
import { Placeholder } from './Placeholder'
import { TodaySurface } from './TodaySurface'

/**
 * One component per surface. Each returns exactly one `<Page>` — that is the whole
 * surface contract, and `<Page>` owns everything above the content column.
 *
 * To build a surface: replace its entry here with a real component in its own file under
 * `src/renderer/src/surfaces/`. Do not add chrome, do not add a second Page, do not
 * reach around `<Page>` to style the frame.
 */
export const SURFACES: Record<RouteId, () => React.JSX.Element> = {
  today: TodaySurface,

  journal: () => (
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
  ),

  explore: () => (
    <Placeholder
      route="explore"
      requirements="PRD E2 · E3 · E4 · E6 · E7"
      willHold={[
        'Grid and list views over Library/, filterable by type, status, tag and source.',
        'Each item: title, source, the AI summary, tags, and estimated read/watch time.',
        '"What fits right now" — unread items whose estimate fits the free minutes the Today view already computes.',
        'Read/unread toggling. Nothing is ever auto-deleted.',
        'Items auto-archive at 30 days and leave the queue without leaving the vault, the graph, or search.',
      ]}
    />
  ),

  finance: () => (
    <Placeholder
      route="finance"
      requirements="PRD F1 · F2 · F3 · F4"
      willHold={[
        'Spent-vs-limit per category, month to date, as gold progress bars — gold over the limit too, never red.',
        'Budget categories and limits defined in-app. They start empty and are never hardcoded.',
        'A purchase log with amount, category, description and date.',
        'Uncategorised spending shown as its own line. Taxonomy never blocks capture.',
      ]}
    />
  ),

  meals: () => (
    <Placeholder
      route="meals"
      requirements="PRD M1 · M2 · M3 · W1"
      willHold={[
        'Meals as free text. Calories and protein are nullable — requiring numbers is how food logs die.',
        'Agent-estimated numbers set in italic Cormorant, so the typography is itself the disclaimer.',
        'Optional calorie and protein targets. No target line until one is chosen.',
        'Workouts as free text with a type and an optional duration.',
      ]}
    />
  ),

  'brain-dump': () => (
    <Placeholder
      route="brain-dump"
      requirements="PRD B1 · B2"
      willHold={[
        'Threads by topic, each an ongoing document appended to rather than a file per day.',
        'A reader for the markdown body, with [[wikilinks]] resolving inside the app.',
        'Append-to-thread from the app, matching what the sort skill writes.',
        'A jump-to-Obsidian action on every thread.',
      ]}
    />
  ),

  synthesis: () => (
    <Placeholder
      route="synthesis"
      requirements="PRD B3 · B4 · J7 · J8"
      willHold={[
        'The weekly write-up from Synthesis/YYYY-Www.md, set in Cormorant at reading size.',
        'Every claim linked to the record it came from.',
        'An /ask entry point that answers from the vault with citations.',
        'A visible indicator of settings.synthesis.journal_access, which is enforced by a repository projection rather than by prompt instruction.',
      ]}
    />
  ),
}
