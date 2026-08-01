import type { DateString } from '@shared/types'

import { Eyebrow } from '@/components/Card'
import { Skeleton } from '@/components/Skeleton'
import { cn } from '@/lib/cn'
import { GRID_CAPTION, gridCellLabel, type GridDay } from './journal-model'

export interface MonthGridProps {
  days: readonly GridDay[]
  selected: DateString
  onSelect: (date: DateString) => void
  loading?: boolean
  className?: string
}

/**
 * The last thirty days, ported from the comp: fifteen columns, 5px gaps, 4px radius.
 *
 * **PRD J6 lives here.** A day with an entry is a soft gold tile; a day without one is
 * `--rule`, the same hairline grey the app draws dividers with. Not red, not hatched, not
 * outlined, not dimmer as it gets older, no "you missed this" tooltip. Someone coming back
 * after three weeks sees a band of quiet neutral space and one caption — *Empty is just
 * empty.* — and the screen makes no claim about them at all.
 *
 * There is no visual state between "entry" and "no entry", because `GridDay` has no third
 * state to render. That is the enforcement: the guilt case is unreachable from the type.
 *
 * Every cell is a button, including the empty ones. Writing a day up later is the normal
 * way this journal gets used — on 50 of the 83 real entries `created_at` post-dates
 * `entry_date`, by up to six days — so an empty square is an opening, not a hole.
 */
export function MonthGrid({
  days,
  selected,
  onSelect,
  loading = false,
  className,
}: MonthGridProps): React.JSX.Element {
  return (
    <section className={cn('border-line mt-5 border-t pt-4', className)}>
      <Eyebrow className="mb-[11px]">Last thirty days</Eyebrow>

      {loading ? (
        <Skeleton height={44} radius="field" />
      ) : (
        <div
          className="grid grid-cols-[repeat(15,minmax(0,1fr))] gap-[5px]"
          role="group"
          aria-label="The last thirty days. Days you wrote are filled; days you did not are empty."
        >
          {days.map((day) => {
            const label = gridCellLabel(day)
            const isSelected = day.date === selected
            return (
              <button
                key={day.date}
                type="button"
                title={label}
                aria-label={label}
                aria-pressed={isSelected}
                onClick={() => onSelect(day.date)}
                className={cn(
                  'transition-quiet rounded-cell aspect-square',
                  // The only two states there are.
                  day.entry ? 'bg-accent-border' : 'bg-rule',
                  'hover:bg-accent-border',
                  isSelected && 'outline-accent outline-2 outline-offset-1',
                  // Today gets a whisper of an edge so the row has a "you are here",
                  // and only when the selection ring is not already saying it.
                  day.isToday && !isSelected && 'ring-accent-border ring-1 ring-inset'
                )}
              />
            )
          })}
        </div>
      )}

      <p className="text-muted mt-[11px] text-xs">{GRID_CAPTION}</p>
    </section>
  )
}
