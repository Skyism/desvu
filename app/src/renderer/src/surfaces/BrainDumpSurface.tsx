import { Placeholder } from './Placeholder'

/**
 * The spec below is the contract for this surface. Replace the <Placeholder> with the
 * real implementation, keeping the requirement IDs satisfied. Return exactly one <Page>.
 */
export function BrainDumpSurface(): React.JSX.Element {
  return (
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
  )
}
