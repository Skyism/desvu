import { useRef, type KeyboardEvent } from 'react'
import type { Rating } from '@shared/types'

import { cn } from '@/lib/cn'
import { RATINGS } from './journal-model'

export interface RatingRowProps {
  value: Rating | null
  onSelect: (rating: Rating) => void
  /** Accessible name for the group. The visible invitation sits above it. */
  label: string
  disabled?: boolean
  className?: string
}

/**
 * The 1–7 row, ported from the approved comp: seven square cells, Cormorant numerals,
 * gold fill on the chosen one.
 *
 * PRD J0/J2 — this is the entire required form. Picking a number writes the day; nothing
 * else is mandatory and nothing else is even visible until asked for. A tap here is a
 * complete journal entry, which is why the write fires on select rather than waiting for
 * a Save button that a five-second entry would never reach.
 *
 * Implemented as a real radio group: arrow keys and Home/End move, 1–7 jump straight to a
 * value, and only one cell is in the tab order.
 */
export function RatingRow({
  value,
  onSelect,
  label,
  disabled = false,
  className,
}: RatingRowProps): React.JSX.Element {
  const rowRef = useRef<HTMLDivElement>(null)

  const focusRating = (rating: Rating): void => {
    rowRef.current?.querySelector<HTMLButtonElement>(`[data-rating="${rating}"]`)?.focus()
  }

  const move = (from: Rating | null, step: number): void => {
    const current = from ?? 4
    const next = Math.min(7, Math.max(1, current + step)) as Rating
    onSelect(next)
    focusRating(next)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (disabled) return
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault()
        move(value, 1)
        return
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault()
        move(value, -1)
        return
      case 'Home':
        event.preventDefault()
        onSelect(1)
        focusRating(1)
        return
      case 'End':
        event.preventDefault()
        onSelect(7)
        focusRating(7)
        return
      default:
        break
    }
    const typed = Number(event.key)
    if (Number.isInteger(typed) && typed >= 1 && typed <= 7) {
      event.preventDefault()
      onSelect(typed as Rating)
      focusRating(typed as Rating)
    }
  }

  // Roving tabindex: the chosen cell, or the middle of the scale before anything is
  // chosen — so a keyboard user lands somewhere neutral rather than on "1".
  const tabStop: Rating = value ?? 4

  return (
    <div
      ref={rowRef}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      // The cells are `flex-1 aspect-square`, so the row's width sets their height too.
      // Capped, because in a stacked single-column layout an uncapped row turns seven
      // numbers into seven 130px slabs — which is not the control the comp specifies.
      className={cn('flex max-w-[27rem] gap-[7px]', className)}
    >
      {RATINGS.map((rating) => {
        const selected = value === rating
        return (
          <button
            key={rating}
            type="button"
            role="radio"
            aria-checked={selected}
            data-rating={rating}
            data-numeric
            tabIndex={rating === tabStop ? 0 : -1}
            disabled={disabled}
            onClick={() => onSelect(rating)}
            className={cn(
              'transition-quiet rounded-control font-display text-lg',
              'flex aspect-square flex-1 items-center justify-center border select-none',
              'disabled:pointer-events-none disabled:opacity-45',
              selected
                ? 'bg-accent text-on-accent border-accent'
                : 'bg-card text-ink2 border-line hover:border-accent hover:text-ink'
            )}
          >
            {rating}
          </button>
        )
      })}
    </div>
  )
}
