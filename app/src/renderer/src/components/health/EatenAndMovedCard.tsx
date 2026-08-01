import type { Meal, Settings, Workout } from '@shared/types'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { EmptyState } from '@/components/EmptyState'
import { SkeletonLines } from '@/components/Skeleton'
import { cn } from '@/lib/cn'
import type { VaultQuery } from '@/store/useVaultQuery'
import { NutritionFigure, EstimateNote } from './NutritionFigure'
import {
  activeTargets,
  addDays,
  dayTotals,
  formatDuration,
  hasAnyTarget,
  targetFraction,
  toDateString,
  trainingMinutes,
  WORKOUT_TYPE_LABEL,
} from './nutrition'

export interface EatenAndMovedCardProps {
  meals: VaultQuery<Meal[]>
  workouts: VaultQuery<Workout[]>
  settings: VaultQuery<Settings>
  onLogMeal: () => void
  onLogWorkout: () => void
  onEditTargets: () => void
  onEditMeal: (meal: Meal) => void
  onEditWorkout: (workout: Workout) => void
}

/**
 * The comp's "Eaten & moved" card, ported: today's meals with their figures, the italic
 * disclaimer line, then a hairline and today's training with yesterday's underneath in
 * muted ink.
 *
 * WHAT IS NOT HERE, BY DESIGN: any comparison the user did not ask for. With
 * `settings.nutrition.show_targets` false — which is the default, and therefore day one —
 * this card has no target line, no "remaining", no percentage, and no way to read as
 * falling short. It logs and it totals. That is all it does until someone opts in.
 */
export function EatenAndMovedCard({
  meals,
  workouts,
  settings,
  onLogMeal,
  onLogWorkout,
  onEditTargets,
  onEditMeal,
  onEditWorkout,
}: EatenAndMovedCardProps): React.JSX.Element {
  const today = toDateString(new Date())
  const yesterday = addDays(today, -1)

  const todayMeals = (meals.data ?? []).filter((meal) => meal.date === today)
  const todayWorkouts = (workouts.data ?? []).filter((workout) => workout.date === today)
  const yesterdayWorkouts = (workouts.data ?? []).filter((workout) => workout.date === yesterday)

  const totals = dayTotals(todayMeals)
  const minutes = trainingMinutes(todayWorkouts)
  const targets = activeTargets(settings.data)
  const showTargets = hasAnyTarget(targets)

  const settled = meals.settled && workouts.settled
  const error = meals.error ?? workouts.error
  const anyEstimated = todayMeals.some((meal) => meal.estimated && meal.calories !== null)
  const empty = todayMeals.length === 0 && todayWorkouts.length === 0

  return (
    <Card
      title="Eaten & moved"
      meta="Today"
      actions={
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="ghost" onClick={onLogMeal}>
            Meal
          </Button>
          <Button size="sm" variant="ghost" onClick={onLogWorkout}>
            Workout
          </Button>
          <Button size="sm" variant="ghost" onClick={onEditTargets}>
            Targets
          </Button>
        </div>
      }
    >
      {!settled && (meals.loading || workouts.loading) && <SkeletonLines lines={4} />}

      {error && (
        <p className="text-muted text-sm">
          Today&apos;s log can&apos;t be read right now. Nothing was lost — it is all still
          in the vault.
        </p>
      )}

      {/* Empty is just empty. No count of what is missing, no streak, no encouragement. */}
      {!error && settled && empty && (
        <EmptyState
          compact
          title="Nothing logged today."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <Button variant="soft" size="sm" onClick={onLogMeal}>
                Log a meal
              </Button>
              <Button variant="ghost" size="sm" onClick={onLogWorkout}>
                Log a workout
              </Button>
            </div>
          }
        >
          A description is enough. Numbers are optional and can be added later, or never.
        </EmptyState>
      )}

      {!error && !empty && (
        <div className="flex flex-col gap-[13px]">
          {todayMeals.map((meal) => (
            <button
              key={meal.id}
              type="button"
              onClick={() => onEditMeal(meal)}
              className="transition-quiet rounded-block hover:bg-hover -mx-2 flex items-baseline justify-between gap-3 px-2 py-0.5 text-left"
            >
              <span className="min-w-0 flex-1 truncate text-base">
                {meal.description.trim() === '' ? (
                  <span className="text-muted">Unnamed {meal.meal}</span>
                ) : (
                  meal.description
                )}
              </span>
              <NutritionFigure
                calories={meal.calories}
                protein={meal.protein_g}
                estimated={meal.estimated}
              />
            </button>
          ))}

          {anyEstimated && <EstimateNote />}

          {(todayWorkouts.length > 0 || yesterdayWorkouts.length > 0) && (
            <div className="border-line mt-1 flex flex-col gap-[9px] border-t pt-[15px]">
              {todayWorkouts.map((workout) => (
                <WorkoutRow key={workout.id} workout={workout} onClick={() => onEditWorkout(workout)} />
              ))}
              {yesterdayWorkouts.map((workout) => (
                <WorkoutRow
                  key={workout.id}
                  workout={workout}
                  prefix="Yesterday — "
                  muted
                  onClick={() => onEditWorkout(workout)}
                />
              ))}
            </div>
          )}

          {(totals.calories !== null || minutes !== null) && (
            <div className="border-line text-muted flex items-baseline justify-between gap-3 border-t pt-[13px] text-xs">
              <span>Today</span>
              <span className="flex items-baseline gap-3">
                {totals.calories !== null && (
                  <NutritionFigure
                    calories={totals.calories}
                    protein={totals.protein_g}
                    estimated={totals.estimated}
                  />
                )}
                {minutes !== null && <span data-numeric>{formatDuration(minutes)} training</span>}
              </span>
            </div>
          )}

          {/* Opt-in only. `show_targets` is false in DEFAULT_SETTINGS, so this branch does
              not exist on day one and cannot make an unasked-for judgement. */}
          {showTargets && (
            <div className="flex flex-col gap-2.5 pt-1">
              <TargetBar label="Calories" value={totals.calories} target={targets.calories} />
              <TargetBar label="Protein" value={totals.protein_g} target={targets.protein_g} unit="g" />
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

function WorkoutRow({
  workout,
  prefix = '',
  muted = false,
  onClick,
}: {
  workout: Workout
  prefix?: string
  muted?: boolean
  onClick: () => void
}): React.JSX.Element {
  const duration = formatDuration(workout.duration_minutes)
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'transition-quiet rounded-block hover:bg-hover -mx-2 flex items-baseline justify-between gap-3 px-2 py-0.5 text-left text-base',
        muted && 'text-muted'
      )}
    >
      <span className="min-w-0 flex-1 truncate">
        {prefix}
        {workout.description.trim() === '' ? WORKOUT_TYPE_LABEL[workout.type] : workout.description}
      </span>
      {/* No duration is a complete workout entry, so nothing is drawn in its place. */}
      {duration && (
        <span data-numeric className={cn('whitespace-nowrap', muted ? undefined : 'text-ink2')}>
          {duration}
        </span>
      )}
    </button>
  )
}

/**
 * A target the user asked for. Gold like everything else that fills.
 *
 * There is no over-target treatment and no under-target treatment. Passing a calorie
 * target is not a failure and does not change a colour — the bar simply fills.
 */
function TargetBar({
  label,
  value,
  target,
  unit = '',
}: {
  label: string
  value: number | null
  target: number | null
  unit?: string
}): React.JSX.Element | null {
  if (target === null) return null
  const fraction = targetFraction(value, target)

  return (
    <div className="flex flex-col gap-[7px]">
      <div className="text-muted flex items-baseline justify-between gap-3 text-xs">
        <span>{label}</span>
        <span data-numeric>
          {value === null ? 'nothing counted yet' : `${Math.round(value)}${unit} of ${target}${unit}`}
        </span>
      </div>
      <div className="bg-fill rounded-pill h-[5px] w-full overflow-hidden">
        <div
          className="bg-accent rounded-pill h-full"
          style={{ width: `${((fraction ?? 0) * 100).toFixed(2)}%` }}
        />
      </div>
    </div>
  )
}
