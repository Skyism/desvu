import { Fragment, useState } from 'react'
import type { DateString, Priority, Todo } from '@shared/types'

import { Card } from '@/components/Card'
import { CategoryMarker } from '@/components/CategoryMarker'
import { EmptyState } from '@/components/EmptyState'
import { SkeletonLines } from '@/components/Skeleton'
import { useToast } from '@/components/Toast'
import { readableMessage } from '@/lib/bridge'
import { completeTodo, recordActualMinutes, reopenTodo } from '@/store/todos'
import { CompletionCapture } from './CompletionCapture'
import { QuickAddTodo } from './QuickAddTodo'
import { TodoEditDialog } from './TodoEditDialog'
import { TodoRow } from './TodoRow'
import { groupByCategory, openCountLabel } from './grouping'

export interface TodoListProps {
  /** Today's list — see `todaysList`. Null while loading or failed. */
  todos: readonly Todo[] | null
  date: DateString
  fallbackEstimate: number
  defaultPriority: Priority
  loading: boolean
  error: Error | null
}

/**
 * PRD T1 · T2 · T3 · T6 · T11 — the list, grouped by category, priority-sorted within
 * each group.
 *
 * The category heading carries a `CategoryMarker`, which resolves by **shape**: square,
 * circle, diamond. The three hues sit within 1.03:1 of each other by design, so at 8px
 * they are three identical dots and colour is decoration. Here the heading text names the
 * category anyway; the marker matters because the same three shapes appear on the rail
 * above, where there is no heading to read.
 */
export function TodoList({
  todos,
  date,
  fallbackEstimate,
  defaultPriority,
  loading,
  error,
}: TodoListProps): React.JSX.Element {
  const { toast } = useToast()
  const [editing, setEditing] = useState<Todo | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  /** At most one capture strip is open — the most recent completion. */
  const [capturing, setCapturing] = useState<Todo | null>(null)

  const groups = groupByCategory(todos ?? [], fallbackEstimate)

  const onToggle = async (todo: Todo): Promise<void> => {
    setBusyId(todo.id)
    try {
      if (todo.status === 'done') {
        await reopenTodo(todo.id)
        setCapturing((current) => (current?.id === todo.id ? null : current))
      } else {
        // The write lands first and unconditionally. The capture strip is an offer that
        // appears afterwards, never a step in front of it (PRD T11).
        await completeTodo(todo.id)
        setCapturing(todo)
      }
    } catch (thrown) {
      toast(readableMessage(thrown))
    } finally {
      setBusyId(null)
    }
  }

  const onRecord = async (todo: Todo, minutes: number): Promise<void> => {
    setCapturing(null)
    try {
      await recordActualMinutes(todo.id, minutes)
    } catch (thrown) {
      toast(readableMessage(thrown))
    }
  }

  return (
    <Card
      title="Today's list"
      meta={todos ? openCountLabel(todos) : undefined}
      className="flex flex-col"
    >
      <QuickAddTodo
        date={date}
        defaultPriority={defaultPriority}
        defaultEstimate={fallbackEstimate}
      />

      {loading && !todos && <SkeletonLines lines={5} />}

      {error && (
        <p className="text-muted text-sm">
          The list can&apos;t be read just now. Nothing was written — the vault still holds
          every task, and Obsidian can open <code className="font-mono">data/todos.json</code>{' '}
          directly.
        </p>
      )}

      {!error && todos && groups.length === 0 && (
        <EmptyState compact title="Nothing due today.">
          Add one above, text the bot, or leave the day as it is.
        </EmptyState>
      )}

      {!error && groups.length > 0 && (
        <div className="flex flex-1 flex-col gap-[22px]">
          {groups.map((group) => (
            <section key={group.category} className="flex flex-col gap-[7px]">
              <h3 className="flex items-center">
                <CategoryMarker category={group.category} showLabel />
              </h3>
              {group.todos.map((todo) => (
                <Fragment key={todo.id}>
                  <TodoRow
                    todo={todo}
                    fallbackEstimate={fallbackEstimate}
                    today={date}
                    busy={busyId === todo.id}
                    onToggle={(target) => void onToggle(target)}
                    onEdit={setEditing}
                  />
                  {capturing?.id === todo.id && todo.status === 'done' && (
                    <CompletionCapture
                      todo={todo}
                      fallbackEstimate={fallbackEstimate}
                      onRecord={(minutes) => void onRecord(todo, minutes)}
                      onDismiss={() => setCapturing(null)}
                    />
                  )}
                </Fragment>
              ))}
            </section>
          ))}
        </div>
      )}

      <TodoEditDialog todo={editing} onClose={() => setEditing(null)} />
    </Card>
  )
}
