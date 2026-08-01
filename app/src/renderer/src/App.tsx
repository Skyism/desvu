import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { QuickCapture } from '@/components/shell/QuickCapture'
import { Sidebar } from '@/components/shell/Sidebar'
import { ToastProvider } from '@/components/Toast'
import { hasBridge } from '@/lib/bridge'
import { SURFACES } from '@/surfaces'
import { useUi } from '@/store/ui'

export function App(): React.JSX.Element {
  return (
    <ToastProvider>
      <Shell />
      <QuickCapture />
    </ToastProvider>
  )
}

function Shell(): React.JSX.Element {
  const route = useUi((state) => state.route)
  const openQuickCapture = useUi((state) => state.openQuickCapture)
  const Surface = SURFACES[route]

  useEffect(() => {
    // In-app shortcut. The global accelerator (⌘⇧Space) is registered in the main
    // process and arrives via `onQuickCapture`, wired up in `main.tsx`.
    const onKeyDown = (event: KeyboardEvent): void => {
      const modifier = event.metaKey || event.ctrlKey
      if (modifier && event.shiftKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        openQuickCapture()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openQuickCapture])

  return (
    <div className="bg-bg text-ink flex h-full min-h-0 w-full">
      <Sidebar />
      <div className="min-w-0 flex-1">
        <SurfaceBoundary key={route}>
          <Surface />
        </SurfaceBoundary>
      </div>
    </div>
  )
}

/**
 * A crash in one surface must not take the shell with it — the sidebar has to stay
 * usable so the user can navigate away from the broken thing. Keyed by route, so
 * navigating resets the boundary.
 */
class SurfaceBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[desvu] surface crashed', error, info.componentStack)
  }

  override render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="px-page-x pt-page-y flex h-full flex-col overflow-y-auto pb-12">
        <Card title="This surface stopped" meta="nothing was written">
          <p className="text-ink2 text-sm">
            {error.message || 'Something in this view failed to render.'}
          </p>
          <p className="text-muted mt-3 text-xs">
            The vault is untouched — reads and writes both go through the main process, and
            this failure happened after that.
            {!hasBridge() && ' The app bridge is also unavailable, which usually means a restart is needed.'}
          </p>
          <div className="mt-6">
            <Button variant="soft" size="sm" onClick={() => this.setState({ error: null })}>
              Try again
            </Button>
          </div>
        </Card>
      </div>
    )
  }
}
