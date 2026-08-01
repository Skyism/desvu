import type { ReactNode } from 'react'

import { Card } from '@/components/Card'
import { Page } from '@/components/Page'
import { ROUTES, type RouteId } from '@/lib/routes'

export interface PlaceholderProps {
  route: RouteId
  /** The date line, when the surface is time-bound. */
  eyebrow?: ReactNode
  /** What will live here, in the order it will appear. One line each. */
  willHold: string[]
  /** The PRD requirement ids this surface has to satisfy. */
  requirements: string
}

/**
 * A surface that has not been built yet. Deliberately not an empty white page: it names
 * the surface, says what will live there, and cites the requirements — so whoever picks
 * it up starts from the contract rather than from the comp screenshot.
 *
 * Delete this component's usage when you build the real surface. Do not extend it.
 */
export function Placeholder({
  route,
  eyebrow,
  willHold,
  requirements,
}: PlaceholderProps): React.JSX.Element {
  const meta = ROUTES[route]

  return (
    <Page title={meta.title} eyebrow={eyebrow} description={meta.description}>
      <Card title="Not built yet" meta={requirements}>
        <ul className="flex flex-col gap-3.5">
          {willHold.map((line) => (
            <li key={line} className="flex items-baseline gap-3">
              <span aria-hidden className="bg-faint rounded-pill mt-2 h-1 w-1 flex-none" />
              <span className="text-ink2 text-sm">{line}</span>
            </li>
          ))}
        </ul>
        <p className="text-muted mt-6 text-xs">
          Wire this surface up by replacing its file in <code>src/renderer/src/surfaces/</code>.
          Return exactly one <code>&lt;Page&gt;</code>; read through{' '}
          <code>useVaultQuery</code>; write through <code>bridge()</code> then{' '}
          <code>invalidateVault()</code>.
        </p>
      </Card>
    </Page>
  )
}
