import { Placeholder } from './Placeholder'

/**
 * The spec below is the contract for this surface. Replace the <Placeholder> with the
 * real implementation, keeping the requirement IDs satisfied. Return exactly one <Page>.
 */
export function MealsSurface(): React.JSX.Element {
  return (
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
  )
}
