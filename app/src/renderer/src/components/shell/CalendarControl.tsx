import { Button } from '../Button'
import { describeLastRefresh, useCalendarSync } from '@/store/calendar'

/**
 * Google Calendar sync, beside the other global controls.
 *
 * Three states, because "not set up", "not connected" and "connected but stale" have three
 * different fixes and collapsing them into one "calendar unavailable" leaves the user with
 * nowhere to go. Nothing here is ever red: an unconnected calendar is a feature you have
 * not turned on, not damage.
 */
export function CalendarControl(): React.JSX.Element | null {
  const { status, refreshing, lastResult, refresh, dismiss } = useCalendarSync()

  if (!status) return null

  // Never set up. Say where the instructions are rather than offering a button that
  // opens a five-minute Google Cloud detour the user did not ask for.
  if (!status.configured) {
    return (
      <span className="text-muted text-xs" title="See ~/.config/desvu/README.md">
        Calendar not set up
      </span>
    )
  }

  if (!status.connected) {
    return (
      <span
        className="text-muted text-xs"
        title="Run: node scripts/google-auth.mjs — approves access in your own browser"
      >
        Calendar not connected
      </span>
    )
  }

  if (refreshing) {
    return <span className="text-muted text-xs">syncing calendar…</span>
  }

  if (lastResult && !lastResult.ok) {
    return (
      <button
        type="button"
        onClick={dismiss}
        className="text-accent-text hover:text-ink text-xs"
        title={lastResult.error}
      >
        Calendar didn’t sync
      </button>
    )
  }

  const when = describeLastRefresh(status.last_refresh)
  return (
    <Button
      variant="ghost"
      size="md"
      shape="pill"
      onClick={refresh}
      title={when ? `Calendar synced ${when}. Click to pull again.` : 'Pull your calendar now'}
    >
      {when ? `Calendar · ${when}` : 'Sync calendar'}
    </Button>
  )
}
