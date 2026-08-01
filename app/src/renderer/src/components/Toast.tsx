import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

import { cn } from '@/lib/cn'

/**
 * Tones are `neutral` and `accent`. There is deliberately no error tone and no red one.
 *
 * Red is reserved for destructive actions, and a failed write is not damage — it is
 * information, and the app should say so without alarming anyone. Write failure copy
 * that says what happened and what survived: "Couldn't reach the vault. Nothing was lost."
 */
export type ToastTone = 'neutral' | 'accent'

export interface ToastOptions {
  tone?: ToastTone
  /** Milliseconds. Pass 0 to require a manual dismiss. */
  duration?: number
}

interface ToastRecord extends Required<ToastOptions> {
  id: number
  message: ReactNode
}

interface ToastContextValue {
  toast: (message: ReactNode, options?: ToastOptions) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside <ToastProvider>.')
  return context
}

export function ToastProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [items, setItems] = useState<ToastRecord[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id))
  }, [])

  const toast = useCallback(
    (message: ReactNode, options: ToastOptions = {}) => {
      const id = nextId.current++
      const record: ToastRecord = {
        id,
        message,
        tone: options.tone ?? 'neutral',
        duration: options.duration ?? 4200,
      }
      setItems((current) => [...current, record])
      if (record.duration > 0) window.setTimeout(() => dismiss(id), record.duration)
    },
    [dismiss]
  )

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed right-6 bottom-6 z-60 flex flex-col items-end gap-2.5"
      >
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => dismiss(item.id)}
            className={cn(
              'rounded-panel shadow-card pointer-events-auto max-w-[380px] border px-4 py-3 text-left text-sm',
              item.tone === 'accent'
                ? 'bg-soft text-accent-text border-accent-border'
                : 'bg-band text-ink2 border-line'
            )}
          >
            {item.message}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
