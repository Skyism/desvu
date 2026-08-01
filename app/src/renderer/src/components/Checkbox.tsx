import type { InputHTMLAttributes, ReactNode } from 'react'

import { cn } from '@/lib/cn'

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: ReactNode
  /** Strike and dim the label when checked, as the todo lists do. */
  strikeWhenChecked?: boolean
  className?: string
}

/**
 * A real `<input type="checkbox">` behind a styled box — so Space toggles it, the label
 * is clickable, and screen readers get a checkbox rather than a div that looks like one.
 */
export function Checkbox({
  label,
  strikeWhenChecked = false,
  className,
  checked,
  disabled,
  ...rest
}: CheckboxProps): React.JSX.Element {
  return (
    <label
      className={cn(
        'group inline-flex min-w-0 items-center gap-2.5',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        className
      )}
    >
      <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} {...rest} />
      <span
        aria-hidden
        className={cn(
          'transition-quiet flex h-[17px] w-[17px] flex-none items-center justify-center',
          'rounded-check border-[1.5px] border-chk',
          'peer-checked:border-accent peer-checked:bg-accent',
          // The glyph is a descendant, not a sibling, so it needs the arbitrary-child form.
          'peer-checked:[&>svg]:opacity-100',
          'peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent'
        )}
      >
        <svg
          viewBox="0 0 12 12"
          className="text-on-accent h-2.5 w-2.5 opacity-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2 6.4 4.6 9 10 3.2" />
        </svg>
      </span>
      {label != null && (
        <span
          className={cn(
            'text-md min-w-0',
            strikeWhenChecked && 'peer-checked:text-done peer-checked:line-through'
          )}
        >
          {label}
        </span>
      )}
    </label>
  )
}
