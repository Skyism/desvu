import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

import { cn } from '@/lib/cn'
import { CONTROL_CLASS, Field, type FieldProps } from './Field'

type FieldShell = Pick<FieldProps, 'label' | 'hint' | 'error' | 'required' | 'className'>

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'>,
    FieldShell {
  /** Class for the control itself; `className` styles the field wrapper. */
  inputClassName?: string
}

export function Input({
  label,
  hint,
  error,
  required,
  className,
  inputClassName,
  ...rest
}: InputProps): React.JSX.Element {
  return (
    <Field {...{ label, hint, error, required, className }}>
      {({ id, describedBy }) => (
        <input
          id={id}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          required={required}
          className={cn(CONTROL_CLASS, inputClassName)}
          {...rest}
        />
      )}
    </Field>
  )
}

export interface TextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'>,
    FieldShell {
  textareaClassName?: string
}

export function Textarea({
  label,
  hint,
  error,
  required,
  className,
  textareaClassName,
  rows = 4,
  ...rest
}: TextareaProps): React.JSX.Element {
  return (
    <Field {...{ label, hint, error, required, className }}>
      {({ id, describedBy }) => (
        <textarea
          id={id}
          rows={rows}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          required={required}
          className={cn(CONTROL_CLASS, 'resize-y leading-relaxed', textareaClassName)}
          {...rest}
        />
      )}
    </Field>
  )
}

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'>,
    FieldShell {
  selectClassName?: string
}

/**
 * A native `<select>`. The popup is drawn by the OS and follows `color-scheme`, which
 * `tokens.css` sets — so it is already themed and nothing here needs to reimplement it.
 */
export function Select({
  label,
  hint,
  error,
  required,
  className,
  selectClassName,
  children,
  ...rest
}: SelectProps): React.JSX.Element {
  return (
    <Field {...{ label, hint, error, required, className }}>
      {({ id, describedBy }) => (
        <div className="relative">
          <select
            id={id}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            required={required}
            className={cn(CONTROL_CLASS, 'appearance-none pr-9', selectClassName)}
            {...rest}
          >
            {children}
          </select>
          <span
            aria-hidden
            className="text-muted pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-[9px]"
          >
            ▾
          </span>
        </div>
      )}
    </Field>
  )
}
