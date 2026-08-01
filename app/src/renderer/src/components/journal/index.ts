/**
 * The journal surface's own vocabulary. Nothing here is a design-system primitive — these
 * compose `@/components` and must not be reached for from another surface without lifting
 * them out first.
 */

export { JournalHistory } from './JournalHistory'
export type { JournalHistoryProps } from './JournalHistory'

export { MonthGrid } from './MonthGrid'
export type { MonthGridProps } from './MonthGrid'

export { PromptFields } from './PromptFields'
export type { PromptFieldsProps } from './PromptFields'

export { RatingRow } from './RatingRow'
export type { RatingRowProps } from './RatingRow'

export { ReflectionCard } from './ReflectionCard'
export type { ReflectionCardProps } from './ReflectionCard'

export {
  saveJournalEntry,
  useJournalDay,
  useJournalEntries,
  useJournalStreak,
  useSettings,
} from './journal-data'
export type { DatedEntry } from './journal-data'

export * from './journal-model'
