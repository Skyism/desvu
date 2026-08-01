import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { cn } from '@/lib/cn'

export interface DialogProps {
  open: boolean
  onClose: () => void
  /** Required for accessibility. Use `hideTitle` if it should not be seen. */
  title: ReactNode
  hideTitle?: boolean
  description?: ReactNode
  /** Right-aligned footer controls. */
  footer?: ReactNode
  size?: 'capture' | 'sm' | 'md' | 'lg'
  children?: ReactNode
  className?: string
}

const SIZE = {
  capture: 'max-w-[560px]',
  sm: 'max-w-[420px]',
  md: 'max-w-[620px]',
  lg: 'max-w-[860px]',
} as const

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function Dialog({
  open,
  onClose,
  title,
  hideTitle = false,
  description,
  footer,
  size = 'md',
  children,
  className,
}: DialogProps): React.JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return

    restoreFocusRef.current = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus()

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panel) return

      // Keep Tab inside the dialog. A small loop rather than a focus-trap dependency.
      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (element) => element.offsetParent !== null
      )
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (!first || !last) return

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      restoreFocusRef.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center px-6 pt-[18vh] pb-10">
      <div
        className="bg-scrim absolute inset-0"
        onClick={onClose}
        aria-hidden
        data-testid="dialog-scrim"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={cn(
          'rounded-card bg-band border-line shadow-card relative flex w-full flex-col gap-4 border px-8 py-7',
          SIZE[size],
          className
        )}
      >
        <div className={cn('flex flex-col gap-1.5', hideTitle && 'sr-only')}>
          <h2 className="text-hero font-display font-normal">{title}</h2>
          {description != null && <p className="text-muted text-sm">{description}</p>}
        </div>
        {children}
        {footer != null && <div className="flex items-center justify-end gap-2.5 pt-1">{footer}</div>}
      </div>
    </div>,
    document.body
  )
}
