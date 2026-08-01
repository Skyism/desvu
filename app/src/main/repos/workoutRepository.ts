import type { DateString, Source, Workout, WorkoutType } from '@shared/types'
import { dataPath } from '@shared/vault'
import { NotFoundError } from '../lib/errors'
import { newId } from '../lib/ids'
import { createJsonStore, expectArray } from '../lib/json-store'
import {
  Issues,
  WORKOUT_TYPES,
  checkDate,
  checkNonNegativeInt,
  checkSource,
  checkWorkoutType,
} from '../lib/validate'

const store = createJsonStore<Workout[]>(
  () => dataPath('workouts.json'),
  () => [],
  (parsed, filePath) => expectArray<Workout>(parsed, filePath)
)

function normalize(raw: Partial<Workout>): Workout {
  const created = typeof raw.created_at === 'number' ? raw.created_at : Date.now()
  return {
    id: typeof raw.id === 'string' && raw.id !== '' ? raw.id : newId(),
    date: typeof raw.date === 'string' ? raw.date : '1970-01-01',
    type: (WORKOUT_TYPES as readonly string[]).includes(raw.type as string)
      ? (raw.type as WorkoutType)
      : 'other',
    description: typeof raw.description === 'string' ? raw.description : '',
    duration_minutes: typeof raw.duration_minutes === 'number' ? raw.duration_minutes : null,
    source: (['app', 'telegram', 'import'] as string[]).includes(raw.source as string)
      ? (raw.source as Source)
      : 'app',
    created_at: created,
  }
}

type WorkoutInput = Omit<Workout, 'id' | 'created_at'>

function validate(input: Partial<WorkoutInput>, { partial }: { partial: boolean }): void {
  const issues = new Issues()
  if (!partial || input.date !== undefined) checkDate(issues, 'date', input.date)
  if (!partial || input.type !== undefined) checkWorkoutType(issues, 'type', input.type)
  if (input.source !== undefined) checkSource(issues, 'source', input.source)
  if (input.duration_minutes !== undefined) {
    checkNonNegativeInt(issues, 'duration_minutes', input.duration_minutes)
  }
  if (input.description !== undefined && typeof input.description !== 'string') {
    issues.add('description must be text')
  }
  issues.throwIfAny()
}

async function readAll(): Promise<Workout[]> {
  return (await store.read()).map(normalize)
}

export const workoutRepository = {
  async list(): Promise<Workout[]> {
    return (await readAll()).sort(
      (a, b) => b.date.localeCompare(a.date) || b.created_at - a.created_at
    )
  },

  async forDate(date: DateString): Promise<Workout[]> {
    return (await readAll())
      .filter((workout) => workout.date === date)
      .sort((a, b) => a.created_at - b.created_at)
  },

  async create(input: WorkoutInput): Promise<Workout> {
    validate(input, { partial: false })
    const now = Date.now()

    return store.mutate((current) => {
      const workout: Workout = {
        id: newId(),
        date: input.date,
        type: input.type,
        description: input.description ?? '',
        duration_minutes: input.duration_minutes ?? null,
        source: input.source ?? 'app',
        created_at: now,
      }
      const workouts = current.map(normalize)
      workouts.push(workout)
      return { data: workouts, result: workout }
    })
  },

  async update(id: string, updates: Partial<WorkoutInput>): Promise<Workout> {
    validate(updates, { partial: true })

    return store.mutate((current) => {
      const workouts = current.map(normalize)
      const index = workouts.findIndex((workout) => workout.id === id)
      if (index === -1) throw new NotFoundError(`No workout with id ${id}`)

      const patch = Object.fromEntries(
        Object.entries(updates).filter(([, value]) => value !== undefined)
      ) as Partial<WorkoutInput>

      const next: Workout = { ...(workouts[index] as Workout), ...patch }
      workouts[index] = next
      return { data: workouts, result: next }
    })
  },

  async remove(id: string): Promise<void> {
    await store.mutate((current) => {
      const workouts = current.map(normalize)
      const index = workouts.findIndex((workout) => workout.id === id)
      if (index === -1) throw new NotFoundError(`No workout with id ${id}`)
      workouts.splice(index, 1)
      return { data: workouts, result: undefined }
    })
  },

  /** Not on `DesvuApi` — search reads the raw rows. */
  async listAll(): Promise<Workout[]> {
    return readAll()
  },
}

export type WorkoutRepository = typeof workoutRepository
