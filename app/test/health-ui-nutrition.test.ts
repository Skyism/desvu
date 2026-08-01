import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Meal, Workout } from '../src/shared/types'

import { mealRepository } from '../src/main/repos/mealRepository'
import { settingsRepository } from '../src/main/repos/settingsRepository'
import { workoutRepository } from '../src/main/repos/workoutRepository'
import {
  activeTargets,
  addDays,
  buildTrend,
  dayHeading,
  dayTotals,
  daysLogged,
  formatDuration,
  formatMacros,
  formatMeal,
  groupByDay,
  hasAnyTarget,
  mealSlotOrder,
  parseOptionalNumber,
  slotForHour,
  targetFraction,
  toDateString,
  trainingMinutes,
  trendAverage,
} from '../src/renderer/src/components/health/nutrition'
import { createTempVault, type TempVault } from './helpers/vault'

const meal = (over: Partial<Meal> = {}): Meal => ({
  id: over.id ?? 'm1',
  date: over.date ?? '2026-08-01',
  meal: over.meal ?? 'lunch',
  description: over.description ?? 'chipotle bowl',
  calories: over.calories === undefined ? null : over.calories,
  protein_g: over.protein_g === undefined ? null : over.protein_g,
  estimated: over.estimated ?? false,
  source: over.source ?? 'app',
  created_at: over.created_at ?? 1,
})

const workout = (over: Partial<Workout> = {}): Workout => ({
  id: over.id ?? 'w1',
  date: over.date ?? '2026-08-01',
  type: over.type ?? 'lift',
  description: over.description ?? 'push day',
  duration_minutes: over.duration_minutes === undefined ? null : over.duration_minutes,
  source: over.source ?? 'app',
  created_at: over.created_at ?? 1,
})

// ---------------------------------------------------------------------------
// Rule 1 — a missing number is never a zero.
// ---------------------------------------------------------------------------

describe('numbers are optional, and absence is not zero', () => {
  it('totals to null, not 0, when nothing logged carried a number', () => {
    const totals = dayTotals([meal(), meal({ id: 'm2', description: 'coffee' })])
    // This is the whole point. 0 would be false, and a 0 in a chart or a total reads
    // as a failure the user did not have.
    expect(totals.calories).toBeNull()
    expect(totals.protein_g).toBeNull()
    expect(totals.logged).toBe(2)
    expect(totals.counted).toBe(0)
  })

  it('sums only the meals that carry a number, and says how many did', () => {
    const totals = dayTotals([
      meal({ id: 'm1', calories: 340, protein_g: 12 }),
      meal({ id: 'm2' }),
      meal({ id: 'm3', calories: 780, protein_g: 42 }),
    ])
    expect(totals.calories).toBe(1120)
    expect(totals.protein_g).toBe(54)
    expect(totals.logged).toBe(3)
    expect(totals.counted).toBe(2)
  })

  it('counts calories and protein independently', () => {
    const totals = dayTotals([meal({ calories: 340, protein_g: null })])
    expect(totals.calories).toBe(340)
    expect(totals.protein_g).toBeNull()
  })

  it('leaves training minutes null when no duration was recorded', () => {
    expect(trainingMinutes([workout()])).toBeNull()
    expect(trainingMinutes([workout({ duration_minutes: 55 }), workout({ id: 'w2' })])).toBe(55)
  })

  it('renders nothing at all rather than a placeholder dash', () => {
    expect(formatMacros(null, null)).toBeNull()
    expect(formatMeal(meal())).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Rule 2 — the typography is the disclaimer.
// ---------------------------------------------------------------------------

describe('estimated numbers are marked as estimates', () => {
  it('marks an estimate with a tilde and leaves a measurement bare', () => {
    expect(formatMacros(340, 12, true)).toBe('~340 cal · ~12g')
    expect(formatMacros(340, 12, false)).toBe('340 cal · 12g')
  })

  it('propagates the estimate flag into a day total', () => {
    const totals = dayTotals([
      meal({ id: 'm1', calories: 340, estimated: false }),
      meal({ id: 'm2', calories: 780, estimated: true }),
    ])
    // A total built partly from a guess is a guess.
    expect(totals.estimated).toBe(true)
  })

  it('does not mark a total as estimated when the estimate carried no number', () => {
    const totals = dayTotals([
      meal({ id: 'm1', calories: 340, estimated: false }),
      meal({ id: 'm2', estimated: true }),
    ])
    expect(totals.estimated).toBe(false)
  })

  it('sets estimates in italic Cormorant and measurements in DM Sans', () => {
    const source = readFileSync(
      path.resolve(import.meta.dirname, '../src/renderer/src/components/health/NutritionFigure.tsx'),
      'utf8'
    )
    // `.text-estimate` is the design system's italic-Cormorant utility, and it must be
    // reached only through the `estimated` branch — never applied unconditionally.
    expect(source).toMatch(/estimated \? 'text-estimate text-base' : 'text-ink2 text-xs'/)

    // And Tailwind's bare `italic` class must never appear: there is no DM Sans italic
    // cut, so italicising sans text would silently substitute a fallback face. The only
    // route to italic in this app is `.text-estimate`, which switches the family too.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code).not.toMatch(/\bitalic\b/)
  })
})

// ---------------------------------------------------------------------------
// Rule 3 — targets are opt-in and silent until then.
// ---------------------------------------------------------------------------

describe('targets are off until asked for', () => {
  it('reports no targets when show_targets is false, even with numbers stored', () => {
    const targets = activeTargets({
      nutrition: { calorie_target: 2400, protein_target_g: 150, show_targets: false },
    })
    // The numbers are on disk but the surface must not use them. This is what makes
    // day one have no target line and no sense of falling short.
    expect(targets).toEqual({ calories: null, protein_g: null })
    expect(hasAnyTarget(targets)).toBe(false)
  })

  it('reports targets once the user opts in', () => {
    const targets = activeTargets({
      nutrition: { calorie_target: 2400, protein_target_g: null, show_targets: true },
    })
    expect(targets).toEqual({ calories: 2400, protein_g: null })
    expect(hasAnyTarget(targets)).toBe(true)
  })

  it('reports no targets for null settings and for opted-in-but-unset', () => {
    expect(hasAnyTarget(activeTargets(null))).toBe(false)
    expect(
      hasAnyTarget(
        activeTargets({
          nutrition: { calorie_target: null, protein_target_g: null, show_targets: true },
        })
      )
    ).toBe(false)
  })

  it('has no fraction to draw without a target or without a value', () => {
    expect(targetFraction(1200, null)).toBeNull()
    expect(targetFraction(null, 2400)).toBeNull()
    expect(targetFraction(1200, 0)).toBeNull()
  })

  it('clamps a fraction past the target — going over is not a special state', () => {
    expect(targetFraction(3000, 2400)).toBe(1)
    expect(targetFraction(1200, 2400)).toBe(0.5)
  })
})

// ---------------------------------------------------------------------------
// formatting
// ---------------------------------------------------------------------------

describe('formatDuration', () => {
  it.each([
    [55, '55m'],
    [60, '1h'],
    [85, '1h 25m'],
    [0, '0m'],
  ])('formats %i minutes', (minutes, expected) => {
    expect(formatDuration(minutes)).toBe(expected)
  })

  it('renders nothing for a workout with no duration', () => {
    expect(formatDuration(null)).toBeNull()
  })
})

describe('parseOptionalNumber', () => {
  it('accepts blank as a complete answer', () => {
    // The single most important line in the meal form: an empty field is valid and the
    // save proceeds. Requiring numbers is how food logs die.
    expect(parseOptionalNumber('')).toEqual({ ok: true, value: null })
    expect(parseOptionalNumber('   ')).toEqual({ ok: true, value: null })
  })
  it('accepts a number', () => {
    expect(parseOptionalNumber('850')).toEqual({ ok: true, value: 850 })
    expect(parseOptionalNumber('12.6')).toEqual({ ok: true, value: 13 })
  })
  it('rejects text and negatives without inventing a value', () => {
    expect(parseOptionalNumber('lots').ok).toBe(false)
    expect(parseOptionalNumber('-5').ok).toBe(false)
  })
})

describe('slots', () => {
  it('guesses a slot from the clock, always editable', () => {
    expect(slotForHour(8)).toBe('breakfast')
    expect(slotForHour(13)).toBe('lunch')
    expect(slotForHour(19)).toBe('dinner')
    expect(slotForHour(23)).toBe('snack')
  })

  it('orders a day the way it happened', () => {
    expect(mealSlotOrder('breakfast')).toBeLessThan(mealSlotOrder('dinner'))
  })
})

describe('dates', () => {
  it('crosses a month boundary', () => {
    expect(addDays('2026-08-01', -1)).toBe('2026-07-31')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('parses YYYY-MM-DD as a local date, not UTC midnight', () => {
    // `new Date('2026-08-01')` is UTC midnight, which is 31 July in Pittsburgh.
    expect(dayHeading('2026-08-01', new Date(2026, 7, 1))).toBe('Today')
    expect(dayHeading('2026-07-31', new Date(2026, 7, 1))).toBe('Yesterday')
  })

  it('names older days plainly', () => {
    expect(dayHeading('2026-07-26', new Date(2026, 7, 1))).toBe('Sun 26 Jul')
  })
})

// ---------------------------------------------------------------------------
// grouping and trends
// ---------------------------------------------------------------------------

describe('groupByDay', () => {
  it('lists newest day first and includes a day with only a workout', () => {
    const days = groupByDay(
      [meal({ id: 'm1', date: '2026-08-01' })],
      [workout({ id: 'w1', date: '2026-08-02', duration_minutes: 55 })]
    )
    expect(days.map((day) => day.date)).toEqual(['2026-08-02', '2026-08-01'])
    expect(days[0]?.meals).toHaveLength(0)
    expect(days[0]?.minutes).toBe(55)
  })

  it('orders meals within a day chronologically by slot', () => {
    const days = groupByDay(
      [
        meal({ id: 'm1', meal: 'dinner', created_at: 1 }),
        meal({ id: 'm2', meal: 'breakfast', created_at: 2 }),
        meal({ id: 'm3', meal: 'lunch', created_at: 3 }),
      ],
      []
    )
    expect(days[0]?.meals.map((entry) => entry.meal)).toEqual(['breakfast', 'lunch', 'dinner'])
  })
})

describe('buildTrend', () => {
  it('returns a dense window, oldest first', () => {
    const points = buildTrend([], [], { days: 5, endDate: '2026-08-05' })
    expect(points.map((point) => point.date)).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
      '2026-08-04',
      '2026-08-05',
    ])
  })

  it('leaves an unlogged day as a GAP, never a zero', () => {
    const points = buildTrend(
      [meal({ date: '2026-08-03', calories: 2100, protein_g: 120 })],
      [],
      { days: 3, endDate: '2026-08-03' }
    )
    // A zero here would draw a spike to the axis on every day nobody wrote anything
    // down — the chart equivalent of a broken streak.
    expect(points.map((point) => point.calories)).toEqual([null, null, 2100])
    expect(points.map((point) => point.minutes)).toEqual([null, null, null])
    expect(points.every((point) => point.calories !== 0)).toBe(true)
  })

  it('carries the estimate flag onto the point', () => {
    const points = buildTrend(
      [meal({ date: '2026-08-01', calories: 800, estimated: true })],
      [],
      { days: 1, endDate: '2026-08-01' }
    )
    expect(points[0]?.estimated).toBe(true)
  })

  it('picks up training minutes on days with no meals', () => {
    const points = buildTrend(
      [],
      [workout({ date: '2026-08-02', duration_minutes: 55 })],
      { days: 2, endDate: '2026-08-02' }
    )
    expect(points.map((point) => point.minutes)).toEqual([null, 55])
  })
})

describe('trendAverage and daysLogged', () => {
  const points = buildTrend(
    [
      meal({ id: 'm1', date: '2026-08-01', calories: 2000 }),
      meal({ id: 'm2', date: '2026-08-03', calories: 2400 }),
    ],
    [workout({ date: '2026-08-02', duration_minutes: 40 })],
    { days: 4, endDate: '2026-08-04' }
  )

  it('averages only the days that carry a number', () => {
    // (2000 + 2400) / 2 — not / 4. Dividing by the window would punish a quiet day.
    expect(trendAverage(points, 'calories')).toBe(2200)
    expect(trendAverage(points, 'minutes')).toBe(40)
  })

  it('is null when nothing in the window was counted', () => {
    expect(trendAverage(buildTrend([], [], { days: 7 }), 'calories')).toBeNull()
  })

  it('counts the days with any log, and never frames the rest as missed', () => {
    expect(daysLogged(points)).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// against the real repositories
// ---------------------------------------------------------------------------

describe('against the meal and workout repositories on a temp vault', () => {
  let vault: TempVault

  beforeEach(async () => {
    vault = await createTempVault('health-ui')
  })

  afterEach(async () => {
    await vault.dispose()
  })

  it('day one: targets are null and off', async () => {
    const settings = await settingsRepository.get()
    expect(settings.nutrition).toEqual({
      calorie_target: null,
      protein_target_g: null,
      show_targets: false,
    })
    expect(hasAnyTarget(activeTargets(settings))).toBe(false)
  })

  it('saves a meal with no numbers at all and reads it back complete', async () => {
    const saved = await mealRepository.create({
      date: '2026-08-01',
      meal: 'lunch',
      description: 'chipotle bowl',
      calories: null,
      protein_g: null,
      estimated: false,
      source: 'app',
    })
    expect(saved.calories).toBeNull()
    expect(saved.protein_g).toBeNull()

    const list = await mealRepository.list()
    expect(list).toHaveLength(1)
    expect(dayTotals(list).calories).toBeNull()
    expect(formatMeal(list[0]!)).toBeNull()
  })

  it('round-trips an estimated meal so it renders in italics', async () => {
    await mealRepository.create({
      date: '2026-08-01',
      meal: 'breakfast',
      description: 'oatmeal, banana',
      calories: 340,
      protein_g: 12,
      estimated: true,
      source: 'app',
    })
    const list = await mealRepository.list()
    expect(list[0]?.estimated).toBe(true)
    expect(formatMeal(list[0]!)).toBe('~340 cal · ~12g')
  })

  it('saves a workout with no duration', async () => {
    const saved = await workoutRepository.create({
      date: '2026-08-01',
      type: 'climb',
      description: 'bouldering, felt strong',
      duration_minutes: null,
      source: 'app',
    })
    expect(saved.duration_minutes).toBeNull()
    expect(formatDuration(saved.duration_minutes)).toBeNull()
  })

  it('turns targets on and off through settings, keeping the numbers', async () => {
    await settingsRepository.update({
      nutrition: { calorie_target: 2400, protein_target_g: 150, show_targets: true },
    })
    expect(hasAnyTarget(activeTargets(await settingsRepository.get()))).toBe(true)

    await settingsRepository.update({ nutrition: { show_targets: false } })
    const off = await settingsRepository.get()
    // Numbers survive so switching back does not mean retyping…
    expect(off.nutrition.calorie_target).toBe(2400)
    // …but nothing on the surface may read them.
    expect(hasAnyTarget(activeTargets(off))).toBe(false)
  })

  it('builds a trend over real records with gaps intact', async () => {
    const today = toDateString(new Date())
    await mealRepository.create({
      date: today,
      meal: 'dinner',
      description: 'pasta',
      calories: 900,
      protein_g: 30,
      estimated: false,
      source: 'app',
    })

    const points = buildTrend(await mealRepository.list(), await workoutRepository.list(), {
      days: 3,
    })
    expect(points).toHaveLength(3)
    expect(points.at(-1)?.calories).toBe(900)
    expect(points.slice(0, 2).every((point) => point.calories === null)).toBe(true)
  })
})
