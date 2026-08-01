import type { ReactNode } from 'react'

import { Input, Textarea } from '@/components/Input'
import { PROMPTS, type Draft, type ProseField } from './journal-model'

export interface PromptFieldsProps {
  draft: Draft
  onChange: (field: ProseField, value: string) => void
  disabled?: boolean
}

/**
 * PRD J3 — the four prompts, in the order the PRD lists them, every one optional.
 *
 * They are questions rather than field labels, so they are set in Cormorant, the
 * reflection face, instead of the uppercase DM Sans eyebrow `Field` uses for tools.
 * `text-transform` and `letter-spacing` are inherited properties, so overriding them on a
 * child of the label is enough to reach through the shared primitive without restyling it.
 *
 * Nothing here is marked required and nothing here is validated. The point of the
 * disclosure above is that the user has already done enough.
 */
export function PromptFields({
  draft,
  onChange,
  disabled = false,
}: PromptFieldsProps): React.JSX.Element {
  return (
    <>
      {PROMPTS.map((prompt) => {
        const shared = {
          label: <Question>{prompt.question}</Question>,
          placeholder: prompt.placeholder,
          value: draft[prompt.field],
          disabled,
        }
        return prompt.kind === 'line' ? (
          <Input
            key={prompt.field}
            {...shared}
            onChange={(event) => onChange(prompt.field, event.target.value)}
          />
        ) : (
          <Textarea
            key={prompt.field}
            {...shared}
            rows={3}
            onChange={(event) => onChange(prompt.field, event.target.value)}
          />
        )
      })}
    </>
  )
}

function Question({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <span className="font-display text-md text-ink2 tracking-normal normal-case">{children}</span>
  )
}
