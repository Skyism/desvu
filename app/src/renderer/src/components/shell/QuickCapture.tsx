import { useEffect, useRef, useState } from 'react'

import { readableMessage } from '@/lib/bridge'
import { captureToInbox } from '@/store/inbox'
import { useUi } from '@/store/ui'
import { Button } from '../Button'
import { Dialog } from '../Dialog'
import { useToast } from '../Toast'

const IS_MAC = navigator.platform.toLowerCase().includes('mac')

/** In-app shortcut. The global one (works when Dès vu is not focused) is ⌘⇧Space. */
export const QUICK_CAPTURE_HINT = IS_MAC ? '⌘⇧K' : 'Ctrl+Shift+K'
export const QUICK_CAPTURE_GLOBAL_HINT = IS_MAC ? '⌘⇧Space' : 'Ctrl+Shift+Space'

/**
 * PRD C8 — desktop quick capture.
 *
 * Two capture surfaces, phone and desktop; one Inbox; one sort skill. This writes the
 * same raw timestamped line the Telegram bot writes and does no parsing whatsoever —
 * `/sort-inbox` routes it later. Capture is never blocked by taxonomy, so there is no
 * category picker, no priority, no date. One field.
 *
 * On failure the dialog STAYS OPEN with the text intact. Losing a capture to a failed
 * write is the worst thing this component could do.
 */
export function QuickCapture(): React.JSX.Element {
  const open = useUi((state) => state.quickCaptureOpen)
  const close = useUi((state) => state.closeQuickCapture)
  const { toast } = useToast()

  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!open) return
    setProblem(null)
    // Autofocus after the dialog mounts.
    const id = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [open])

  const submit = async (): Promise<void> => {
    const trimmed = text.trim()
    if (!trimmed || saving) return
    setSaving(true)
    setProblem(null)
    try {
      await captureToInbox(trimmed)
      setText('')
      close()
      toast('Captured. It is in the Inbox until you sort it.', { tone: 'accent' })
    } catch (thrown) {
      setProblem(readableMessage(thrown))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      size="capture"
      title="Quick capture"
      hideTitle
      className="gap-3"
    >
      <textarea
        ref={inputRef}
        value={text}
        rows={3}
        placeholder="Anything at all. It lands raw in the Inbox."
        aria-label="Quick capture"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          // Enter submits; Shift+Enter is a newline. Capture should cost one keystroke.
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            void submit()
          }
        }}
        className="text-ink placeholder:text-muted w-full resize-none border-0 bg-transparent p-0 text-lg leading-relaxed focus:outline-none"
      />

      <div className="border-line flex items-center justify-between gap-4 border-t pt-3">
        <p className="text-muted text-xs">
          {problem ? (
            // Not red: a failed write is information, not damage. And nothing was lost.
            <span className="text-accent-text">{problem} Your text is still here.</span>
          ) : (
            <>
              Enter to save · {QUICK_CAPTURE_HINT} anywhere in the app ·{' '}
              {QUICK_CAPTURE_GLOBAL_HINT} from anywhere
            </>
          )}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={saving}
            disabled={text.trim().length === 0}
            onClick={() => void submit()}
          >
            Capture
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
