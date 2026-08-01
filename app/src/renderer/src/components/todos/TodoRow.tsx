import type { DateString, Todo } from '@shared/types'

import { Checkbox } from '@/components/Checkbox'
import { PriorityEdge } from '@/components/PriorityEdge'
import { cn } from '@/lib/cn'
import { overdueLabel, rowMeta } from './grouping'

export interface TodoRowProps {
  todo: Todo
  fallbackEstimate: number
  /** Today's date, for the overdue label. */
  today: DateString
  /** Called when the checkbox changes. Completing writes immediately. */
  onToggle: (todo: Todo) => void
  /** Called when the text is clicked. Opens the editor (PRD T1). */
  onEdit: (todo: Todo) => void
  /** Disables the checkbox while its write is in flight. */
  busy?: boolean
}

/**
 * One line of the list, exactly as the comp draws it:
 *
 *   [gold edge] [checkbox] Rewrite resume bullets for infra roles   ↻   p1 · 45m
 *
 * Four signals, none of which is colour alone. The edge is `PriorityEdge` (p0/p1 only —
 * there is deliberately no p2 or p3 label, because unmarked *means* normal). The category
 * is not on the row at all; it is the group heading above it, which is what lets the row
 * stay this quiet.
 *
 * The checkbox completes and the text opens the editor. The comp toggled on the whole
 * row, but the comp had no edit path; splitting them is what makes T1's "edit" reachable
 * without a menu, and it keeps a mis-aimed click from silently completing something.
 */
export function TodoRow({
  todo,
  fallbackEstimate,
  today,
  onToggle,
  onEdit,
  busy = false,
}: TodoRowProps): React.JSX.Element {
  const done = todo.status === 'done'
  const late = overdueLabel(todo, today)

  return (
    <div className="rounded-control transition-quiet hover:bg-hover flex items-center gap-2.5 py-2.5 pr-3 pl-2">
      <PriorityEdge priority={todo.priority} />

      <Checkbox
        checked={done}
        disabled={busy}
        onChange={() => onToggle(todo)}
        aria-label={done ? `Reopen ${todo.text}` : `Complete ${todo.text}`}
      />

      <button
        type="button"
        onClick={() => onEdit(todo)}
        className={cn(
          'text-md min-w-0 flex-1 truncate text-left',
          done ? 'text-done line-through' : 'text-ink hover:text-accent-text'
        )}
      >
        {todo.text}
      </button>

      {todo.recurrence_parent !== null && (
        // The instance of a repeating task. The glyph is a hint, not the encoding — the
        // Repeating card is where the rule itself lives.
        <span className="text-muted text-xs" title="Repeats">
          ↻
        </span>
      )}

      {late !== null && !done && (
        // PRD T7 — unmissable, never punitive. Gold, because red in this app means
        // something is about to be destroyed, and a late task is just late.
        <span className="text-accent-text text-xs whitespace-nowrap">{late}</span>
      )}

      <span className="text-muted text-xs whitespace-nowrap" data-numeric>
        {rowMeta(todo, fallbackEstimate)}
      </span>
    </div>
  )
}
