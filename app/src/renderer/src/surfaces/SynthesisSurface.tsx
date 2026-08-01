import { Placeholder } from './Placeholder'

/**
 * The spec below is the contract for this surface. Replace the <Placeholder> with the
 * real implementation, keeping the requirement IDs satisfied. Return exactly one <Page>.
 */
export function SynthesisSurface(): React.JSX.Element {
  return (
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
  )
}
