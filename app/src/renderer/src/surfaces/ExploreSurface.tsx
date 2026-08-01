import { Placeholder } from './Placeholder'

/**
 * The spec below is the contract for this surface. Replace the <Placeholder> with the
 * real implementation, keeping the requirement IDs satisfied. Return exactly one <Page>.
 */
export function ExploreSurface(): React.JSX.Element {
  return (
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
  )
}
