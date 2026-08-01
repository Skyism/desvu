import { describe, expect, it } from 'vitest'
import type { CalendarEvent, Todo } from '@shared/types'

import {
  RAIL_END_MINUTE,
  RAIL_START_MINUTE,
  freeGaps,
  isOnRail,
  nextEventAfter,
  packTodos,
  railLeft,
  railWidth,
  toRailEvents,
  type RailEvent,
} from '@/components/timeline/schedule'

const DATE = '2026-08-01'

/** `2026-08-01T10:00:00` with no offset — parsed as local, which is what the rail wants. */
function at(hour: number, minute = 0, date = DATE): string {
  return `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`
}

function event(overrides: Partial<CalendarEvent> & { id: string }): CalendarEvent {
  return {
    title: 'Something',
    start: at(10),
    end: at(11),
    all_day: false,
    ...overrides,
  }
}

let sequence = 0
function todo(overrides: Partial<Todo> = {}): Todo {
  sequence += 1
  return {
    id: `todo-${sequence}`,
    text: `Task ${sequence}`,
    category: 'school',
    priority: 2,
    estimate_minutes: 30,
    actual_minutes: null,
    due: DATE,
    status: 'open',
    recurrence: null,
    recurrence_parent: null,
    tags: [],
    notes: '',
    source: 'app',
    created_at: 0,
    updated_at: 0,
    completed_at: null,
    ...overrides,
  }
}

describe('toRailEvents', () => {
  it('converts timed events to minutes since local midnight, in order', () => {
    const rail = toRailEvents(
      [
        event({ id: 'b', title: 'Lecture', start: at(10), end: at(11, 30) }),
        event({ id: 'a', title: 'Lab shift', start: at(8), end: at(9, 30) }),
      ],
      DATE
    )

    expect(rail.map((item) => [item.title, item.start, item.end])).toEqual([
      ['Lab shift', 480, 570],
      ['Lecture', 600, 690],
    ])
  })

  it('drops all-day events', () => {
    // They contribute zero committed minutes in the repository — most are birthdays and
    // deadlines, not time commitments — so a block spanning the rail would lie.
    const rail = toRailEvents(
      [event({ id: 'x', title: 'Rent due', all_day: true, start: at(0), end: at(0) })],
      DATE
    )
    expect(rail).toEqual([])
  })

  it('clamps a multi-day event to the day being shown', () => {
    const rail = toRailEvents(
      [event({ id: 'x', title: 'Conference', start: at(9, 0, '2026-07-31'), end: at(14) })],
      DATE
    )
    expect(rail[0]).toMatchObject({ start: 0, end: 840 })

    const trailing = toRailEvents(
      [event({ id: 'y', title: 'Redeye', start: at(22), end: at(6, 0, '2026-08-02') })],
      DATE
    )
    expect(trailing[0]).toMatchObject({ start: 1320, end: 1440 })
  })

  it('skips an event whose start will not parse rather than throwing', () => {
    expect(toRailEvents([event({ id: 'x', start: 'not a date' })], DATE)).toEqual([])
  })
})

describe('freeGaps', () => {
  const events: RailEvent[] = [
    { id: 'a', title: 'Lab', start: 480, end: 570 },
    { id: 'b', title: 'Lecture', start: 600, end: 690 },
    { id: 'c', title: 'Research', start: 720, end: 930 },
  ]

  it('returns the stretches between events, from the rail start', () => {
    expect(freeGaps(events, RAIL_START_MINUTE)).toEqual([
      { start: 570, end: 600 },
      { start: 690, end: 720 },
      { start: 930, end: RAIL_END_MINUTE },
    ])
  })

  it('starts from now, so the morning that is already gone is not offered', () => {
    const gaps = freeGaps(events, 700)
    expect(gaps[0]).toEqual({ start: 700, end: 720 })
  })

  it('merges overlapping events so a double-booked hour closes the gap once', () => {
    const overlapping: RailEvent[] = [
      { id: 'a', title: 'One', start: 600, end: 720 },
      { id: 'b', title: 'Two', start: 660, end: 780 },
    ]
    expect(freeGaps(overlapping, RAIL_START_MINUTE)).toEqual([
      { start: 480, end: 600 },
      { start: 780, end: RAIL_END_MINUTE },
    ])
  })

  it('returns nothing when the day is booked solid', () => {
    expect(
      freeGaps([{ id: 'a', title: 'All of it', start: 0, end: 1440 }], RAIL_START_MINUTE)
    ).toEqual([])
  })

  it('returns the whole rail when there is no calendar at all', () => {
    expect(freeGaps([], RAIL_START_MINUTE)).toEqual([
      { start: RAIL_START_MINUTE, end: RAIL_END_MINUTE },
    ])
  })
})

describe('packTodos', () => {
  it('lays todos into the first gap that can hold them', () => {
    const gaps = [
      { start: 570, end: 600 },
      { start: 690, end: 900 },
    ]
    const short = todo({ estimate_minutes: 20 })
    const long = todo({ estimate_minutes: 90 })

    const { placed, unplaced } = packTodos([short, long], gaps, 30)

    expect(unplaced).toEqual([])
    expect(placed).toEqual([
      { todo: short, start: 570, end: 590, minutes: 20 },
      { todo: long, start: 690, end: 780, minutes: 90 },
    ])
  })

  it('packs consecutive todos into the same gap without overlapping them', () => {
    const gaps = [{ start: 600, end: 720 }]
    const first = todo({ estimate_minutes: 40 })
    const second = todo({ estimate_minutes: 40 })

    const { placed } = packTodos([first, second], gaps, 30)
    expect(placed.map((item) => [item.start, item.end])).toEqual([
      [600, 640],
      [640, 680],
    ])
  })

  it('skips a gap that is too small rather than overflowing it', () => {
    const gaps = [
      { start: 600, end: 615 },
      { start: 700, end: 900 },
    ]
    const big = todo({ estimate_minutes: 60 })
    const { placed } = packTodos([big], gaps, 30)
    expect(placed[0]).toMatchObject({ start: 700, end: 760 })
  })

  it('reports what it could not place rather than dropping it silently', () => {
    const gaps = [{ start: 600, end: 620 }]
    const big = todo({ estimate_minutes: 120 })
    const { placed, unplaced } = packTodos([big], gaps, 30)
    expect(placed).toEqual([])
    expect(unplaced).toEqual([big])
  })

  it('falls back to the settings estimate when a todo has none', () => {
    const gaps = [{ start: 600, end: 900 }]
    const { placed } = packTodos([todo({ estimate_minutes: null })], gaps, 45)
    expect(placed[0]?.minutes).toBe(45)
  })

  it('gives a zero-minute todo a visible sliver instead of a zero-width block', () => {
    const gaps = [{ start: 600, end: 900 }]
    const { placed } = packTodos([todo({ estimate_minutes: 0 })], gaps, 30)
    expect(placed[0]?.minutes).toBe(1)
  })
})

describe('rail geometry', () => {
  it('maps the ends of the day to the ends of the rail', () => {
    expect(railLeft(RAIL_START_MINUTE)).toBe('0.00%')
    expect(railLeft(RAIL_END_MINUTE)).toBe('100.00%')
  })

  it('clamps anything outside the visible window', () => {
    expect(railLeft(0)).toBe('0.00%')
    expect(railLeft(1439)).toBe('100.00%')
    expect(railWidth(0, RAIL_START_MINUTE)).toBe('0.00%')
    expect(railWidth(1380, 1440)).toBe('0.00%')
  })

  it('measures a span as a percentage of the fifteen-hour rail', () => {
    expect(railWidth(600, 690)).toBe('10.00%') // 90 of 900 minutes
  })

  it('knows what is off the rail entirely', () => {
    expect(isOnRail(600, 690)).toBe(true)
    expect(isOnRail(1380, 1440)).toBe(false)
    expect(isOnRail(0, 480)).toBe(false)
  })
})

describe('nextEventAfter', () => {
  const events: RailEvent[] = [
    { id: 'a', title: 'Lab', start: 480, end: 570 },
    { id: 'b', title: '15-451 lecture', start: 600, end: 690 },
  ]

  it('finds the next event that has not started', () => {
    expect(nextEventAfter(events, 560)?.title).toBe('15-451 lecture')
  })

  it('does not offer an event that is already running', () => {
    expect(nextEventAfter(events, 620)).toBeNull()
  })

  it('returns null once the day is over, so the hero can say so plainly', () => {
    expect(nextEventAfter(events, 1300)).toBeNull()
    expect(nextEventAfter([], 600)).toBeNull()
  })
})
