/**
 * Global search (PRD S1–S3). `search.ts` is pure and carries the rules; the overlay is
 * presentation over it.
 */

export { SearchOverlay } from './SearchOverlay'

export { SearchResultRow } from './SearchResultRow'
export type { SearchResultRowProps } from './SearchResultRow'

export { openInObsidian, useDebounced, useSearch } from './data'

export * from './search'
