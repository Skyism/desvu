import { useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Meal, Settings, Workout } from '@shared/types'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { EmptyState } from '@/components/EmptyState'
import { Skeleton } from '@/components/Skeleton'
import { cn } from '@/lib/cn'
import type { VaultQuery } from '@/store/useVaultQuery'
import {
  activeTargets,
  buildTrend,
  daysLogged,
  formatDuration,
  trendAverage,
  type TrendPoint,
} from './nutrition'

type Metric = 'calories' | 'protein' | 'minutes'

const METRICS: { id: Metric; label: string; unit: string }[] = [
  { id: 'calories', label: 'Calories', unit: 'cal' },
  { id: 'protein', label: 'Protein', unit: 'g' },
  { id: 'minutes', label: 'Training', unit: 'min' },
]

const WINDOWS = [14, 30, 90] as const

export interface TrendsCardProps {
  meals: VaultQuery<Meal[]>
  workouts: VaultQuery<Workout[]>
  settings: VaultQuery<Settings>
}

/**
 * Trends over time. Gold bars, one per day, on the same single-accent palette as
 * everything else — no new hues, per the design system's chart note.
 *
 * THE ONE THING THAT MATTERS HERE: a day with nothing logged carries `null`, not `0`.
 * Recharts draws no bar at all, so an unlogged day is a gap in the row. Plotting it as
 * zero would draw a spike down to the axis on every day the user did not write anything
 * down — which reads as a crash, and is the chart equivalent of a broken streak.
 *
 * The target reference line appears only when the user has opted in.
 */
export function TrendsCard({ meals, workouts, settings }: TrendsCardProps): React.JSX.Element {
  const [metric, setMetric] = useState<Metric>('calories')
  const [days, setDays] = useState<(typeof WINDOWS)[number]>(14)

  const points = buildTrend(meals.data ?? [], workouts.data ?? [], { days })
  const active = METRICS.find((entry) => entry.id === metric) ?? METRICS[0]!
  const average = trendAverage(points, metric)
  const logged = daysLogged(points)

  const targets = activeTargets(settings.data)
  const target =
    metric === 'calories' ? targets.calories : metric === 'protein' ? targets.protein_g : null

  const settled = meals.settled && workouts.settled
  const error = meals.error ?? workouts.error
  const anyData = points.some((point) => point[metric] !== null)

  return (
    <Card
      title="Trends"
      meta={`Last ${days} days`}
      actions={
        <div className="flex items-center gap-1.5">
          {METRICS.map((entry) => (
            <Button
              key={entry.id}
              size="sm"
              variant={entry.id === metric ? 'soft' : 'ghost'}
              aria-pressed={entry.id === metric}
              onClick={() => setMetric(entry.id)}
            >
              {entry.label}
            </Button>
          ))}
        </div>
      }
    >
      {!settled && (meals.loading || workouts.loading) && (
        <Skeleton height={180} radius="panel" />
      )}

      {error && (
        <p className="text-muted text-sm">
          The trend can&apos;t be drawn right now. Nothing was lost — every entry is still in
          the vault.
        </p>
      )}

      {!error && settled && !anyData && (
        <EmptyState compact title="Nothing to plot yet.">
          A few days of logging and a shape appears here on its own.
        </EmptyState>
      )}

      {!error && anyData && (
        <div className="flex flex-col gap-4">
          <div className="h-[180px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="22%">
                <CartesianGrid vertical={false} stroke="var(--rule)" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  minTickGap={24}
                  tick={{ fill: 'var(--muted)', fontSize: 10.5 }}
                />
                <YAxis
                  width={38}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: 'var(--muted)', fontSize: 10.5 }}
                />
                {target !== null && (
                  // Only ever drawn when targets are opted in. Gold and dashed — a line
                  // the user asked for, not a threshold the app invented.
                  <ReferenceLine
                    y={target}
                    stroke="var(--accent)"
                    strokeDasharray="3 4"
                    strokeOpacity={0.7}
                    // Without this the axis domain is computed from the data alone and a
                    // target above every logged day is silently dropped — which is
                    // exactly when the line matters most.
                    ifOverflow="extendDomain"
                  />
                )}
                <Tooltip
                  cursor={{ fill: 'var(--hover)' }}
                  content={<TrendTooltip metric={metric} unit={active.unit} />}
                />
                <Bar dataKey={metric} fill="var(--accent)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="text-muted flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 text-xs">
            {/* Factual. "9 days carry a number" — never "you missed 5 days". */}
            <span>
              {average === null
                ? 'Nothing counted in this window yet.'
                : metric === 'minutes'
                  ? `${formatDuration(average)} a day across the ${logged} ${logged === 1 ? 'day' : 'days'} with training.`
                  : `${average} ${active.unit} a day across the ${logged} ${logged === 1 ? 'day' : 'days'} you counted.`}
            </span>
            <span className="flex items-center gap-1.5">
              {WINDOWS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={option === days}
                  onClick={() => setDays(option)}
                  className={cn(
                    'transition-quiet rounded-pill px-2 py-0.5',
                    option === days ? 'bg-soft text-accent-text' : 'hover:text-ink'
                  )}
                >
                  {option}d
                </button>
              ))}
            </span>
          </div>
        </div>
      )}
    </Card>
  )
}

interface TooltipProps {
  active?: boolean
  payload?: { payload: TrendPoint }[]
  metric: Metric
  unit: string
}

function TrendTooltip({ active, payload, metric, unit }: TooltipProps): React.JSX.Element | null {
  const point = payload?.[0]?.payload
  if (!active || !point) return null
  const value = point[metric]
  if (value === null) return null

  return (
    <div className="bg-band border-line rounded-field shadow-card border px-3 py-2 text-xs">
      <div className="text-muted">{point.label}</div>
      {/* Estimated totals stay italic here too — the disclaimer follows the number. */}
      <div
        data-numeric
        className={cn(metric !== 'minutes' && point.estimated ? 'text-estimate text-sm' : 'text-ink')}
      >
        {metric !== 'minutes' && point.estimated ? '~' : ''}
        {value} {unit}
      </div>
    </div>
  )
}
