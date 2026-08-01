import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { financeRepository } from '../src/main/repos/financeRepository'
import { mealRepository } from '../src/main/repos/mealRepository'
import { settingsRepository } from '../src/main/repos/settingsRepository'
import { workoutRepository } from '../src/main/repos/workoutRepository'
import { createTempVault, dayOffset, type TempVault } from './helpers/vault'

let vault: TempVault

beforeEach(async () => {
  vault = await createTempVault('trackers')
})

afterEach(async () => {
  await vault.dispose()
})

const thisMonth = () => dayOffset(0).slice(0, 7)
const dayInMonth = (day: number) => `${thisMonth()}-${String(day).padStart(2, '0')}`

describe('finance', () => {
  it('logs a purchase in a category that is not in settings (F4)', async () => {
    const purchase = await financeRepository.create({
      date: dayInMonth(2),
      amount: 12.4,
      category: 'bubble tea',
      description: 'lunch, Tepper',
      source: 'telegram',
    })

    expect(purchase.category).toBe('bubble tea')
    await expect(financeRepository.list()).resolves.toHaveLength(1)
  })

  it('accepts a negative amount for income and refunds', async () => {
    await expect(
      financeRepository.create({
        date: dayInMonth(3),
        amount: -50,
        category: 'refund',
        description: 'returned the keyboard',
        source: 'app',
      })
    ).resolves.toMatchObject({ amount: -50 })
  })

  it('rejects a non-numeric amount and a malformed date', async () => {
    await expect(
      financeRepository.create({
        date: 'last tuesday',
        amount: 'twelve' as never,
        category: '',
        description: '',
        source: 'app',
      })
    ).rejects.toThrow(/date must be a real calendar date.*amount must be a number/s)
  })

  it('summarises spend against limits, showing configured categories at zero', async () => {
    await settingsRepository.update({
      finance: {
        categories: [
          { name: 'food', limit: 300 },
          { name: 'books', limit: null },
          { name: 'transit', limit: 60 },
        ],
      },
    })

    await financeRepository.create({
      date: dayInMonth(2),
      amount: 120,
      category: 'food',
      description: 'groceries',
      source: 'app',
    })
    await financeRepository.create({
      date: dayInMonth(9),
      amount: 30,
      category: 'food',
      description: 'dinner',
      source: 'app',
    })
    await financeRepository.create({
      date: dayInMonth(9),
      amount: 8,
      category: '',
      description: 'something',
      source: 'app',
    })

    const summary = await financeRepository.monthSummary(thisMonth())
    const byName = new Map(summary.map((row) => [row.category, row]))

    expect(byName.get('food')).toMatchObject({ spent: 150, limit: 300, fraction: 0.5 })
    expect(byName.get('books')).toMatchObject({ spent: 0, limit: null, fraction: null })
    expect(byName.get('transit')).toMatchObject({ spent: 0, limit: 60, fraction: 0 })
    expect(byName.get('uncategorised')).toMatchObject({ spent: 8, limit: null })
  })

  it('excludes purchases outside the month', async () => {
    await financeRepository.create({
      date: dayInMonth(5),
      amount: 10,
      category: 'food',
      description: 'in',
      source: 'app',
    })
    await financeRepository.create({
      date: dayOffset(-200),
      amount: 999,
      category: 'food',
      description: 'out',
      source: 'app',
    })

    const summary = await financeRepository.monthSummary(thisMonth())
    expect(summary.find((row) => row.category === 'food')?.spent).toBe(10)
  })

  it('rejects a month that is not YYYY-MM', async () => {
    await expect(financeRepository.monthSummary('August')).rejects.toThrow(/YYYY-MM/)
  })

  it('updates and removes', async () => {
    const purchase = await financeRepository.create({
      date: dayInMonth(4),
      amount: 20,
      category: 'food',
      description: 'x',
      source: 'app',
    })

    await expect(
      financeRepository.update(purchase.id, { amount: 25 })
    ).resolves.toMatchObject({ amount: 25, description: 'x' })

    await financeRepository.remove(purchase.id)
    await expect(financeRepository.list()).resolves.toEqual([])
  })
})

describe('meals', () => {
  it('logs a meal with no numbers at all (M1)', async () => {
    const meal = await mealRepository.create({
      date: dayOffset(0),
      meal: 'lunch',
      description: 'chipotle bowl, chicken',
      calories: null,
      protein_g: null,
      estimated: false,
      source: 'telegram',
    })

    expect(meal.calories).toBeNull()
    expect(meal.protein_g).toBeNull()
    expect(meal.estimated).toBe(false)
  })

  it('keeps the estimated flag so guesses stay visually distinct (M2)', async () => {
    const meal = await mealRepository.create({
      date: dayOffset(0),
      meal: 'dinner',
      description: 'pasta',
      calories: 850,
      protein_g: 30,
      estimated: true,
      source: 'telegram',
    })
    expect(meal.estimated).toBe(true)
  })

  it('rejects an unknown meal slot and negative calories', async () => {
    await expect(
      mealRepository.create({
        date: dayOffset(0),
        meal: 'brunch' as never,
        description: '',
        calories: -10,
        protein_g: null,
        estimated: false,
        source: 'app',
      })
    ).rejects.toThrow(/meal must be one of breakfast, lunch, dinner, snack.*calories cannot be negative/s)
  })

  it('lists a day in meal order', async () => {
    for (const slot of ['dinner', 'breakfast', 'snack', 'lunch'] as const) {
      await mealRepository.create({
        date: dayOffset(0),
        meal: slot,
        description: slot,
        calories: null,
        protein_g: null,
        estimated: false,
        source: 'app',
      })
    }

    const day = await mealRepository.forDate(dayOffset(0))
    expect(day.map((meal) => meal.meal)).toEqual(['breakfast', 'lunch', 'dinner', 'snack'])
  })

  it('updates and removes', async () => {
    const meal = await mealRepository.create({
      date: dayOffset(0),
      meal: 'snack',
      description: 'apple',
      calories: null,
      protein_g: null,
      estimated: false,
      source: 'app',
    })

    await expect(mealRepository.update(meal.id, { calories: 95 })).resolves.toMatchObject({
      calories: 95,
      description: 'apple',
    })

    await mealRepository.remove(meal.id)
    await expect(mealRepository.list()).resolves.toEqual([])
  })
})

describe('workouts', () => {
  it('logs free text with an optional duration (W1)', async () => {
    const workout = await workoutRepository.create({
      date: dayOffset(0),
      type: 'lift',
      description: 'push day — bench 3x8 @155, ohp, dips',
      duration_minutes: 65,
      source: 'telegram',
    })

    expect(workout.type).toBe('lift')
    expect(workout.duration_minutes).toBe(65)

    await expect(
      workoutRepository.create({
        date: dayOffset(0),
        type: 'run',
        description: 'easy 3 miles',
        duration_minutes: null,
        source: 'app',
      })
    ).resolves.toMatchObject({ duration_minutes: null })
  })

  it('rejects an unknown type', async () => {
    await expect(
      workoutRepository.create({
        date: dayOffset(0),
        type: 'yoga' as never,
        description: '',
        duration_minutes: null,
        source: 'app',
      })
    ).rejects.toThrow(/type must be one of lift, run, climb, sport, other/)
  })

  it('filters by date, updates and removes', async () => {
    const workout = await workoutRepository.create({
      date: dayOffset(-1),
      type: 'climb',
      description: 'bouldering',
      duration_minutes: 90,
      source: 'app',
    })

    await expect(workoutRepository.forDate(dayOffset(-1))).resolves.toHaveLength(1)
    await expect(workoutRepository.forDate(dayOffset(0))).resolves.toEqual([])

    await expect(
      workoutRepository.update(workout.id, { duration_minutes: 100 })
    ).resolves.toMatchObject({ duration_minutes: 100 })

    await workoutRepository.remove(workout.id)
    await expect(workoutRepository.list()).resolves.toEqual([])
  })
})

describe('settings', () => {
  it('seeds defaults on first read and writes the file', async () => {
    const settings = await settingsRepository.get()
    expect(settings.finance.categories).toEqual([])
    expect(settings.todos.default_estimate_minutes).toBe(30)
    expect(settings.library.auto_archive_days).toBe(30)
    expect(settings.synthesis.journal_access).toBe('full')

    expect(await vault.ls('data')).toContain('settings.json')
  })

  it('fills in missing keys from an existing partial file', async () => {
    await vault.writeJson('data/settings.json', { nutrition: { calorie_target: 2400 } })
    const settings = await settingsRepository.get()

    expect(settings.nutrition.calorie_target).toBe(2400)
    expect(settings.nutrition.show_targets).toBe(false)
    expect(settings.finance.currency).toBe('USD')
  })

  it('deep-merges an update and replaces arrays wholesale', async () => {
    await settingsRepository.update({ finance: { categories: [{ name: 'food', limit: 300 }] } })
    await settingsRepository.update({ nutrition: { protein_target_g: 150 } })

    const settings = await settingsRepository.get()
    expect(settings.finance.categories).toEqual([{ name: 'food', limit: 300 }])
    expect(settings.nutrition.protein_target_g).toBe(150)

    await settingsRepository.update({ finance: { categories: [] } })
    await expect(settingsRepository.get()).resolves.toMatchObject({
      finance: { categories: [] },
    })
  })

  it('rejects an invalid setting with a readable message', async () => {
    await expect(
      settingsRepository.update({ library: { auto_archive_days: 0 } })
    ).rejects.toThrow(/auto_archive_days must be a whole number of 1 or more/)

    await expect(
      settingsRepository.update({ synthesis: { journal_access: 'some' as never } })
    ).rejects.toThrow(/journal_access must be "full" or "metadata"/)
  })
})
