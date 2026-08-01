import type { DateString, Meal, MealSlot, Settings, Workout, WorkoutType } from '@shared/types'

/**
 * Meals and training display logic. React-free so `test/health-ui-*.test.ts` can run it
 * in the node environment.
 *
 * TWO RULES THIS FILE EXISTS TO HOLD:
 *
 * 1. **Numbers are optional.** A meal with no calories is a complete entry. Nothing here
 *    substitutes 0 for a missing number — a day nobody counted must read as *unknown*,
 *    never as "0 calories", which is both false and a shape the eye reads as failure.
 * 2. **Targets start off.** Until `settings.nutrition.show_targets` is true AND a target
 *    is set, no comparison exists to make. The app logs and shows trends; it does not
 *    have an opinion about whether the number was big enough.
 */

// ---------------------------------------------------------------------------
// vocabulary
// ---------------------------------------------------------------------------

export const MEAL_SLOTS: readonly MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack']

export const MEAL_SLOT_LABEL: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
}

export const WORKOUT_TYPES: readonly WorkoutType[] = ['lift', 'run', 'climb', 'sport', 'other']

export const WORKOUT_TYPE_LABEL: Record<WorkoutType, string> = {
  lift: 'Lift',
  run: 'Run',
  climb: 'Climb',
  sport: 'Sport',
  other: 'Other',
}

/** Chronological within a day, so a log reads the way the day happened. */
export function mealSlotOrder(slot: MealSlot): number {
  const index = MEAL_SLOTS.indexOf(slot)
  return index === -1 ? MEAL_SLOTS.length : index
}

/** The slot most likely to be right for a meal logged now. A guess, always editable. */
export function slotForHour(hour: number): MealSlot {
  if (hour < 11) return 'breakfast'
  if (hour < 16) return 'lunch'
  if (hour < 22) return 'dinner'
  return 'snack'
}

// ---------------------------------------------------------------------------
// totals
// ---------------------------------------------------------------------------

export interface DayTotals {
  /** Null when nothing logged that day carried a number. Never 0-as-unknown. */
  calories: number | null
  protein_g: number | null
  /** True when any meal contributing a number was an agent estimate → set in italic. */
  estimated: boolean
  /** How many meals were logged, with or without numbers. */
  logged: number
  /** How many of them carried a calorie figure. */
  counted: number
}

export function dayTotals(meals: readonly Meal[]): DayTotals {
  let calories: number | null = null
  let protein: number | null = null
  let estimated = false
  let counted = 0

  for (const meal of meals) {
    if (meal.calories !== null) {
      calories = (calories ?? 0) + meal.calories
      counted += 1
      if (meal.estimated) estimated = true
    }
    if (meal.protein_g !== null) {
      protein = (protein ?? 0) + meal.protein_g
      if (meal.estimated) estimated = true
    }
  }

  return { calories, protein_g: protein, estimated, logged: meals.length, counted }
}

export function trainingMinutes(workouts: readonly Workout[]): number | null {
  let total: number | null = null
  for (const workout of workouts) {
    if (workout.duration_minutes !== null) total = (total ?? 0) + workout.duration_minutes
  }
  return total
}

// ---------------------------------------------------------------------------
// formatting
// ---------------------------------------------------------------------------

/**
 * `340 cal · 12g`, or `~340 cal · 12g` when the numbers are the agent's guess.
 *
 * The tilde is belt-and-braces; the real disclaimer is the typography — an estimated
 * figure is set in italic Cormorant (`.text-estimate`) and a measured one in DM Sans, so
 * the two are distinguishable at a glance without reading a legend.
 *
 * Returns null when there is nothing to say, so callers render *nothing* rather than a
 * placeholder dash implying a number is missing.
 */
export function formatMacros(
  calories: number | null,
  protein: number | null,
  estimated = false
): string | null {
  const parts: string[] = []
  const tilde = estimated ? '~' : ''
  if (calories !== null) parts.push(`${tilde}${Math.round(calories)} cal`)
  if (protein !== null) parts.push(`${tilde}${Math.round(protein)}g`)
  return parts.length > 0 ? parts.join(' · ') : null
}

export function formatMeal(meal: Meal): string | null {
  return formatMacros(meal.calories, meal.protein_g, meal.estimated)
}

/** `55m`, `1h 25m`. Durations are always minutes in this app. */
export function formatDuration(minutes: number | null): string | null {
  if (minutes === null) return null
  const total = Math.max(0, Math.round(minutes))
  const hours = Math.floor(total / 60)
  const rest = total % 60
  if (hours && rest) return `${hours}h ${rest}m`
  if (hours) return `${hours}h`
  return `${rest}m`
}

const WEEKDAY_SHORT = new Intl.DateTimeFormat('en-GB', { weekday: 'short' })
const DAY_MONTH = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })

/** Parse a `YYYY-MM-DD` as a LOCAL date. `new Date('2026-08-01')` would be UTC midnight. */
export function parseDateString(date: DateString): Date {
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(5, 7))
  const day = Number(date.slice(8, 10))
  return new Date(year, month - 1, day)
}

export function toDateString(date: Date): DateString {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function addDays(date: DateString, delta: number): DateString {
  const parsed = parseDateString(date)
  parsed.setDate(parsed.getDate() + delta)
  return toDateString(parsed)
}

/** `Today`, `Yesterday`, then `Sat 26 Jul`. */
export function dayHeading(date: DateString, now: Date = new Date()): string {
  const today = toDateString(now)
  if (date === today) return 'Today'
  if (date === addDays(today, -1)) return 'Yesterday'
  const parsed = parseDateString(date)
  return `${WEEKDAY_SHORT.format(parsed)} ${DAY_MONTH.format(parsed)}`
}

// ---------------------------------------------------------------------------
// grouping
// ---------------------------------------------------------------------------

export interface DayLog {
  date: DateString
  meals: Meal[]
  workouts: Workout[]
  totals: DayTotals
  minutes: number | null
}

/** Newest day first. Days with only a workout and no meal still appear. */
export function groupByDay(meals: readonly Meal[], workouts: readonly Workout[]): DayLog[] {
  const dates = new Set<DateString>()
  for (const meal of meals) dates.add(meal.date)
  for (const workout of workouts) dates.add(workout.date)

  return [...dates]
    .sort((a, b) => b.localeCompare(a))
    .map((date) => {
      const dayMeals = meals
        .filter((meal) => meal.date === date)
        .sort(
          (a, b) => mealSlotOrder(a.meal) - mealSlotOrder(b.meal) || a.created_at - b.created_at
        )
      const dayWorkouts = workouts
        .filter((workout) => workout.date === date)
        .sort((a, b) => a.created_at - b.created_at)
      return {
        date,
        meals: dayMeals,
        workouts: dayWorkouts,
        totals: dayTotals(dayMeals),
        minutes: trainingMinutes(dayWorkouts),
      }
    })
}

// ---------------------------------------------------------------------------
// trends
// ---------------------------------------------------------------------------

export interface TrendPoint {
  date: DateString
  /** Short axis label, e.g. `26 Jul`. */
  label: string
  /** Null on a day nothing was counted — a gap in the line, never a zero. */
  calories: number | null
  protein: number | null
  /** Null on a day with no training logged. Absence is not a zero either. */
  minutes: number | null
  estimated: boolean
}

/**
 * A dense day-by-day series over the last `days` days, oldest first, including days with
 * nothing logged — those carry nulls, so Recharts draws a gap.
 *
 * The gap matters. A missed day plotted as zero draws a spike down to the axis, which
 * reads as a crash rather than as a day nobody wrote anything down.
 */
export function buildTrend(
  meals: readonly Meal[],
  workouts: readonly Workout[],
  options: { days?: number; endDate?: DateString } = {}
): TrendPoint[] {
  const days = Math.max(1, options.days ?? 14)
  const end = options.endDate ?? toDateString(new Date())

  const mealsByDate = new Map<DateString, Meal[]>()
  for (const meal of meals) {
    const bucket = mealsByDate.get(meal.date)
    if (bucket) bucket.push(meal)
    else mealsByDate.set(meal.date, [meal])
  }
  const workoutsByDate = new Map<DateString, Workout[]>()
  for (const workout of workouts) {
    const bucket = workoutsByDate.get(workout.date)
    if (bucket) bucket.push(workout)
    else workoutsByDate.set(workout.date, [workout])
  }

  const points: TrendPoint[] = []
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = addDays(end, -offset)
    const totals = dayTotals(mealsByDate.get(date) ?? [])
    points.push({
      date,
      label: DAY_MONTH.format(parseDateString(date)),
      calories: totals.calories,
      protein: totals.protein_g,
      minutes: trainingMinutes(workoutsByDate.get(date) ?? []),
      estimated: totals.estimated,
    })
  }
  return points
}

/** Mean of the days that actually carry a number. Null when none do. */
export function trendAverage(points: readonly TrendPoint[], key: 'calories' | 'protein' | 'minutes'): number | null {
  const values = points.map((point) => point[key]).filter((value): value is number => value !== null)
  if (values.length === 0) return null
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

/** How many of the last `days` days carry any log at all. Never framed as a miss count. */
export function daysLogged(points: readonly TrendPoint[]): number {
  return points.filter((point) => point.calories !== null || point.minutes !== null).length
}

// ---------------------------------------------------------------------------
// targets — opt-in, and silent until then
// ---------------------------------------------------------------------------

export interface ActiveTargets {
  calories: number | null
  protein_g: number | null
}

/**
 * The only gate on drawing a target line anywhere in this surface.
 *
 * Returns nulls unless the user has explicitly turned targets on *and* set a number.
 * `show_targets` is false in `DEFAULT_SETTINGS`, so day one has no target line, no
 * remaining-calories readout, and nothing that could read as falling short.
 */
export function activeTargets(settings: Pick<Settings, 'nutrition'> | null): ActiveTargets {
  if (!settings?.nutrition.show_targets) return { calories: null, protein_g: null }
  return {
    calories: settings.nutrition.calorie_target,
    protein_g: settings.nutrition.protein_target_g,
  }
}

export function hasAnyTarget(targets: ActiveTargets): boolean {
  return targets.calories !== null || targets.protein_g !== null
}

/**
 * Progress toward an opted-in target, 0–1 clamped for the bar.
 *
 * Note there is no `isOver` here and no caller that colours by it. Over a calorie target
 * is not a failure state and does not get a warning treatment — the bar simply fills.
 */
export function targetFraction(value: number | null, target: number | null): number | null {
  if (value === null || target === null || target <= 0) return null
  return Math.min(1, Math.max(0, value / target))
}

/**
 * Parse an optional number field. Blank is a legitimate, complete answer — it returns
 * `{ ok: true, value: null }` and the save proceeds.
 */
export function parseOptionalNumber(input: string): { ok: boolean; value: number | null } {
  const trimmed = input.trim()
  if (trimmed === '') return { ok: true, value: null }
  if (!/^\d*\.?\d+$/.test(trimmed)) return { ok: false, value: null }
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value < 0) return { ok: false, value: null }
  return { ok: true, value: Math.round(value) }
}
