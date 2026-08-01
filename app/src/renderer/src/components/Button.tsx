import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'secondary' | 'soft' | 'ghost' | 'destructive'
export type ButtonSize = 'sm' | 'md'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** `pill` for header chips; `control` (default) for everything else. */
  shape?: 'control' | 'pill'
  /** Disables the button and marks it busy for assistive tech. */
  loading?: boolean
  /** A marker, dot or glyph before the label. */
  leading?: ReactNode
  full?: boolean
}

/**
 * On hover, `primary` and `destructive` lay `--hover` over themselves as an inset
 * shadow. That token is black at 4% in the light theme and white at 4% in the dark one,
 * so a single declaration darkens gold on paper and lightens it on ink. No per-theme
 * hover colours to keep in sync.
 */
const VEIL = 'hover:shadow-[inset_0_0_0_999px_var(--hover)]'

const VARIANT: Record<ButtonVariant, string> = {
  primary: cn('bg-accent text-on-accent border border-transparent', VEIL),
  secondary: 'bg-card text-ink2 border border-line hover:bg-hover hover:text-ink',
  soft: 'bg-soft text-accent-text border border-accent-border hover:bg-accent hover:text-on-accent hover:border-accent',
  ghost: 'bg-transparent text-ink2 border border-transparent hover:bg-hover hover:text-ink',
  // The ONLY red in the product. Delete, discard, drop — nothing else.
  destructive: cn(
    'bg-danger-bg text-danger border border-danger-border',
    'hover:bg-danger hover:text-on-danger hover:border-danger'
  ),
}

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-2',
  md: 'h-10 px-4 text-sm gap-2.5',
}

export function Button({
  variant = 'secondary',
  size = 'md',
  shape = 'control',
  loading = false,
  leading,
  full = false,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps): React.JSX.Element {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'transition-quiet inline-flex items-center justify-center whitespace-nowrap select-none',
        'disabled:pointer-events-none disabled:opacity-45',
        shape === 'pill' ? 'rounded-pill' : 'rounded-control',
        SIZE[size],
        VARIANT[variant],
        full && 'w-full',
        className
      )}
      {...rest}
    >
      {loading ? (
        <span
          aria-hidden
          className="h-1.5 w-1.5 flex-none animate-pulse rounded-pill bg-current"
        />
      ) : (
        leading
      )}
      {children}
    </button>
  )
}
