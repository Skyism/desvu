/**
 * Meals and training components. `nutrition.ts` holds the two rules that shape every
 * reading: numbers are optional (null is never rendered as 0), and targets do not exist
 * until the user opts in.
 */

export { DayLogCard } from './DayLogCard'
export type { DayLogCardProps } from './DayLogCard'

export { EatenAndMovedCard } from './EatenAndMovedCard'
export type { EatenAndMovedCardProps } from './EatenAndMovedCard'

export { MealDialog } from './MealDialog'
export type { MealDialogProps } from './MealDialog'

export { EstimateNote, NutritionFigure } from './NutritionFigure'
export type { NutritionFigureProps } from './NutritionFigure'

export { TargetsDialog } from './TargetsDialog'
export type { TargetsDialogProps } from './TargetsDialog'

export { TrendsCard } from './TrendsCard'
export type { TrendsCardProps } from './TrendsCard'

export { WorkoutDialog } from './WorkoutDialog'
export type { WorkoutDialogProps } from './WorkoutDialog'

export * from './nutrition'
