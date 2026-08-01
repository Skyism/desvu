import { existsSync } from 'node:fs'
import type { DeepPartial } from '@shared/ipc'
import { DEFAULT_SETTINGS } from '@shared/types'
import type { BudgetCategory, Settings } from '@shared/types'
import { dataPath } from '@shared/vault'
import { createJsonStore, expectObject } from '../lib/json-store'
import { ValidationError } from '../lib/errors'
import { Issues, checkNonNegativeInt, checkPriority } from '../lib/validate'

const store = createJsonStore<Record<string, unknown>>(
  () => dataPath('settings.json'),
  () => ({}),
  (parsed, filePath) => expectObject<Record<string, unknown>>(parsed, filePath)
)

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sanitiseCategories(value: unknown): BudgetCategory[] {
  if (!Array.isArray(value)) return []
  const categories: BudgetCategory[] = []
  for (const entry of value) {
    if (!isPlainObject(entry)) continue
    const name = typeof entry.name === 'string' ? entry.name.trim() : ''
    if (name === '') continue
    const limit =
      typeof entry.limit === 'number' && Number.isFinite(entry.limit) ? entry.limit : null
    categories.push({ name, limit })
  }
  return categories
}

/**
 * Fold whatever is on disk over the defaults. Arrays replace wholesale — merging
 * `finance.categories` element-wise would make a deleted budget category immortal.
 */
function mergeSettings(stored: Record<string, unknown>): Settings {
  const finance = isPlainObject(stored.finance) ? stored.finance : {}
  const nutrition = isPlainObject(stored.nutrition) ? stored.nutrition : {}
  const todos = isPlainObject(stored.todos) ? stored.todos : {}
  const library = isPlainObject(stored.library) ? stored.library : {}
  const synthesis = isPlainObject(stored.synthesis) ? stored.synthesis : {}

  const number = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback
  const nullableNumber = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null

  return {
    finance: {
      categories:
        'categories' in finance
          ? sanitiseCategories(finance.categories)
          : DEFAULT_SETTINGS.finance.categories,
      currency:
        typeof finance.currency === 'string' && finance.currency.trim() !== ''
          ? finance.currency
          : DEFAULT_SETTINGS.finance.currency,
      month_starts_on: number(finance.month_starts_on, DEFAULT_SETTINGS.finance.month_starts_on),
    },
    nutrition: {
      calorie_target: nullableNumber(nutrition.calorie_target),
      protein_target_g: nullableNumber(nutrition.protein_target_g),
      show_targets:
        typeof nutrition.show_targets === 'boolean'
          ? nutrition.show_targets
          : DEFAULT_SETTINGS.nutrition.show_targets,
    },
    todos: {
      default_priority: (number(
        todos.default_priority,
        DEFAULT_SETTINGS.todos.default_priority
      ) as Settings['todos']['default_priority']),
      default_estimate_minutes: number(
        todos.default_estimate_minutes,
        DEFAULT_SETTINGS.todos.default_estimate_minutes
      ),
    },
    library: {
      auto_archive_days: number(
        library.auto_archive_days,
        DEFAULT_SETTINGS.library.auto_archive_days
      ),
    },
    synthesis: {
      journal_access:
        synthesis.journal_access === 'metadata'
          ? 'metadata'
          : DEFAULT_SETTINGS.synthesis.journal_access,
    },
  }
}

function validate(settings: Settings): void {
  const issues = new Issues()

  if (typeof settings.finance.currency !== 'string' || settings.finance.currency.trim() === '') {
    issues.add('finance.currency cannot be empty')
  }
  if (
    !Number.isInteger(settings.finance.month_starts_on) ||
    settings.finance.month_starts_on < 1 ||
    settings.finance.month_starts_on > 28
  ) {
    issues.add('finance.month_starts_on must be a whole number from 1 to 28')
  }
  for (const [index, category] of settings.finance.categories.entries()) {
    if (typeof category.name !== 'string' || category.name.trim() === '') {
      issues.add(`finance.categories[${index}].name cannot be empty`)
    }
    if (category.limit !== null && !(typeof category.limit === 'number' && category.limit >= 0)) {
      issues.add(`finance.categories[${index}].limit must be a positive number or null`)
    }
  }

  for (const field of ['calorie_target', 'protein_target_g'] as const) {
    const value = settings.nutrition[field]
    if (value !== null && !(typeof value === 'number' && Number.isFinite(value) && value >= 0)) {
      issues.add(`nutrition.${field} must be a positive number or null`)
    }
  }

  checkPriority(issues, 'todos.default_priority', settings.todos.default_priority)
  checkNonNegativeInt(issues, 'todos.default_estimate_minutes', settings.todos.default_estimate_minutes, {
    nullable: false,
  })

  if (
    !Number.isInteger(settings.library.auto_archive_days) ||
    settings.library.auto_archive_days < 1
  ) {
    issues.add('library.auto_archive_days must be a whole number of 1 or more')
  }

  if (!['full', 'metadata'].includes(settings.synthesis.journal_access)) {
    issues.add('synthesis.journal_access must be "full" or "metadata"')
  }

  issues.throwIfAny()
}

/**
 * Reading is tolerant — a hand-edited `settings.json` with a typo falls back to the
 * default rather than breaking the app. Writing is not: an explicit bad value from the
 * UI has to come back as an error, or a mis-typed setting silently becomes something
 * else and the user never learns why.
 */
function validatePatch(patch: Record<string, unknown>): void {
  const issues = new Issues()

  const section = (name: string): Record<string, unknown> =>
    isPlainObject(patch[name]) ? (patch[name] as Record<string, unknown>) : {}

  const requireNumber = (group: Record<string, unknown>, path: string, key: string): void => {
    if (key in group && typeof group[key] !== 'number') {
      issues.add(`${path} must be a number`)
    }
  }
  const requireNullableNumber = (
    group: Record<string, unknown>,
    path: string,
    key: string
  ): void => {
    if (key in group && group[key] !== null && typeof group[key] !== 'number') {
      issues.add(`${path} must be a number or null`)
    }
  }

  const finance = section('finance')
  if ('currency' in finance && (typeof finance.currency !== 'string' || finance.currency.trim() === '')) {
    issues.add('finance.currency cannot be empty')
  }
  requireNumber(finance, 'finance.month_starts_on', 'month_starts_on')
  if ('categories' in finance && !Array.isArray(finance.categories)) {
    issues.add('finance.categories must be a list')
  } else if (Array.isArray(finance.categories)) {
    for (const [index, entry] of finance.categories.entries()) {
      if (!isPlainObject(entry) || typeof entry.name !== 'string' || entry.name.trim() === '') {
        issues.add(`finance.categories[${index}] needs a name`)
      }
    }
  }

  const nutrition = section('nutrition')
  requireNullableNumber(nutrition, 'nutrition.calorie_target', 'calorie_target')
  requireNullableNumber(nutrition, 'nutrition.protein_target_g', 'protein_target_g')
  if ('show_targets' in nutrition && typeof nutrition.show_targets !== 'boolean') {
    issues.add('nutrition.show_targets must be true or false')
  }

  const todos = section('todos')
  requireNumber(todos, 'todos.default_priority', 'default_priority')
  requireNumber(todos, 'todos.default_estimate_minutes', 'default_estimate_minutes')

  const library = section('library')
  requireNumber(library, 'library.auto_archive_days', 'auto_archive_days')

  const synthesis = section('synthesis')
  if ('journal_access' in synthesis && !['full', 'metadata'].includes(synthesis.journal_access as string)) {
    issues.add('synthesis.journal_access must be "full" or "metadata"')
  }

  issues.throwIfAny()
}

function applyPatch(
  current: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...current }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue
    const existing = next[key]
    if (isPlainObject(value) && isPlainObject(existing)) {
      next[key] = applyPatch(existing, value)
    } else {
      next[key] = value
    }
  }
  return next
}

export const settingsRepository = {
  /** Reads the file, filling in anything missing from `DEFAULT_SETTINGS`. */
  async get(): Promise<Settings> {
    const stored = await store.read()
    const settings = mergeSettings(stored)

    // Seed the file on first read so the user has something to hand-edit in Obsidian.
    // A failure here (read-only volume, iCloud eviction) must not break reading settings.
    if (!existsSync(store.filePath())) {
      await store
        .mutate(() => ({ data: settings as unknown as Record<string, unknown>, result: settings }))
        .catch(() => undefined)
    }

    return settings
  },

  async update(patch: DeepPartial<Settings>): Promise<Settings> {
    if (!isPlainObject(patch)) throw new ValidationError('settings patch must be an object')
    validatePatch(patch as Record<string, unknown>)

    return store.mutate((current) => {
      const merged = mergeSettings(applyPatch(current, patch as Record<string, unknown>))
      validate(merged)
      return { data: merged as unknown as Record<string, unknown>, result: merged }
    })
  },

  /** Test/debug hook: the absolute path being read. */
  filePath(): string {
    return store.filePath()
  },
}

export type SettingsRepository = typeof settingsRepository
