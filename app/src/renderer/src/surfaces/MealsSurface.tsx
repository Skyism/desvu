import { useState } from 'react'
import type { Meal, Workout } from '@shared/types'

import { Button } from '@/components/Button'
import { Page } from '@/components/Page'
import { useToast } from '@/components/Toast'
import {
  DayLogCard,
  EatenAndMovedCard,
  MealDialog,
  TargetsDialog,
  TrendsCard,
  WorkoutDialog,
} from '@/components/health'
import { formatDayLine } from '@/lib/date'
import { ROUTES } from '@/lib/routes'
import { useMeals, useWorkouts } from '@/store/health'
import { useSettings } from '@/store/settings'

/**
 * PRD M1 · M2 · M3 · W1 — what you ate and how you moved.
 *
 * Four things this surface is careful about:
 *
 *   M1  Meals are free text with a slot. That is the whole required entry.
 *   M2  Calories and protein are nullable and nothing blocks a save on them. A day with
 *       no numbers totals to *nothing*, never to zero.
 *   M3  Agent-estimated numbers are set in italic Cormorant — the typography is the
 *       disclaimer. See `NutritionFigure`.
 *   W1  Workouts are free text with a type and an optional duration.
 *
 * And the rule that shapes the whole thing: targets start null and `show_targets` starts
 * false, so on day one there is no target line, no percentage, and nothing that could
 * read as falling short.
 */
export function MealsSurface(): React.JSX.Element {
  const [mealOpen, setMealOpen] = useState(false)
  const [workoutOpen, setWorkoutOpen] = useState(false)
  const [targetsOpen, setTargetsOpen] = useState(false)
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null)
  const [editingWorkout, setEditingWorkout] = useState<Workout | null>(null)
  const { toast } = useToast()

  const meals = useMeals()
  const workouts = useWorkouts()
  const settings = useSettings()

  const everLogged = (meals.data?.length ?? 0) > 0 || (workouts.data?.length ?? 0) > 0

  const openMeal = (meal: Meal | null): void => {
    setEditingMeal(meal)
    setMealOpen(true)
  }

  const openWorkout = (workout: Workout | null): void => {
    setEditingWorkout(workout)
    setWorkoutOpen(true)
  }

  return (
    <Page
      title={ROUTES.meals.title}
      eyebrow={formatDayLine()}
      description={ROUTES.meals.description}
      actions={
        <>
          <Button size="md" shape="pill" variant="soft" onClick={() => openMeal(null)}>
            Log a meal
          </Button>
          <Button size="md" shape="pill" variant="ghost" onClick={() => openWorkout(null)}>
            Log a workout
          </Button>
        </>
      }
    >
      <EatenAndMovedCard
        meals={meals}
        workouts={workouts}
        settings={settings}
        onLogMeal={() => openMeal(null)}
        onLogWorkout={() => openWorkout(null)}
        onEditTargets={() => setTargetsOpen(true)}
        onEditMeal={openMeal}
        onEditWorkout={openWorkout}
      />

      {/* Day one is ONE card, not three empty ones. A trend of nothing and a log of
          nothing are two more ways of saying "nothing logged today", and three
          restatements of emptiness is nagging by repetition. Both appear the moment
          anything exists, and never flash in and back out — `data` is null until the
          first successful load, so the count reads 0 throughout. */}
      {everLogged && (
        <>
          <TrendsCard meals={meals} workouts={workouts} settings={settings} />

          <DayLogCard
            meals={meals}
            workouts={workouts}
            onLogMeal={() => openMeal(null)}
            onEditMeal={openMeal}
            onEditWorkout={openWorkout}
          />
        </>
      )}

      <MealDialog
        open={mealOpen}
        onClose={() => setMealOpen(false)}
        meal={editingMeal}
        onSaved={(message) => toast(message, { tone: 'accent' })}
      />

      <WorkoutDialog
        open={workoutOpen}
        onClose={() => setWorkoutOpen(false)}
        workout={editingWorkout}
        onSaved={(message) => toast(message, { tone: 'accent' })}
      />

      <TargetsDialog
        open={targetsOpen}
        onClose={() => setTargetsOpen(false)}
        settings={settings.data}
        onSaved={(message) => toast(message, { tone: 'accent' })}
      />
    </Page>
  )
}
