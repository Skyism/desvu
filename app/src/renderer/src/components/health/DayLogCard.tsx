import type { Meal, Workout } from '@shared/types'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { EmptyState } from '@/components/EmptyState'
import { SkeletonLines } from '@/components/Skeleton'
import type { VaultQuery } from '@/store/useVaultQuery'
import { NutritionFigure } from './NutritionFigure'
import {
  dayHeading,
  formatDuration,
  groupByDay,
  MEAL_SLOT_LABEL,
  WORKOUT_TYPE_LABEL,
} from './nutrition'

export interface DayLogCardProps {
  meals: VaultQuery<Meal[]>
  workouts: VaultQuery<Workout[]>
  onLogMeal: () => void
  onEditMeal: (meal: Meal) => void
  onEditWorkout: (workout: Workout) => void
  /** How many days back to show. */
  days?: number
}

/**
 * The log itself, newest day first — every meal and every workout, exactly as entered.
 *
 * Days with nothing logged are simply absent. There is no empty row for them, no gap
 * marker, no "0 logged". A day the user did not write anything down is not an event this
 * app has an opinion about.
 */
export function DayLogCard({
  meals,
  workouts,
  onLogMeal,
  onEditMeal,
  onEditWorkout,
  days = 30,
}: DayLogCardProps): React.JSX.Element {
  const grouped = groupByDay(meals.data ?? [], workouts.data ?? []).slice(0, days)
  const settled = meals.settled && workouts.settled
  const error = meals.error ?? workouts.error

  return (
    <Card
      title="Log"
      meta={
        grouped.length > 0
          ? `${grouped.length} ${grouped.length === 1 ? 'day' : 'days'}`
          : undefined
      }
    >
      {!settled && (meals.loading || workouts.loading) && <SkeletonLines lines={5} />}

      {error && (
        <p className="text-muted text-sm">
          The log can&apos;t be read right now. Nothing was lost — it is all still in the
          vault.
        </p>
      )}

      {!error && settled && grouped.length === 0 && (
        <EmptyState
          compact
          title="Nothing logged yet."
          action={
            <Button variant="soft" size="sm" onClick={onLogMeal}>
              Log a meal
            </Button>
          }
        >
          Free text is a complete entry. Numbers are welcome, not required.
        </EmptyState>
      )}

      {!error && grouped.length > 0 && (
        <div className="flex flex-col gap-6">
          {grouped.map((day) => (
            <div key={day.date} className="flex flex-col gap-2.5">
              <div className="text-label tracking-label text-muted flex items-baseline justify-between gap-3 uppercase">
                <span>{dayHeading(day.date)}</span>
                <span className="flex items-baseline gap-3 normal-case">
                  {day.totals.calories !== null && (
                    <NutritionFigure
                      calories={day.totals.calories}
                      protein={day.totals.protein_g}
                      estimated={day.totals.estimated}
                    />
                  )}
                  {day.minutes !== null && <span data-numeric>{formatDuration(day.minutes)}</span>}
                </span>
              </div>

              <ul className="flex flex-col">
                {day.meals.map((meal) => (
                  <li key={meal.id}>
                    <button
                      type="button"
                      onClick={() => onEditMeal(meal)}
                      className="transition-quiet rounded-block hover:bg-hover -mx-2 flex w-full items-baseline gap-3 px-2 py-1.5 text-left"
                    >
                      <span className="text-muted text-micro w-[62px] flex-none uppercase tracking-label">
                        {MEAL_SLOT_LABEL[meal.meal]}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {meal.description.trim() === '' ? (
                          <span className="text-muted">Unnamed</span>
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
                  </li>
                ))}

                {day.workouts.map((workout) => (
                  <li key={workout.id}>
                    <button
                      type="button"
                      onClick={() => onEditWorkout(workout)}
                      className="transition-quiet rounded-block hover:bg-hover -mx-2 flex w-full items-baseline gap-3 px-2 py-1.5 text-left"
                    >
                      <span className="text-accent-text text-micro tracking-label w-[62px] flex-none uppercase">
                        {WORKOUT_TYPE_LABEL[workout.type]}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {workout.description.trim() === '' ? (
                          <span className="text-muted">Unnamed</span>
                        ) : (
                          workout.description
                        )}
                      </span>
                      {formatDuration(workout.duration_minutes) && (
                        <span data-numeric className="text-ink2 text-xs whitespace-nowrap">
                          {formatDuration(workout.duration_minutes)}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
