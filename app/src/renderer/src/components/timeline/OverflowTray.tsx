import type { Todo } from '@shared/types'

import { CategoryMarker } from '@/components/CategoryMarker'
import { estimateOf } from '@/components/todos/grouping'

export interface OverflowTrayProps {
  /** `dayLoad.overflow`, verbatim — the repository decides what does not fit. */
  overflow: readonly Todo[]
  fallbackEstimate: number
  /**
   * Todos the repository counted as fitting but the rail had no room to draw, because it
   * stops at 11pm and the free-time window runs to midnight. Listed under the same
   * heading, since from where the user is standing they are the same problem.
   */
  spilled?: readonly Todo[]
}

/**
 * How many names the tray shows before it stops counting out loud.
 *
 * On a badly overcommitted day the honest answer is "nine things", and nine rows makes
 * the hero twice the height of the rail it exists to annotate — at which point the thing
 * you are supposed to see at a glance no longer fits on the glance. The full set is
 * always in the list below; the tray's job is to name enough of it to be actionable.
 */
const VISIBLE = 5

/**
 * WON'T FIT TODAY.
 *
 * The tray is the point of the whole hero: not "you are over by 2h10m" but *these three,
 * by name, are the ones that will not happen*. That is a decision you can act on — cut
 * one, move one, or accept the late night deliberately.
 *
 * It is gold and grey. Being over is information, not damage, and red in this app means
 * something is about to be destroyed.
 */
export function OverflowTray({
  overflow,
  fallbackEstimate,
  spilled = [],
}: OverflowTrayProps): React.JSX.Element {
  const items = [...overflow, ...spilled]
  const shown = items.slice(0, VISIBLE)
  const rest = items.length - shown.length

  return (
    <div className="border-line flex flex-none basis-[212px] flex-col gap-[9px] self-start border-l pl-5">
      <div className="text-micro tracking-label text-muted uppercase">
        {items.length > 0 ? "Won't fit today" : 'All placed'}
      </div>

      {items.length === 0 ? (
        <p className="text-muted text-xs">Everything on the list has somewhere to go.</p>
      ) : (
        <>
          <ul className="flex flex-col gap-[9px]">
            {shown.map((todo) => (
              <li key={todo.id} className="flex items-center gap-[9px]">
                <CategoryMarker category={todo.category} size={7} />
                <span className="text-ink2 min-w-0 flex-1 text-xs leading-[1.35]">{todo.text}</span>
                <span className="text-muted text-xs" data-numeric>
                  {estimateOf(todo, fallbackEstimate)}m
                </span>
              </li>
            ))}
          </ul>
          {rest > 0 && (
            <p className="text-muted text-xs">and {rest} more on the list below.</p>
          )}
        </>
      )}
    </div>
  )
}
