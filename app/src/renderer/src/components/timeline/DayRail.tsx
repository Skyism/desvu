import { categoryMarkerStyle } from '@/lib/category'
import { formatClock, formatMinutes } from '@/lib/date'
import { cn } from '@/lib/cn'
import {
  RAIL_END_MINUTE,
  RAIL_START_MINUTE,
  RAIL_TICKS,
  isOnRail,
  railLeft,
  railWidth,
  type PlacedTodo,
  type RailEvent,
} from './schedule'

export interface DayRailProps {
  events: readonly RailEvent[]
  placed: readonly PlacedTodo[]
  /** Minutes since midnight, or null when the rail is not showing today. */
  nowMinute: number | null
  className?: string
}

/** Minutes as `10am` / `4:30pm`, from a minute-of-day rather than a Date. */
function clockAt(minute: number): string {
  const base = new Date()
  base.setHours(Math.floor(minute / 60), minute % 60, 0, 0)
  return formatClock(base)
}

/**
 * 8am → 11pm, drawn once, full width.
 *
 * Calendar events are solid blocks in `--fill`; todos are dashed gold outlines placed
 * into the gaps between them, sized by `estimate_minutes`. The two treatments are
 * deliberately different in kind and not just in colour — an event is a fact about the
 * day and a placed todo is a proposal, and the dashes say so.
 *
 * Everything before now is veiled and a 1.5px gold line marks the present, which is what
 * makes "you have three hours left, not eight" legible without a sentence.
 *
 * The rail is decorative for assistive tech — every block it draws is also a row in the
 * list below or a line in the overflow tray, so a screen reader gets the same day twice
 * rather than a pile of unreadable absolutely-positioned divs.
 */
export function DayRail({ events, placed, nowMinute, className }: DayRailProps): React.JSX.Element {
  const showNow =
    nowMinute !== null && nowMinute >= RAIL_START_MINUTE && nowMinute <= RAIL_END_MINUTE
  const pastWidth = nowMinute === null ? '0%' : railWidth(RAIL_START_MINUTE, nowMinute)

  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)} aria-hidden>
      {/* Tick labels sit above the rail, not inside it, so a block can never cover one. */}
      <div className="relative h-[13px]">
        {RAIL_TICKS.map((minute) => (
          <div
            key={minute}
            className="text-micro text-muted absolute top-0 tracking-[0.06em]"
            style={{ left: railLeft(minute) }}
          >
            {clockAt(minute)}
          </div>
        ))}
        <div className="text-micro text-muted absolute top-0 right-0 tracking-[0.06em]">11pm</div>
      </div>

      <div className="border-line bg-bg relative h-24 overflow-hidden rounded-control border">
        {events.filter((event) => isOnRail(event.start, event.end)).map((event) => (
          <div
            key={event.id}
            className="border-line bg-fill absolute top-0 bottom-0 overflow-hidden border-r px-[7px] py-2"
            style={{ left: railLeft(event.start), width: railWidth(event.start, event.end) }}
            title={`${event.title} · ${clockAt(event.start)}`}
          >
            <div className="text-micro text-ink2 overflow-hidden">{event.title}</div>
            <div className="text-muted mt-[3px] text-[10px] leading-none">
              {clockAt(event.start)}
            </div>
          </div>
        ))}

        {placed.filter((item) => isOnRail(item.start, item.end)).map((item) => (
          <div
            key={item.todo.id}
            className="rounded-block border-accent-border bg-soft absolute top-[7px] bottom-[7px] flex flex-col gap-1 overflow-hidden border border-dashed px-[3px] py-[5px]"
            style={{ left: railLeft(item.start), width: railWidth(item.start, item.end) }}
            title={`${item.todo.text} · ${clockAt(item.start)} · ${formatMinutes(item.minutes)}`}
          >
            {/* No component here: the block is absolutely positioned and 5px wide at its
                narrowest, so the marker is drawn from the shared inline style instead. */}
            <span className="ml-px" style={categoryMarkerStyle(item.todo.category, 5)} />
            {/* Under ~75 minutes the block is too narrow for a legible word, and half a
                word is worse than none. The title attribute still carries it. */}
            {item.minutes >= 75 && (
              <span className="text-micro text-ink2 overflow-hidden">{item.todo.text}</span>
            )}
          </div>
        ))}

        {showNow && (
          <>
            <div
              className="bg-bg pointer-events-none absolute top-0 bottom-0 left-0 opacity-[0.62]"
              style={{ width: pastWidth }}
            />
            <div
              className="bg-accent absolute top-0 bottom-0 w-[1.5px]"
              style={{ left: railLeft(nowMinute) }}
            />
          </>
        )}
      </div>
    </div>
  )
}
