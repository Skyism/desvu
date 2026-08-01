import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'
import { GlobalControls } from './shell/GlobalControls'

export interface PageProps {
  /** Cormorant page title, sentence case, no trailing punctuation. "Today", "Journal". */
  title: ReactNode
  /** Uppercase eyebrow above the title. Usually the date. */
  eyebrow?: ReactNode
  /** One quiet line under the title saying what this surface is for. */
  description?: ReactNode
  /** Surface-specific controls. Rendered left of the persistent app controls. */
  actions?: ReactNode
  /** The surface's own content — a stack of `<Card>`s, gutter-spaced automatically. */
  children: ReactNode
  className?: string
}

/**
 * THE SURFACE CONTRACT.
 *
 * Every routed surface returns exactly one `<Page>` and nothing above it. That is what
 * makes the seven surfaces feel like one app: the eyebrow, the Cormorant title, the page
 * gutters, the scroll container and the persistent controls (inbox pill, theme, quick
 * capture) are all owned here, so no surface can drift on any of them.
 *
 *   export function FinanceSurface() {
 *     return (
 *       <Page title="Finance" eyebrow="August" description="Spending against your limits.">
 *         <Card title="This month" meta="August, so far">…</Card>
 *         <Card title="Recent">…</Card>
 *       </Page>
 *     )
 *   }
 *
 * Rules for whoever builds a surface next:
 *   · One `<Page>` per surface. Do not nest, do not render two, do not skip it.
 *   · Children are the content column. `<Page>` already applies the 20px gutter between
 *     them, so do not add your own outer spacing wrapper.
 *   · Put persistent chrome nowhere. If a control belongs on every surface it belongs in
 *     `GlobalControls`, not copy-pasted into `actions`.
 *   · A loading surface renders `<Skeleton>` inside its cards, not instead of the Page.
 *   · An error renders inside a card as a quiet line — never a red banner, never a
 *     blank screen.
 */
export function Page({
  title,
  eyebrow,
  description,
  actions,
  children,
  className,
}: PageProps): React.JSX.Element {
  return (
    <div className={cn('flex h-full min-w-0 flex-col overflow-y-auto', className)}>
      <header className="px-page-x pt-page-y flex flex-col gap-3.5">
        {/* Title and controls share one baseline row, as in the comp. */}
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="min-w-0">
            {eyebrow != null && (
              <div className="text-label tracking-page text-muted mb-[7px] uppercase">{eyebrow}</div>
            )}
            <h1 className="font-display text-display tracking-display font-normal">{title}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {actions}
            <GlobalControls />
          </div>
        </div>
        {/* Its own row, so it gets the full measure instead of being squeezed by the
            controls into a two-word orphan line. */}
        {description != null && <p className="text-muted max-w-[92ch] text-sm">{description}</p>}
      </header>

      <main className="gap-gutter px-page-x pt-gutter flex min-w-0 flex-1 flex-col pb-12">
        {children}
      </main>
    </div>
  )
}
