import { describe, expect, it } from 'vitest'
// @ts-expect-error — plain ESM script, deliberately not TypeScript so it runs standalone.
import { localIso, toEvent, toIso } from '../scripts/refresh-calendar.mjs'
import { eventDate } from '../src/main/repos/calendarRepository'

/**
 * `calendar.json` is read by the app, by `/sort-inbox`, and by anyone poking at the vault
 * with a script. These pin the representation so all three agree.
 */

describe('timestamps have one shape', () => {
  const OFFSET_FORM = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/

  it('writes an all-day event as local midnight with a local offset', () => {
    const iso = toIso({ date: '2026-08-04' })
    expect(iso).toMatch(OFFSET_FORM)
    expect(iso.slice(0, 10)).toBe('2026-08-04')
    expect(iso).toContain('T00:00:00')
  })

  it('passes a timed event through exactly as Google sent it', () => {
    // Re-formatting a value that is already correct is a chance to get it wrong.
    expect(toIso({ dateTime: '2026-08-04T14:30:00-07:00' })).toBe('2026-08-04T14:30:00-07:00')
  })

  it('never emits the Z form, which would mix two representations in one file', () => {
    // The trap this guards: `.slice(0, 10)` would read as the local day for a timed event
    // and the UTC day for an all-day one, and those differ east of Greenwich.
    expect(toIso({ date: '2026-08-04' })).not.toContain('Z')
    expect(localIso(new Date(2026, 7, 4))).not.toContain('Z')
  })

  it('keeps slice(0,10) equal to the local calendar day', () => {
    for (const day of ['2026-01-01', '2026-06-15', '2026-08-04', '2026-12-31']) {
      const iso = toIso({ date: day })
      expect(iso.slice(0, 10)).toBe(day)
      // And the repository, which parses rather than slices, must agree.
      expect(eventDate(iso)).toBe(day)
    }
  })
})

describe('mapping a Google event', () => {
  it('marks all-day events and carries a location when there is one', () => {
    expect(
      toEvent({
        id: 'a',
        summary: ' Career fair ',
        start: { date: '2026-08-04' },
        end: { date: '2026-08-05' },
        location: '  Cohon University Center  ',
      })
    ).toMatchObject({ id: 'a', title: 'Career fair', all_day: true, location: 'Cohon University Center' })
  })

  it('omits location entirely rather than writing an empty one', () => {
    const event = toEvent({
      id: 'b',
      summary: '15-451 lecture',
      start: { dateTime: '2026-08-04T10:00:00-07:00' },
      end: { dateTime: '2026-08-04T11:20:00-07:00' },
    })
    expect(event).not.toHaveProperty('location')
    expect(event?.all_day).toBe(false)
  })

  it('gives an untitled event a readable placeholder rather than an empty string', () => {
    const event = toEvent({
      id: 'c',
      start: { dateTime: '2026-08-04T10:00:00-07:00' },
      end: { dateTime: '2026-08-04T11:00:00-07:00' },
    })
    expect(event?.title).toBe('(no title)')
  })

  it('drops an event with no usable times instead of writing a broken record', () => {
    expect(toEvent({ id: 'd', summary: 'nonsense', start: {}, end: {} })).toBeNull()
  })
})
