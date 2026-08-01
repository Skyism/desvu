import { useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/Button'
import { Dialog } from '@/components/Dialog'
import { Input, Select, Textarea } from '@/components/Input'

/**
 * Sentinel for the "A new topic" option. A topic is a folder name and the sort skill
 * refuses any containing `/` or a leading `.`, so a leading `::` cannot collide with a
 * real one. `NewThreadDialog` also filters it out of the topic list defensively.
 */
const NEW_TOPIC = '::new'

export interface NewThreadDialogProps {
  open: boolean
  onClose: () => void
  /** Existing folders under `Brain Dump/`. */
  topics: string[]
  /** Preselect the topic the user was already reading in. */
  initialTopic?: string | null
  onCreate: (topic: string, title: string, text: string) => Promise<void>
}

/**
 * Starting a thread.
 *
 * Topics are **freely creatable** (PRD §9 — the sort skill invents them as it goes), so
 * the picker is not a closed set: "A new topic…" reveals a free text field. A topic is
 * only ever a folder name, and the app must not be the thing that makes the taxonomy
 * narrower than the skill's.
 */
export function NewThreadDialog({
  open,
  onClose,
  topics: allTopics,
  initialTopic,
  onCreate,
}: NewThreadDialogProps): React.JSX.Element {
  // Memoised: this feeds a `useEffect` dependency list, and a fresh array every render
  // would reset the form on every keystroke.
  const topics = useMemo(() => allTopics.filter((name) => name !== NEW_TOPIC), [allTopics])
  const [choice, setChoice] = useState('')
  const [newTopic, setNewTopic] = useState('')
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setChoice(initialTopic && topics.includes(initialTopic) ? initialTopic : (topics[0] ?? NEW_TOPIC))
    setNewTopic('')
    setTitle('')
    setText('')
    setProblem(null)
  }, [open, initialTopic, topics])

  const topic = choice === NEW_TOPIC ? newTopic.trim() : choice
  const ready = topic !== '' && title.trim() !== '' && text.trim() !== ''

  const submit = async (): Promise<void> => {
    if (!ready || busy) return
    setBusy(true)
    setProblem(null)
    try {
      await onCreate(topic, title.trim(), text.trim())
      onClose()
    } catch (thrown) {
      setProblem(
        thrown instanceof Error ? thrown.message : 'The thread could not be written just now.'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Start a thread"
      description="One subject, added to over time. Later thoughts join this file rather than making a new one."
      size="md"
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" loading={busy} disabled={!ready} onClick={() => void submit()}>
            Start thread
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row">
          <Select
            label="Topic"
            className="sm:w-[220px]"
            value={choice}
            onChange={(event) => setChoice(event.target.value)}
          >
            {topics.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
            <option value={NEW_TOPIC}>A new topic…</option>
          </Select>

          {choice === NEW_TOPIC && (
            <Input
              label="New topic"
              className="flex-1"
              value={newTopic}
              placeholder="Reading, Health, 15-440…"
              hint="Becomes a folder under Brain Dump."
              onChange={(event) => setNewTopic(event.target.value)}
            />
          )}
        </div>

        <Input
          label="What is this thread about"
          value={title}
          placeholder="Systems design interviews"
          onChange={(event) => setTitle(event.target.value)}
        />

        <Textarea
          label="First thought"
          value={text}
          rows={5}
          placeholder="Write it the way you'd say it. Link to anything with [[double brackets]]."
          error={problem}
          onChange={(event) => setText(event.target.value)}
        />
      </div>
    </Dialog>
  )
}
