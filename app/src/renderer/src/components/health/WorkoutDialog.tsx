import { useEffect, useState } from 'react'
import type { Workout, WorkoutType } from '@shared/types'

import { Button } from '@/components/Button'
import { Dialog } from '@/components/Dialog'
import { Input, Select, Textarea } from '@/components/Input'
import { readableMessage } from '@/lib/bridge'
import { editWorkout, logWorkout, removeWorkout } from '@/store/health'
import { parseOptionalNumber, toDateString, WORKOUT_TYPES, WORKOUT_TYPE_LABEL } from './nutrition'

export interface WorkoutDialogProps {
  open: boolean
  onClose: () => void
  workout?: Workout | null
  onSaved?: (message: string) => void
}

/**
 * Log or edit a workout: free text, a type, and an optional duration.
 *
 * Duration is genuinely optional — "climbed for a bit" with no minutes is a complete
 * entry, and a workout with no duration is simply drawn without one rather than with a
 * placeholder implying something was skipped.
 */
export function WorkoutDialog({
  open,
  onClose,
  workout = null,
  onSaved,
}: WorkoutDialogProps): React.JSX.Element {
  const [description, setDescription] = useState('')
  const [type, setType] = useState<WorkoutType>('lift')
  const [date, setDate] = useState(toDateString(new Date()))
  const [duration, setDuration] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setDescription(workout?.description ?? '')
    setType(workout?.type ?? 'lift')
    setDate(workout?.date ?? toDateString(new Date()))
    setDuration(workout?.duration_minutes != null ? String(workout.duration_minutes) : '')
    setError(null)
    setSaving(false)
  }, [open, workout])

  const save = async (): Promise<void> => {
    const parsed = parseOptionalNumber(duration)
    if (!parsed.ok) {
      setError('Duration should be a number of minutes — or left blank.')
      return
    }
    if (description.trim() === '') {
      setError('A few words about what you did is enough.')
      return
    }

    setSaving(true)
    try {
      const draft = { date, type, description, duration_minutes: parsed.value }
      if (workout) {
        await editWorkout(workout.id, draft)
        onSaved?.('Workout updated.')
      } else {
        await logWorkout(draft)
        onSaved?.('Workout logged.')
      }
      onClose()
    } catch (thrown) {
      setError(readableMessage(thrown))
      setSaving(false)
    }
  }

  const discard = async (): Promise<void> => {
    if (!workout) return
    setSaving(true)
    try {
      await removeWorkout(workout.id)
      onSaved?.('Workout removed.')
      onClose()
    } catch (thrown) {
      setError(readableMessage(thrown))
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title={workout ? 'Edit workout' : 'Log a workout'}
      description={workout ? undefined : 'A duration is optional.'}
      footer={
        <>
          {workout && (
            <Button variant="destructive" size="sm" onClick={() => void discard()} disabled={saving}>
              Delete
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={saving}>
            {workout ? 'Save' : 'Log it'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Textarea
          label="What you did"
          rows={2}
          autoFocus
          placeholder="push day — bench 3x8 @155, ohp, dips"
          value={description}
          error={error ?? undefined}
          onChange={(event) => {
            setDescription(event.target.value)
            setError(null)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              void save()
            }
          }}
        />

        <div className="flex gap-3">
          <Select
            label="Type"
            className="flex-1"
            value={type}
            onChange={(event) => setType(event.target.value as WorkoutType)}
          >
            {WORKOUT_TYPES.map((option) => (
              <option key={option} value={option}>
                {WORKOUT_TYPE_LABEL[option]}
              </option>
            ))}
          </Select>
          <Input
            label="Minutes"
            className="flex-1"
            inputMode="numeric"
            placeholder="optional"
            value={duration}
            onChange={(event) => {
              setDuration(event.target.value)
              setError(null)
            }}
          />
        </div>

        <Input
          label="Date"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </div>
    </Dialog>
  )
}
