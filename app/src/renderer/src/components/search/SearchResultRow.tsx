import type { SearchHit } from '@shared/types'

import { cn } from '@/lib/cn'
import { KIND_LABEL, highlightSegments, primaryAction, snippetContext } from './search'

export interface SearchResultRowProps {
  hit: SearchHit
  terms: readonly string[]
  selected: boolean
  onActivate: () => void
  onHover: () => void
}

/** The matched run, in gold on the accent fill. Never a highlighter yellow. */
function Highlighted({
  text,
  terms,
  className,
}: {
  text: string
  terms: readonly string[]
  className?: string
}): React.JSX.Element {
  const segments = highlightSegments(text, terms)
  return (
    <span className={className}>
      {segments.map((segment, index) =>
        segment.match ? (
          <mark key={index} className="bg-soft text-accent-text rounded-marker px-[1px]">
            {segment.text}
          </mark>
        ) : (
          <span key={index}>{segment.text}</span>
        )
      )}
    </span>
  )
}

/**
 * One hit. The title, the match in its surrounding sentence, and — on the selected row —
 * what Enter is about to do, so the keyboard path is never a guess.
 */
export function SearchResultRow({
  hit,
  terms,
  selected,
  onActivate,
  onHover,
}: SearchResultRowProps): React.JSX.Element {
  const action = primaryAction(hit)
  const context = snippetContext(hit.title, hit.snippet)

  return (
    <li>
      <button
        type="button"
        role="option"
        aria-selected={selected}
        data-selected={selected || undefined}
        onClick={onActivate}
        onMouseMove={onHover}
        className={cn(
          'transition-quiet rounded-field flex w-full flex-col gap-1 border px-3.5 py-2.5 text-left',
          selected ? 'bg-card border-accent-border' : 'hover:bg-hover border-transparent'
        )}
      >
        <div className="flex w-full items-baseline justify-between gap-4">
          <Highlighted
            text={hit.title}
            terms={terms}
            className="text-ink min-w-0 flex-1 truncate text-sm"
          />
          {hit.date != null && (
            <span className="text-muted flex-none text-xs" data-numeric>
              {hit.date}
            </span>
          )}
        </div>

        {context !== null && (
          <Highlighted
            text={context}
            terms={terms}
            className="text-ink2 line-clamp-2 text-xs leading-relaxed"
          />
        )}

        <div className="flex w-full items-baseline justify-between gap-4">
          <span className="text-muted min-w-0 truncate text-micro">
            {hit.path ?? KIND_LABEL[hit.kind]}
          </span>
          {selected && (
            <span className="text-accent-text flex-none text-micro whitespace-nowrap">
              ↵ {action.label}
            </span>
          )}
        </div>
      </button>
    </li>
  )
}
