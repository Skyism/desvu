import { CATEGORIES, RATING_MAX, RATING_MIN } from '@shared/types'
import type {
  Category,
  MealSlot,
  Priority,
  Rating,
  Recurrence,
  Source,
  TodoStatus,
  Weekday,
  WorkoutType,
} from '@shared/types'
import { isDateString, WEEKDAYS } from './dates'
import { ValidationError } from './errors'

/**
 * Validation runs to completion and reports *every* problem at once, rather than
 * failing on the first. One round trip per fix is how a capture surface loses a user.
 */
export class Issues {
  private readonly list: string[] = []

  add(message: string): void {
    this.list.push(message)
  }

  get ok(): boolean {
    return this.list.length === 0
  }

  get size(): number {
    return this.list.length
  }

  throwIfAny(): void {
    if (this.list.length > 0) throw new ValidationError(this.list)
  }
}

export const MEAL_SLOTS: readonly MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack']
export const WORKOUT_TYPES: readonly WorkoutType[] = ['lift', 'run', 'climb', 'sport', 'other']
export const TODO_STATUSES: readonly TodoStatus[] = ['open', 'doing', 'done', 'dropped']
export const SOURCES: readonly Source[] = ['app', 'telegram', 'import']
export const PRIORITIES: readonly Priority[] = [0, 1, 2, 3]

function oneOf<T extends string | number>(
  issues: Issues,
  field: string,
  value: unknown,
  allowed: readonly T[]
): value is T {
  if (!allowed.includes(value as T)) {
    issues.add(`${field} must be one of ${allowed.join(', ')} (got ${describe(value)})`)
    return false
  }
  return true
}

function describe(value: unknown): string {
  if (typeof value === 'string') return `"${value}"`
  if (value === undefined) return 'nothing'
  return JSON.stringify(value) ?? String(value)
}

export function checkCategory(issues: Issues, field: string, value: unknown): value is Category {
  return oneOf(issues, field, value, CATEGORIES)
}

export function checkPriority(issues: Issues, field: string, value: unknown): value is Priority {
  return oneOf(issues, field, value, PRIORITIES)
}

export function checkStatus(issues: Issues, field: string, value: unknown): value is TodoStatus {
  return oneOf(issues, field, value, TODO_STATUSES)
}

export function checkSource(issues: Issues, field: string, value: unknown): value is Source {
  return oneOf(issues, field, value, SOURCES)
}

export function checkMealSlot(issues: Issues, field: string, value: unknown): value is MealSlot {
  return oneOf(issues, field, value, MEAL_SLOTS)
}

export function checkWorkoutType(
  issues: Issues,
  field: string,
  value: unknown
): value is WorkoutType {
  return oneOf(issues, field, value, WORKOUT_TYPES)
}

export function checkRating(issues: Issues, field: string, value: unknown): value is Rating {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    issues.add(`${field} must be a whole number from ${RATING_MIN} to ${RATING_MAX}`)
    return false
  }
  if (value < RATING_MIN || value > RATING_MAX) {
    issues.add(`${field} must be from ${RATING_MIN} to ${RATING_MAX} (got ${value})`)
    return false
  }
  return true
}

export function checkDate(issues: Issues, field: string, value: unknown): value is string {
  if (!isDateString(value)) {
    issues.add(`${field} must be a real calendar date as YYYY-MM-DD (got ${describe(value)})`)
    return false
  }
  return true
}

/** Non-negative whole number, or null when the field is nullable. */
export function checkNonNegativeInt(
  issues: Issues,
  field: string,
  value: unknown,
  { nullable = true }: { nullable?: boolean } = {}
): boolean {
  if (value === null || value === undefined) {
    if (nullable) return true
    issues.add(`${field} is required`)
    return false
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issues.add(`${field} must be a number (got ${describe(value)})`)
    return false
  }
  if (!Number.isInteger(value)) {
    issues.add(`${field} must be a whole number of minutes (got ${value})`)
    return false
  }
  if (value < 0) {
    issues.add(`${field} cannot be negative (got ${value})`)
    return false
  }
  return true
}

export function checkFiniteNumber(issues: Issues, field: string, value: unknown): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issues.add(`${field} must be a number (got ${describe(value)})`)
    return false
  }
  return true
}

export function checkNonEmptyText(issues: Issues, field: string, value: unknown): value is string {
  if (typeof value !== 'string' || value.trim() === '') {
    issues.add(`${field} cannot be empty`)
    return false
  }
  return true
}

export function checkTags(issues: Issues, field: string, value: unknown): value is string[] {
  if (!Array.isArray(value) || value.some((tag) => typeof tag !== 'string')) {
    issues.add(`${field} must be a list of strings`)
    return false
  }
  return true
}

export function checkRecurrence(issues: Issues, field: string, value: unknown): value is Recurrence {
  if (value === null || value === undefined) return true
  if (typeof value !== 'object') {
    issues.add(`${field} must be an object or null`)
    return false
  }

  const before = issues.size
  const rule = value as Partial<Recurrence> & { days?: unknown; day_of_month?: unknown }
  if (!oneOf(issues, `${field}.type`, rule.type, ['daily', 'weekly', 'monthly'] as const)) {
    return false
  }
  if (
    typeof rule.interval !== 'number' ||
    !Number.isInteger(rule.interval) ||
    rule.interval < 1
  ) {
    issues.add(`${field}.interval must be a whole number of 1 or more`)
  }

  if (rule.type === 'weekly') {
    const days = rule.days
    if (!Array.isArray(days) || days.length === 0) {
      issues.add(`${field}.days must list at least one weekday`)
    } else {
      const unknownDays = days.filter((day) => !WEEKDAYS.includes(day as Weekday))
      if (unknownDays.length > 0) {
        issues.add(
          `${field}.days has unknown weekday(s) ${unknownDays.map(describe).join(', ')}; ` +
            `use ${WEEKDAYS.join(', ')}`
        )
      }
    }
  }

  if (rule.type === 'monthly') {
    const day = rule.day_of_month
    if (typeof day !== 'number' || !Number.isInteger(day) || day < 1 || day > 31) {
      issues.add(`${field}.day_of_month must be a whole number from 1 to 31`)
    }
  }

  return issues.size === before
}
