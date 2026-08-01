import type {
  DateString,
  JournalEntry,
  JournalMetadata,
  Rating,
  StreakInfo,
  UpsertJournalInput,
} from '@shared/types'
import { dataPath } from '@shared/vault'
import { addDays, todayString } from '../lib/dates'
import { NotFoundError } from '../lib/errors'
import { newId } from '../lib/ids'
import { createJsonStore, expectArray, expectObject } from '../lib/json-store'
import { Issues, checkDate, checkRating } from '../lib/validate'
import { settingsRepository } from './settingsRepository'

const store = createJsonStore<JournalEntry[]>(
  () => dataPath('journal.json'),
  () => [],
  (parsed, filePath) => expectArray<JournalEntry>(parsed, filePath)
)

/**
 * The longest streak is *banked* (PRD J6) — an achievement that cannot be taken away.
 * Recomputing it from history alone would let a deleted entry shorten it, so the high
 * water mark is persisted separately and only ever moves up.
 */
const bank = createJsonStore<{ longest?: number }>(
  () => dataPath('journal-streak.json'),
  () => ({}),
  (parsed, filePath) => expectObject<{ longest?: number }>(parsed, filePath)
)

function normalize(raw: Partial<JournalEntry>): JournalEntry {
  const created = typeof raw.created_at === 'number' ? raw.created_at : Date.now()
  const entry: JournalEntry = {
    id: typeof raw.id === 'string' && raw.id !== '' ? raw.id : newId(),
    entry_date: typeof raw.entry_date === 'string' ? raw.entry_date : todayString(),
    rating: (typeof raw.rating === 'number' ? raw.rating : 4) as Rating,
    created_at: created,
    updated_at: typeof raw.updated_at === 'number' ? raw.updated_at : created,
  }

  // Optional prose is copied only when it is actually there — an entry that is a bare
  // rating must not gain four empty strings on the way through (PRD J0).
  if (typeof raw.gratitude_text === 'string') entry.gratitude_text = raw.gratitude_text
  if (typeof raw.learned === 'string') entry.learned = raw.learned
  if (typeof raw.mood_word === 'string') entry.mood_word = raw.mood_word
  if (typeof raw.mood_context === 'string') entry.mood_context = raw.mood_context

  return entry
}

function sortEntries(entries: JournalEntry[]): JournalEntry[] {
  return [...entries].sort((a, b) => b.entry_date.localeCompare(a.entry_date))
}

async function readAll(): Promise<JournalEntry[]> {
  return (await store.read()).map(normalize)
}

/** Longest run of consecutive days anywhere in the record. */
function longestRun(dates: Set<string>): number {
  let longest = 0
  for (const date of dates) {
    // Only start counting from the first day of a run, so this stays linear.
    if (dates.has(addDays(date, -1))) continue
    let length = 1
    let cursor = addDays(date, 1)
    while (dates.has(cursor)) {
      length += 1
      cursor = addDays(cursor, 1)
    }
    longest = Math.max(longest, length)
  }
  return longest
}

/**
 * Consecutive days ending **today or yesterday**.
 *
 * Yesterday counts because a day is not lost until it is actually over — at 9am the
 * streak from last night is still running, and telling the user otherwise is exactly the
 * message J6 exists to prevent. When neither day has an entry this returns 0, which the
 * UI renders as *nothing at all*, never as "0 days" or a broken streak.
 */
function currentRun(dates: Set<string>, today: DateString): number {
  const start = dates.has(today) ? today : dates.has(addDays(today, -1)) ? addDays(today, -1) : null
  if (start === null) return 0

  let length = 0
  let cursor = start
  while (dates.has(cursor)) {
    length += 1
    cursor = addDays(cursor, -1)
  }
  return length
}

export const journalRepository = {
  async list(): Promise<JournalEntry[]> {
    return sortEntries(await readAll())
  },

  async byDate(date: DateString): Promise<JournalEntry | null> {
    const entries = await readAll()
    return entries.find((entry) => entry.entry_date === date) ?? null
  },

  /**
   * One entry per day. Writing the same day twice edits it rather than failing — the
   * original repository threw here, which is the wrong behaviour for a form the user
   * reopens to add a mood word to a rating they logged at breakfast.
   *
   * Only `entry_date` and `rating` are required (PRD J0).
   */
  async upsert(input: UpsertJournalInput): Promise<JournalEntry> {
    const issues = new Issues()
    checkDate(issues, 'entry_date', input.entry_date)
    checkRating(issues, 'rating', input.rating)
    for (const field of ['gratitude_text', 'learned', 'mood_word', 'mood_context'] as const) {
      const value = input[field]
      if (value !== undefined && value !== null && typeof value !== 'string') {
        issues.add(`${field} must be text`)
      }
    }
    issues.throwIfAny()

    const now = Date.now()

    return store.mutate((current) => {
      const entries = current.map(normalize)
      const index = entries.findIndex((entry) => entry.entry_date === input.entry_date)

      const optional: Partial<JournalEntry> = {}
      for (const field of ['gratitude_text', 'learned', 'mood_word', 'mood_context'] as const) {
        const value = input[field]
        if (value !== undefined && value !== null) optional[field] = value.trim()
      }

      if (index === -1) {
        const entry: JournalEntry = {
          id: newId(),
          entry_date: input.entry_date,
          rating: input.rating,
          ...optional,
          created_at: now,
          updated_at: now,
        }
        entries.push(entry)
        return { data: entries, result: entry }
      }

      const existing = entries[index] as JournalEntry
      const updated: JournalEntry = {
        ...existing,
        ...optional,
        rating: input.rating,
        updated_at: now,
      }
      entries[index] = updated
      return { data: entries, result: updated }
    })
  },

  async remove(id: string): Promise<void> {
    await store.mutate((current) => {
      const entries = current.map(normalize)
      const index = entries.findIndex((entry) => entry.id === id)
      if (index === -1) throw new NotFoundError(`No journal entry with id ${id}`)
      entries.splice(index, 1)
      return { data: entries, result: undefined }
    })
  },

  /**
   * PRD J6. There is no `broken` field and none can be derived: `current` counting 0 is
   * indistinguishable from "not currently running", `longest` never decreases, and
   * nothing here reports a gap, a last-entry date, or a days-since count that a UI could
   * turn into guilt.
   */
  async streak(now: Date = new Date()): Promise<StreakInfo> {
    const entries = await readAll()
    const dates = new Set(entries.map((entry) => entry.entry_date))
    const today = todayString(now)

    const computedLongest = longestRun(dates)
    const current = currentRun(dates, today)

    const banked = await bank.read()
    const storedLongest = typeof banked.longest === 'number' ? banked.longest : 0
    const longest = Math.max(storedLongest, computedLongest, current)

    if (longest > storedLongest) {
      await bank
        .mutate(() => ({ data: { longest }, result: longest }))
        .catch(() => undefined)
    }

    return { current, longest, total: dates.size }
  },

  /**
   * The J8 projection. `synthesis.journal_access: "metadata"` is enforced *here*, in the
   * repository, rather than by a line in a prompt — a model can be argued past an
   * instruction, but it cannot be argued past prose it was never handed.
   */
  async readForAgent(): Promise<JournalEntry[] | JournalMetadata[]> {
    const settings = await settingsRepository.get()
    const entries = sortEntries(await readAll())

    if (settings.synthesis.journal_access === 'metadata') {
      return entries.map((entry) => {
        const projected: JournalMetadata = {
          entry_date: entry.entry_date,
          rating: entry.rating,
        }
        if (entry.mood_word !== undefined) projected.mood_word = entry.mood_word
        return projected
      })
    }

    return entries
  },
}

export type JournalRepository = typeof journalRepository
