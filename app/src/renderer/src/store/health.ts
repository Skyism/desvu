import type { DateString, Meal, MealSlot, Workout, WorkoutType } from '@shared/types'

import { bridge } from '@/lib/bridge'
import { useVaultQuery, type VaultQuery } from './useVaultQuery'
import { invalidateVault } from './vault'
import { updateSettings } from './settings'

/**
 * Meals and workouts. Shaped after `store/inbox.ts`.
 *
 * Note what the drafts do NOT require: calories, protein and duration are all nullable
 * and default to null. A save is never blocked on a number the user does not have.
 */

export function useMeals(): VaultQuery<Meal[]> {
  return useVaultQuery(() => bridge().meals.list(), [])
}

export function useWorkouts(): VaultQuery<Workout[]> {
  return useVaultQuery(() => bridge().workouts.list(), [])
}

export interface MealDraft {
  date: DateString
  meal: MealSlot
  description: string
  calories?: number | null
  protein_g?: number | null
  /** True only when a number came from the sort skill's guess, not from the user. */
  estimated?: boolean
}

export async function logMeal(draft: MealDraft): Promise<Meal> {
  const meal = await bridge().meals.create({
    date: draft.date,
    meal: draft.meal,
    description: draft.description.trim(),
    calories: draft.calories ?? null,
    protein_g: draft.protein_g ?? null,
    estimated: draft.estimated ?? false,
    source: 'app',
  })
  invalidateVault()
  return meal
}

export async function editMeal(id: string, updates: Partial<MealDraft>): Promise<Meal> {
  const meal = await bridge().meals.update(id, {
    ...(updates.date !== undefined ? { date: updates.date } : {}),
    ...(updates.meal !== undefined ? { meal: updates.meal } : {}),
    ...(updates.description !== undefined ? { description: updates.description.trim() } : {}),
    ...(updates.calories !== undefined ? { calories: updates.calories } : {}),
    ...(updates.protein_g !== undefined ? { protein_g: updates.protein_g } : {}),
    ...(updates.estimated !== undefined ? { estimated: updates.estimated } : {}),
  })
  invalidateVault()
  return meal
}

export async function removeMeal(id: string): Promise<void> {
  await bridge().meals.remove(id)
  invalidateVault()
}

export interface WorkoutDraft {
  date: DateString
  type: WorkoutType
  description: string
  duration_minutes?: number | null
}

export async function logWorkout(draft: WorkoutDraft): Promise<Workout> {
  const workout = await bridge().workouts.create({
    date: draft.date,
    type: draft.type,
    description: draft.description.trim(),
    duration_minutes: draft.duration_minutes ?? null,
    source: 'app',
  })
  invalidateVault()
  return workout
}

export async function editWorkout(id: string, updates: Partial<WorkoutDraft>): Promise<Workout> {
  const workout = await bridge().workouts.update(id, {
    ...(updates.date !== undefined ? { date: updates.date } : {}),
    ...(updates.type !== undefined ? { type: updates.type } : {}),
    ...(updates.description !== undefined ? { description: updates.description.trim() } : {}),
    ...(updates.duration_minutes !== undefined
      ? { duration_minutes: updates.duration_minutes }
      : {}),
  })
  invalidateVault()
  return workout
}

export async function removeWorkout(id: string): Promise<void> {
  await bridge().workouts.remove(id)
  invalidateVault()
}

/**
 * Nutrition targets. All three fields start null/false, and turning targets off leaves the
 * numbers on disk so switching back does not make the user retype them.
 */
export async function saveNutritionTargets(next: {
  calorie_target: number | null
  protein_target_g: number | null
  show_targets: boolean
}): Promise<void> {
  await updateSettings({ nutrition: next })
}
