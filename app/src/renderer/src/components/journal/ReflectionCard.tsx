import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { DateString, JournalEntry, Rating } from '@shared/types'

import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { Skeleton } from '@/components/Skeleton'
import { readableMessage } from '@/lib/bridge'
import { saveJournalEntry } from './journal-data'
import {
  DISCLOSURE_CLOSED,
  DISCLOSURE_OPEN,
  draftFromEntry,
  draftProseChanged,
  draftToInput,
  emptyDraft,
  hasProse,
  reflectionInvitation,
  reflectionTitle,
  type Draft,
  type ProseField,
} from './journal-model'
import { PromptFields } from './PromptFields'
import { RatingRow } from './RatingRow'

export interface ReflectionCardProps {
  date: DateString
  today: DateString
  /**
   * `undefined` means the read for **this exact date** has not landed yet. `null` means it
   * landed and the day is blank. The distinction is what stops the form hydrating from the
   * previously selected day while a new fetch is in flight.
   */
  entry: JournalEntry | null | undefined
  error?: Error | null
  onBackToToday: () => void
  /** The thirty-day grid, which the comp draws inside this same card. */
  children?: ReactNode
}

/**
 * The "Tonight" card from the approved comp, made real.
 *
 * **PRD J2/J0 — the form opens as the rating row and nothing else.** Choosing a number
 * writes the day immediately; there is no Save button standing between a five-second
 * entry and being finished. The four prompts are behind a disclosure whose copy is doing
 * product work: *"Say a little more ↓"* invites, and *"Just the number is fine ↑"* grants
 * permission to stop. Neither reads as an unfinished form.
 *
 * **Reopening a day is a first-class path.** 16 of the 83 real entries were revised after
 * they were written, and 50 were written up days after the fact — so the same card edits
 * an existing day as naturally as it creates one, and a day that already has writing in it
 * opens with that writing visible rather than hidden behind the disclosure.
 *
 * Nothing here can report failure at the user. A save that does not land says what
 * survived; a day with no entry says nothing at all.
 */
export function ReflectionCard({
  date,
  today,
  entry,
  error = null,
  onBackToToday,
  children,
}: ReflectionCardProps): React.JSX.Element {
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(date))
  const [promptsOpen, setPromptsOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const loading = entry === undefined
  const loaded = entry ?? null

  /**
   * Hydrate once per date. After that the draft belongs to the user: a background refetch
   * (the vault watcher fires on any file change) must never overwrite half-typed prose.
   */
  const hydratedFor = useRef<DateString | null>(null)
  useEffect(() => {
    if (entry === undefined || hydratedFor.current === date) return
    hydratedFor.current = date
    setDraft(draftFromEntry(date, entry))
    // A day that already says something opens saying it. J2's "rating only" is about not
    // demanding more, not about hiding what is already there.
    setPromptsOpen(entry !== null && hasProse(entry))
    setStatus(null)
  }, [date, entry])

  const persist = useCallback(
    async (next: Draft): Promise<void> => {
      const input = draftToInput(next, loaded)
      if (!input) return
      setSaving(true)
      try {
        await saveJournalEntry(input)
        setStatus('Saved')
      } catch (thrown) {
        // Quiet and truthful. Never red, never the word "Error", and it says what is
        // still true — the words are still in the box.
        setStatus(`Couldn't reach the vault — ${readableMessage(thrown)} Your words are still here.`)
      } finally {
        setSaving(false)
      }
    },
    [loaded]
  )

  const selectRating = (rating: Rating): void => {
    const next = { ...draft, rating }
    setDraft(next)
    void persist(next)
  }

  const setField = (field: ProseField, value: string): void => {
    setDraft((current) => ({ ...current, [field]: value }))
    setStatus(null)
  }

  const proseDirty = draftProseChanged(draft, loaded)
  const canSaveProse = draft.rating !== null && proseDirty

  const isToday = date === today
  const meta = loading ? undefined : saving ? 'Saving…' : (status ?? undefined)

  return (
    <Card
      variant="raised"
      title={reflectionTitle(date, today)}
      meta={meta}
      actions={
        isToday ? undefined : (
          <Button size="sm" variant="ghost" onClick={onBackToToday}>
            Back to tonight
          </Button>
        )
      }
    >
      <p className="text-ink2 mb-[18px] text-sm">{reflectionInvitation(date, today)}</p>

      {loading ? (
        <Skeleton height={46} radius="control" />
      ) : (
        // Keyed on the date so a stale roving-tabindex focus never survives into another
        // day's form.
        <RatingRow
          key={date}
          value={draft.rating}
          onSelect={selectRating}
          label="How was the day, 1 to 7"
        />
      )}

      {error && (
        <p className="text-muted mt-3 text-xs">
          Tonight&apos;s entry couldn&apos;t be read just now. Nothing is lost — try again in
          a moment.
        </p>
      )}

      <button
        type="button"
        aria-expanded={promptsOpen}
        aria-controls={`journal-prompts-${date}`}
        onClick={() => setPromptsOpen((open) => !open)}
        className="text-accent-text transition-quiet hover:text-ink mt-4 text-sm"
      >
        {promptsOpen ? DISCLOSURE_CLOSED : DISCLOSURE_OPEN}
      </button>

      {promptsOpen && (
        <div id={`journal-prompts-${date}`} className="mt-3.5 flex flex-col gap-3.5">
          <PromptFields draft={draft} onChange={setField} />

          <div className="mt-1 flex items-center gap-3">
            <Button
              size="sm"
              variant="soft"
              disabled={!canSaveProse}
              loading={saving}
              onClick={() => void persist(draft)}
            >
              Save
            </Button>
            {draft.rating === null && (
              // Information, in gold, exactly as `Field` renders a validation note.
              <span className="text-accent-text text-xs">
                Pick a number above and this saves with it.
              </span>
            )}
            {draft.rating !== null && !proseDirty && (
              <span className="text-muted text-xs">Everything here is optional.</span>
            )}
          </div>
        </div>
      )}

      {children}
    </Card>
  )
}
