import { Placeholder } from './Placeholder'

/**
 * The spec below is the contract for this surface. Replace the <Placeholder> with the
 * real implementation, keeping the requirement IDs satisfied. Return exactly one <Page>.
 */
export function FinanceSurface(): React.JSX.Element {
  return (
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
  )
}
