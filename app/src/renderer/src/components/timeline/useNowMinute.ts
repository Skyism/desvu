import { useEffect, useState } from 'react'

import { minutesSinceMidnight } from './schedule'

/**
 * Minutes since local midnight, updated on the minute.
 *
 * The now-line and the "in 40m" countdown are the only things on the surface that move
 * on their own, and they move at the resolution a human reads them at. The timer is
 * aligned to the next whole minute rather than run on a naive 60s interval, so the label
 * flips when the clock does instead of drifting a few seconds off it.
 */
export function useNowMinute(): number {
  const [minute, setMinute] = useState(() => minutesSinceMidnight(new Date()))

  useEffect(() => {
    let timer: number

    const schedule = (): void => {
      const now = new Date()
      const untilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds()
      timer = window.setTimeout(() => {
        setMinute(minutesSinceMidnight(new Date()))
        schedule()
      }, Math.max(250, untilNextMinute))
    }

    schedule()
    return () => window.clearTimeout(timer)
  }, [])

  return minute
}

/**
 * A coarse bucket of the current time, for query dependencies.
 *
 * Free time shrinks as the day passes, so `dayLoad` has to be re-read periodically — but
 * not sixty times an hour. Bucketing to five minutes means the query re-runs twelve times
 * an hour and the number on screen is never more than five minutes stale.
 */
export function useClockBucket(minutes = 5): number {
  const minute = useNowMinute()
  return Math.floor(minute / minutes)
}
