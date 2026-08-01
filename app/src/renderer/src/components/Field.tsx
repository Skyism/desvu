import { useId, type ReactNode } from 'react'

import { cn } from '@/lib/cn'

export interface FieldProps {
  label?: ReactNode
  /** Quiet helper text under the control. */
  hint?: ReactNode
  /**
   * A validation problem. Rendered in GOLD, not red — red is reserved for destructive
   * actions. A field you have not filled in correctly is information, not damage.
   */
  error?: ReactNode
  required?: boolean
  className?: string
  children: (ids: { id: string; describedBy: string | undefined }) => ReactNode
}

/**
 * Label / hint / error scaffolding shared by Input, Textarea and Select. Wires `id`,
 * `aria-describedby` and `aria-invalid` so callers cannot forget to.
 */
export function Field({
  label,
  hint,
  error,
  required,
  className,
  children,
}: FieldProps): React.JSX.Element {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined

  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      {label != null && (
        <label htmlFor={id} className="text-label tracking-label text-muted uppercase">
          {label}
          {required && <span className="text-accent-text"> ·</span>}
        </label>
      )}
      {children({ id, describedBy })}
      {error != null && (
        <p id={errorId} className="text-accent-text text-xs">
          {error}
        </p>
      )}
      {hint != null && error == null && (
        <p id={hintId} className="text-muted text-xs">
          {hint}
        </p>
      )}
    </div>
  )
}

/** Shared control chrome, so an input, a textarea and a select are visually one family. */
export const CONTROL_CLASS = cn(
  'transition-quiet w-full rounded-field border bg-card px-3.5 py-2.5 text-sm text-ink',
  'border-line placeholder:text-muted',
  'hover:border-accent-border focus:border-accent focus:outline-none',
  'aria-[invalid=true]:border-accent-border',
  'disabled:pointer-events-none disabled:opacity-50'
)
