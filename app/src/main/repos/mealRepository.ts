import type { DateString, Meal, MealSlot, Source } from '@shared/types'
import { dataPath } from '@shared/vault'
import { NotFoundError } from '../lib/errors'
import { newId } from '../lib/ids'
import { createJsonStore, expectArray } from '../lib/json-store'
import { Issues, MEAL_SLOTS, checkDate, checkMealSlot, checkNonNegativeInt, checkSource } from '../lib/validate'

const store = createJsonStore<Meal[]>(
  () => dataPath('meals.json'),
  () => [],
  (parsed, filePath) => expectArray<Meal>(parsed, filePath)
)

function normalize(raw: Partial<Meal>): Meal {
  const created = typeof raw.created_at === 'number' ? raw.created_at : Date.now()
  return {
    id: typeof raw.id === 'string' && raw.id !== '' ? raw.id : newId(),
    date: typeof raw.date === 'string' ? raw.date : '1970-01-01',
    meal: (MEAL_SLOTS as readonly string[]).includes(raw.meal as string)
      ? (raw.meal as MealSlot)
      : 'snack',
    description: typeof raw.description === 'string' ? raw.description : '',
    // Nullable on purpose — requiring numbers is how food logs die (PRD M1).
    calories: typeof raw.calories === 'number' ? raw.calories : null,
    protein_g: typeof raw.protein_g === 'number' ? raw.protein_g : null,
    estimated: raw.estimated === true,
    source: (['app', 'telegram', 'import'] as string[]).includes(raw.source as string)
      ? (raw.source as Source)
      : 'app',
    created_at: created,
  }
}

type MealInput = Omit<Meal, 'id' | 'created_at'>

function validate(input: Partial<MealInput>, { partial }: { partial: boolean }): void {
  const issues = new Issues()
  if (!partial || input.date !== undefined) checkDate(issues, 'date', input.date)
  if (!partial || input.meal !== undefined) checkMealSlot(issues, 'meal', input.meal)
  if (input.source !== undefined) checkSource(issues, 'source', input.source)
  if (input.calories !== undefined) checkNonNegativeInt(issues, 'calories', input.calories)
  if (input.protein_g !== undefined) checkNonNegativeInt(issues, 'protein_g', input.protein_g)
  if (input.description !== undefined && typeof input.description !== 'string') {
    issues.add('description must be text')
  }
  if (input.estimated !== undefined && typeof input.estimated !== 'boolean') {
    issues.add('estimated must be true or false')
  }
  issues.throwIfAny()
}

async function readAll(): Promise<Meal[]> {
  return (await store.read()).map(normalize)
}

export const mealRepository = {
  async list(): Promise<Meal[]> {
    return (await readAll()).sort(
      (a, b) => b.date.localeCompare(a.date) || b.created_at - a.created_at
    )
  },

  async forDate(date: DateString): Promise<Meal[]> {
    const order: Record<MealSlot, number> = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 }
    return (await readAll())
      .filter((meal) => meal.date === date)
      .sort((a, b) => order[a.meal] - order[b.meal] || a.created_at - b.created_at)
  },

  async create(input: MealInput): Promise<Meal> {
    validate(input, { partial: false })
    const now = Date.now()

    return store.mutate((current) => {
      const meal: Meal = {
        id: newId(),
        date: input.date,
        meal: input.meal,
        description: input.description ?? '',
        calories: input.calories ?? null,
        protein_g: input.protein_g ?? null,
        estimated: input.estimated ?? false,
        source: input.source ?? 'app',
        created_at: now,
      }
      const meals = current.map(normalize)
      meals.push(meal)
      return { data: meals, result: meal }
    })
  },

  async update(id: string, updates: Partial<MealInput>): Promise<Meal> {
    validate(updates, { partial: true })

    return store.mutate((current) => {
      const meals = current.map(normalize)
      const index = meals.findIndex((meal) => meal.id === id)
      if (index === -1) throw new NotFoundError(`No meal with id ${id}`)

      const patch = Object.fromEntries(
        Object.entries(updates).filter(([, value]) => value !== undefined)
      ) as Partial<MealInput>

      const next: Meal = { ...(meals[index] as Meal), ...patch }
      meals[index] = next
      return { data: meals, result: next }
    })
  },

  async remove(id: string): Promise<void> {
    await store.mutate((current) => {
      const meals = current.map(normalize)
      const index = meals.findIndex((meal) => meal.id === id)
      if (index === -1) throw new NotFoundError(`No meal with id ${id}`)
      meals.splice(index, 1)
      return { data: meals, result: undefined }
    })
  },

  /** Not on `DesvuApi` — search reads the raw rows. */
  async listAll(): Promise<Meal[]> {
    return readAll()
  },
}

export type MealRepository = typeof mealRepository
