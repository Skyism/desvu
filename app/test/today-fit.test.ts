import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Todo } from '@shared/types'

import { todoRepository } from '../src/main/repos/todoRepository'
import {
  RAIL_START_MINUTE,
  freeGaps,
  packTodos,
  toRailEvents,
} from '@/components/timeline/schedule'
import { createTempVault, dayOffset, type TempVault } from './helpers/vault'

/**
 * The rail and the tray against the real repository.
 *
 * The invariant this file exists to protect: **every todo due today is either drawn on
 * the rail or named in the tray — never both, never neither.** The rail packs, the
 * repository decides what overflows, and if those two ever disagree the hero is lying
 * about the one thing it is for.
 */

let vault: TempVault

beforeEach(async () => {
  vault = await createTempVault('today-fit')
})

afterEach(async () => {
  await vault.dispose()
})

const TODAY = dayOffset(0)

/** Local ISO with no offset — parsed as local time by both the repository and the rail. */
function at(minutes: number, date = TODAY): string {
  const hour = String(Math.floor(minutes / 60)).padStart(2, '0')
  const minute = String(minutes % 60).padStart(2, '0')
  return `${date}T${hour}:${minute}:00`
}

/** 8am, so `dayLoad`'s window starts at the rail's left edge and the maths is stable. */
const EIGHT_AM = new Date(`${TODAY}T08:00:00`)

/** The comp's day: 690 committed minutes between 8am and 10pm. */
const EVENTS = [
  { id: 'a', title: 'Lab shift', start: at(480), end: at(570), all_day: false },
  { id: 'b', title: '15-451 lecture', start: at(600), end: at(690), all_day: false },
  { id: 'c', title: 'Research block', start: at(720), end: at(930), all_day: false },
  { id: 'd', title: 'Career fair', start: at(990), end: at(1110), all_day: false },
  { id: 'e', title: 'Dinner with Priya', start: at(1140), end: at(1320), all_day: false },
]

async function seedComp(): Promise<void> {
  await vault.writeJson('data/calendar.json', { events: EVENTS })
  const tasks: Array<[string, Todo['category'], Todo['priority'], number]> = [
    ['Email the Ramp recruiter', 'recruiting', 1, 15],
    ['Finish the Jane Street OA', 'recruiting', 0, 90],
    ['Rewrite resume bullets', 'recruiting', 2, 45],
    ['Problem set 3, first pass', 'school', 1, 75],
    ['Skim the consensus chapter', 'school', 2, 40],
    ['Grocery run', 'personal', 3, 30],
    ['Fix the bike brake', 'personal', 3, 20],
    ['Book the flight home', 'personal', 2, 25],
  ]
  for (const [text, category, priority, estimate] of tasks) {
    await todoRepository.create({
      text,
      category,
      priority,
      estimate_minutes: estimate,
      due: TODAY,
    })
  }
}

/** What the hero actually renders, computed the same way `TimelineHero` computes it. */
async function renderHero(now = EIGHT_AM) {
  const [todos, load, events] = await Promise.all([
    todoRepository.forDate(TODAY),
    todoRepository.dayLoad(TODAY, now),
    Promise.resolve(EVENTS),
  ])
  const overflowIds = new Set(load.overflow.map((todo) => todo.id))
  const fitting = todos.filter((todo) => !overflowIds.has(todo.id))
  const railEvents = toRailEvents(events, TODAY)
  const nowMinute = now.getHours() * 60 + now.getMinutes()
  const gaps = freeGaps(railEvents, Math.max(RAIL_START_MINUTE, nowMinute))
  const { placed, unplaced } = packTodos(fitting, gaps, 30)
  return { todos, load, placed, unplaced }
}

describe('the rail and the tray agree', () => {
  it('accounts for every todo exactly once', async () => {
    await seedComp()
    const { todos, load, placed, unplaced } = await renderHero()

    const drawn = placed.map((item) => item.todo.id)
    const trayed = [...load.overflow.map((todo) => todo.id), ...unplaced.map((todo) => todo.id)]
    const accounted = [...drawn, ...trayed]

    expect(new Set(accounted).size).toBe(accounted.length) // nothing counted twice
    expect([...accounted].sort()).toEqual(todos.map((todo) => todo.id).sort()) // nothing missed
  })

  it('never places a todo the repository said would not fit', async () => {
    await seedComp()
    const { load, placed } = await renderHero()
    const overflowIds = new Set(load.overflow.map((todo) => todo.id))
    expect(placed.some((item) => overflowIds.has(item.todo.id))).toBe(false)
  })

  it('overflows something on a day this full, so the tray is exercised', async () => {
    await seedComp()
    const { load } = await renderHero()
    // 690 committed minutes out of a 960-minute window leaves 270 free against 340
    // minutes of tasks — the day genuinely does not fit, which is the point of the hero.
    expect(load.committed_minutes).toBe(690)
    expect(load.free_minutes).toBe(270)
    expect(load.due_minutes).toBe(340)
    expect(load.overflow.length).toBeGreaterThan(0)
  })

  it('drops the lowest-priority work first — overflow follows the order of the day', async () => {
    await seedComp()
    const { load } = await renderHero()
    const priorities = load.overflow.map((todo) => todo.priority)
    // Whatever falls out, it is never a p0 while a p3 is still being placed.
    expect(Math.min(...priorities)).toBeGreaterThanOrEqual(2)
  })

  it('never draws a block on top of a calendar event', async () => {
    await seedComp()
    const { placed } = await renderHero()
    const busy = toRailEvents(EVENTS, TODAY)
    for (const item of placed) {
      for (const event of busy) {
        expect(item.start < event.end && event.start < item.end).toBe(false)
      }
    }
  })

  it('never draws two blocks over each other', async () => {
    await seedComp()
    const { placed } = await renderHero()
    const ordered = [...placed].sort((a, b) => a.start - b.start)
    for (let index = 1; index < ordered.length; index += 1) {
      expect(ordered[index]!.start).toBeGreaterThanOrEqual(ordered[index - 1]!.end)
    }
  })

  it('places everything and empties the tray on an open day', async () => {
    await vault.writeJson('data/calendar.json', { events: [] })
    await todoRepository.create({ text: 'Call mom', estimate_minutes: 15, due: TODAY })
    await todoRepository.create({ text: 'Laundry', estimate_minutes: 45, due: TODAY })

    const { load, placed, unplaced } = await renderHero()
    expect(load.overflow).toEqual([])
    expect(unplaced).toEqual([])
    expect(placed).toHaveLength(2)
    expect(load.free_minutes).toBe(960) // the whole 8am-to-midnight window
  })

  it('renders an empty day as empty rather than as an error', async () => {
    const { load, placed, unplaced } = await renderHero()
    expect(load.due_minutes).toBe(0)
    expect(load.overflow).toEqual([])
    expect(placed).toEqual([])
    expect(unplaced).toEqual([])
  })

  it('shrinks the free window as the day passes', async () => {
    await seedComp()
    const morning = await renderHero(new Date(`${TODAY}T08:00:00`))
    const evening = await renderHero(new Date(`${TODAY}T20:00:00`))
    expect(evening.load.free_minutes).toBeLessThan(morning.load.free_minutes)
    expect(evening.load.overflow.length).toBeGreaterThanOrEqual(morning.load.overflow.length)
  })

  it('treats an all-day event as no commitment at all', async () => {
    await vault.writeJson('data/calendar.json', {
      events: [{ id: 'x', title: 'Rent due', start: at(0), end: at(0), all_day: true }],
    })
    await todoRepository.create({ text: 'Pay rent', estimate_minutes: 10, due: TODAY })
    const { load, placed } = await renderHero()
    expect(load.committed_minutes).toBe(0)
    expect(placed).toHaveLength(1)
  })

  it('renders a day with no calendar file at all', async () => {
    await todoRepository.create({ text: 'Read', estimate_minutes: 30, due: TODAY })
    const load = await todoRepository.dayLoad(TODAY, EIGHT_AM)
    expect(load.committed_minutes).toBe(0)
    expect(load.overflow).toEqual([])
  })
})

describe('the calibrated figure (PRD T11)', () => {
  /** `count` completed todos in one category, actuals at `ratio` times the estimate. */
  async function bank(count: number, category: Todo['category'], ratio: number): Promise<void> {
    for (let index = 0; index < count; index += 1) {
      const todo = await todoRepository.create({
        text: `history ${category} ${index}`,
        category,
        estimate_minutes: 40,
        due: dayOffset(-(index + 1)),
      })
      await todoRepository.complete(todo.id, Math.round(40 * ratio))
    }
  }

  it('stays null below the confidence threshold, so the UI has nothing to show', async () => {
    await bank(24, 'school', 1.5)
    await todoRepository.create({ text: 'Today', category: 'school', estimate_minutes: 60, due: TODAY })

    const factors = await todoRepository.correctionFactors()
    expect(factors.find((factor) => factor.category === 'school')?.confident).toBe(false)

    const load = await todoRepository.dayLoad(TODAY, EIGHT_AM)
    expect(load.corrected_due_minutes).toBeNull()
  })

  it('appears at the threshold, and the two figures differ', async () => {
    await bank(25, 'school', 1.5)
    await todoRepository.create({ text: 'Today', category: 'school', estimate_minutes: 60, due: TODAY })

    const factors = await todoRepository.correctionFactors()
    const school = factors.find((factor) => factor.category === 'school')
    expect(school?.confident).toBe(true)
    expect(school?.factor).toBeCloseTo(1.5, 2)

    const load = await todoRepository.dayLoad(TODAY, EIGHT_AM)
    expect(load.due_minutes).toBe(60)
    expect(load.corrected_due_minutes).toBe(90)
  })

  it('leaves an unconfident category uncorrected even when another one is confident', async () => {
    await bank(25, 'school', 2)
    await bank(3, 'personal', 3)
    await todoRepository.create({ text: 'S', category: 'school', estimate_minutes: 30, due: TODAY })
    await todoRepository.create({ text: 'P', category: 'personal', estimate_minutes: 30, due: TODAY })

    const load = await todoRepository.dayLoad(TODAY, EIGHT_AM)
    // 30 doubled for the confident school task, 30 untouched for the unconfident one.
    expect(load.due_minutes).toBe(60)
    expect(load.corrected_due_minutes).toBe(90)
  })

  it('uses the corrected minutes to decide what fits, once it is allowed to', async () => {
    await vault.writeJson('data/calendar.json', {
      events: [{ id: 'a', title: 'Booked', start: at(480), end: at(1380), all_day: false }],
    })
    await bank(25, 'school', 3)
    // 60 free minutes left. Two 40-minute school tasks fit on paper; at 3x they do not.
    await todoRepository.create({ text: 'One', category: 'school', estimate_minutes: 40, due: TODAY })
    await todoRepository.create({ text: 'Two', category: 'school', estimate_minutes: 40, due: TODAY })

    const load = await todoRepository.dayLoad(TODAY, EIGHT_AM)
    expect(load.free_minutes).toBe(60)
    expect(load.due_minutes).toBe(80)
    expect(load.corrected_due_minutes).toBe(240)
    expect(load.overflow).toHaveLength(2)
  })
})

describe('a completion feeds the calibration', () => {
  it('banks the actual against the todo and moves the factor', async () => {
    // 24 samples: one short of confident. The 25th is the completion under test.
    for (let index = 0; index < 24; index += 1) {
      const seed = await todoRepository.create({
        text: `history ${index}`,
        category: 'recruiting',
        estimate_minutes: 30,
        due: dayOffset(-(index + 1)),
      })
      await todoRepository.complete(seed.id, 60)
    }
    expect(
      (await todoRepository.correctionFactors()).find((f) => f.category === 'recruiting')?.confident
    ).toBe(false)

    const todo = await todoRepository.create({
      text: 'Email the Ramp recruiter',
      category: 'recruiting',
      estimate_minutes: 30,
      due: TODAY,
    })

    // The completion writes first with no actual — the capture strip never gates it.
    const completed = await todoRepository.complete(todo.id, null)
    expect(completed.status).toBe('done')
    expect(completed.actual_minutes).toBeNull()

    // Skipping leaves the 25th sample unbanked, so the factor stays unconfident.
    expect(
      (await todoRepository.correctionFactors()).find((f) => f.category === 'recruiting')?.confident
    ).toBe(false)

    // Recording afterwards is what the capture strip does, and it does count.
    await todoRepository.update(todo.id, { actual_minutes: 60 })
    const factor = (await todoRepository.correctionFactors()).find(
      (f) => f.category === 'recruiting'
    )
    expect(factor?.sample_size).toBe(25)
    expect(factor?.confident).toBe(true)
    expect(factor?.factor).toBeCloseTo(2, 2)
  })

  it('keeps the completed task on today’s list so the capture strip has a row', async () => {
    const todo = await todoRepository.create({ text: 'Grocery run', due: TODAY })
    await todoRepository.complete(todo.id, null)

    // forDate drops it — right for the rail, wrong for the list.
    expect(await todoRepository.forDate(TODAY)).toEqual([])
    // list() keeps it, which is what `todaysList` filters down to.
    const all = await todoRepository.list()
    expect(all.find((item) => item.id === todo.id)?.status).toBe('done')
  })
})
