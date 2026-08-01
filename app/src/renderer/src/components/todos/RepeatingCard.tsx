import { useState } from 'react'
import type { Priority, Todo } from '@shared/types'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { CategoryMarker } from '@/components/CategoryMarker'
import { EmptyState } from '@/components/EmptyState'
import { SkeletonLines } from '@/components/Skeleton'
import { RecurrenceDialog } from './RecurrenceDialog'
import { describeRecurrence } from './recurrence'

export interface RepeatingCardProps {
  /** `todos.listTemplates()`. Instances are never in here. */
  templates: readonly Todo[] | null
  /** `todos.list()` — used only to count what each template has produced. */
  allTodos: readonly Todo[] | null
  defaultPriority: Priority
  defaultEstimate: number
  loading: boolean
  error: Error | null
}

type Editing = { template: Todo | null } | null

/**
 * PRD T10 — where the rules live.
 *
 * Templates appear here and nowhere else, by construction: `todos.list()` and
 * `todos.forDate()` both exclude them, and `todos.listTemplates()` returns only them. A
 * user looking for "why does this keep coming back" has exactly one place to look, and
 * switching a chore off is two clicks rather than a hunt through completed instances.
 */
export function RepeatingCard({
  templates,
  allTodos,
  defaultPriority,
  defaultEstimate,
  loading,
  error,
}: RepeatingCardProps): React.JSX.Element {
  const [editing, setEditing] = useState<Editing>(null)

  const instancesOf = (templateId: string): number =>
    (allTodos ?? []).filter((todo) => todo.recurrence_parent === templateId).length

  return (
    <Card
      title="Repeating"
      meta={templates ? `${templates.length} rule${templates.length === 1 ? '' : 's'}` : undefined}
      actions={
        <Button size="sm" variant="soft" shape="pill" onClick={() => setEditing({ template: null })}>
          New
        </Button>
      }
    >
      {loading && !templates && <SkeletonLines lines={2} />}

      {error && (
        <p className="text-muted text-sm">
          The repeating rules can&apos;t be read just now. Nothing was written, and any task
          they already made is still on the list.
        </p>
      )}

      {!error && templates && templates.length === 0 && (
        <EmptyState compact title="Nothing repeats yet.">
          A repeating task keeps one copy on the list at a time. Miss a day and it moves to
          today rather than piling up.
        </EmptyState>
      )}

      {!error && templates && templates.length > 0 && (
        <ul className="flex flex-col gap-1">
          {templates.map((template) => (
            <li key={template.id}>
              <button
                type="button"
                onClick={() => setEditing({ template })}
                className="rounded-control transition-quiet hover:bg-hover flex w-full items-center gap-2.5 px-2 py-2.5 text-left"
              >
                <CategoryMarker category={template.category} />
                <span className="text-md text-ink min-w-0 flex-1 truncate">{template.text}</span>
                <span className="text-muted text-xs whitespace-nowrap">
                  {describeRecurrence(template.recurrence)}
                </span>
                <span className="text-muted text-xs whitespace-nowrap" data-numeric>
                  {template.estimate_minutes ?? defaultEstimate}m
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <RecurrenceDialog
        open={editing !== null}
        template={editing?.template ?? null}
        instanceCount={editing?.template ? instancesOf(editing.template.id) : 0}
        defaultPriority={defaultPriority}
        defaultEstimate={defaultEstimate}
        onClose={() => setEditing(null)}
      />
    </Card>
  )
}
