import { Badge, Dot } from '../Badge'
import { Button } from '../Button'
import { useInboxCount } from '@/store/inbox'
import { useResolvedTheme, useUi } from '@/store/ui'
import { QUICK_CAPTURE_HINT } from './QuickCapture'
import { SortInboxControl } from './SortInboxControl'

/**
 * The controls that sit on every surface, rendered by `<Page>`. If something belongs
 * everywhere it belongs here — never copy-pasted into a surface's `actions`.
 */
export function GlobalControls(): React.JSX.Element {
  const inbox = useInboxCount()
  const openQuickCapture = useUi((state) => state.openQuickCapture)
  const openSearch = useUi((state) => state.openSearch)

  return (
    <>
      <InboxPill count={inbox.data} failed={inbox.error != null} loading={inbox.loading} />
      {/* Sits beside the count it acts on — the pill states the problem, this solves it. */}
      <SortInboxControl pending={inbox.data ?? 0} />
      <Button
        variant="secondary"
        size="md"
        shape="pill"
        onClick={openSearch}
        title="Search everything — ⌘K"
      >
        Search <span className="text-muted ml-1">⌘K</span>
      </Button>
      <Button
        variant="secondary"
        size="md"
        shape="pill"
        onClick={openQuickCapture}
        title={`Quick capture — ${QUICK_CAPTURE_HINT}`}
      >
        Capture
      </Button>
      <ThemeControl />
    </>
  )
}

function InboxPill({
  count,
  failed,
  loading,
}: {
  count: number | null
  failed: boolean
  loading: boolean
}): React.JSX.Element {
  // The storage layer may not be wired up yet, or the vault may be missing. Say so
  // quietly and move on — this is a status pill, not an alarm.
  if (failed) {
    return (
      <Badge tone="neutral" className="text-muted">
        <Dot tone="faint" />
        inbox unavailable
      </Badge>
    )
  }
  if (count == null) {
    return (
      <Badge tone="neutral" className="text-muted">
        <Dot tone="faint" />
        {loading ? 'reading inbox…' : 'inbox'}
      </Badge>
    )
  }
  return (
    <Badge tone="neutral">
      <Dot tone={count > 0 ? 'accent' : 'faint'} />
      {count > 0 ? `${count} captured, unsorted` : 'inbox clear'}
    </Badge>
  )
}

/**
 * Light → dark → follow the room → light.
 *
 * The default is "follow the room", i.e. `prefers-color-scheme`; picking either lamp
 * state is a manual override that persists. The label states what is true right now,
 * as the comp does; `aria-label` states what clicking will do.
 */
function ThemeControl(): React.JSX.Element {
  const theme = useUi((state) => state.theme)
  const cycleTheme = useUi((state) => state.cycleTheme)
  const resolved = useResolvedTheme()

  const label =
    theme === 'system' ? 'follow the room' : resolved === 'dark' ? 'lamp off' : 'lamp on'
  const next =
    theme === 'light' ? 'the dark theme' : theme === 'dark' ? 'the system theme' : 'the light theme'

  return (
    <Button
      variant="secondary"
      size="md"
      shape="pill"
      onClick={cycleTheme}
      aria-label={`Switch to ${next}`}
      leading={
        <span
          aria-hidden
          className="rounded-pill h-[11px] w-[11px] flex-none border-[1.5px] border-current"
          style={{
            background:
              theme === 'system'
                ? 'linear-gradient(to right, transparent 50%, currentColor 50%)'
                : resolved === 'dark'
                  ? 'currentColor'
                  : 'transparent',
          }}
        />
      }
    >
      {label}
    </Button>
  )
}
