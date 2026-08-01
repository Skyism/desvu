import { useEffect, useState } from 'react'
import type { Settings } from '@shared/types'

import { Button } from '@/components/Button'
import { Checkbox } from '@/components/Checkbox'
import { Dialog } from '@/components/Dialog'
import { Input } from '@/components/Input'
import { readableMessage } from '@/lib/bridge'
import { saveNutritionTargets } from '@/store/health'
import { parseOptionalNumber } from './nutrition'

export interface TargetsDialogProps {
  open: boolean
  onClose: () => void
  settings: Settings | null
  onSaved?: (message: string) => void
}

/**
 * Nutrition targets — opt-in, off by default, and reversible.
 *
 * `settings.nutrition.show_targets` is false in `DEFAULT_SETTINGS`, and both targets are
 * null. Until the user comes here and turns them on, the meals surface has no target
 * line, no percentage, and no way to read as falling short. It logs and shows trends.
 *
 * Turning targets back off leaves the numbers on disk, so switching them on again does
 * not mean retyping. Clearing a field sets it to null, which is also a real state: you
 * can watch calories against a target while leaving protein alone.
 */
export function TargetsDialog({
  open,
  onClose,
  settings,
  onSaved,
}: TargetsDialogProps): React.JSX.Element {
  const [show, setShow] = useState(false)
  const [calories, setCalories] = useState('')
  const [protein, setProtein] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setShow(settings?.nutrition.show_targets ?? false)
    setCalories(
      settings?.nutrition.calorie_target != null ? String(settings.nutrition.calorie_target) : ''
    )
    setProtein(
      settings?.nutrition.protein_target_g != null
        ? String(settings.nutrition.protein_target_g)
        : ''
    )
    setError(null)
    setSaving(false)
  }, [open, settings])

  const save = async (): Promise<void> => {
    const parsedCalories = parseOptionalNumber(calories)
    const parsedProtein = parseOptionalNumber(protein)
    if (!parsedCalories.ok || !parsedProtein.ok) {
      setError('Targets should be plain numbers — or left blank for no target.')
      return
    }

    setSaving(true)
    try {
      await saveNutritionTargets({
        calorie_target: parsedCalories.value,
        protein_target_g: parsedProtein.value,
        show_targets: show,
      })
      onSaved?.(show ? 'Targets on.' : 'Targets off — just logging.')
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
      title="Targets"
      description="Off by default. With them off the app just logs what you ate and shows the trend."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={saving}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Checkbox
          checked={show}
          onChange={(event) => setShow(event.target.checked)}
          label={<span className="text-sm">Show targets on the meals surface</span>}
        />

        <div className="flex gap-3">
          <Input
            label="Calories"
            className="flex-1"
            inputMode="numeric"
            placeholder="no target"
            disabled={!show}
            value={calories}
            onChange={(event) => {
              setCalories(event.target.value)
              setError(null)
            }}
          />
          <Input
            label="Protein (g)"
            className="flex-1"
            inputMode="numeric"
            placeholder="no target"
            disabled={!show}
            value={protein}
            onChange={(event) => {
              setProtein(event.target.value)
              setError(null)
            }}
          />
        </div>

        {error && <p className="text-accent-text text-xs">{error}</p>}

        <p className="text-muted text-xs">
          A blank field means no target for that number. Nothing here is ever a code
          change — it all lives in <code className="font-mono text-[11px]">settings.json</code>.
        </p>
      </div>
    </Dialog>
  )
}
