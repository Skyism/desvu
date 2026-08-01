import { useMemo, type ReactNode } from 'react'

import { cn } from '@/lib/cn'
import { parseNote, type Block, type Inline } from './parse'
import { ExternalLink, WikiLink } from './NoteLink'

/**
 * `prose`   — Cormorant at reading size. Thread bodies and the weekly write-up.
 * `compact` — DM Sans, small. Previews and anywhere the note is an ingredient, not the point.
 */
export type MarkdownVariant = 'prose' | 'compact'

export interface MarkdownProps {
  source: string
  variant?: MarkdownVariant
  /**
   * Render `## YYYY-MM-DD` as a dated divider rather than a heading. That heading IS the
   * structure of a brain dump thread (`data/SCHEMAS.md`), and showing it as a date makes
   * the file read as one running document instead of a stack of h2s.
   */
  dayHeadings?: boolean
  /** Drop a leading `# Heading` that only repeats a title already on screen. */
  omitTitle?: string
  className?: string
}

const DAY_HEADING = /^\d{4}-\d{2}-\d{2}$/

const LONG_DATE = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/** `2026-07-14` → `Tuesday · 14 July 2026`. Parsed as local, never through `Date.parse`. */
function formatDayHeading(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  const date = new Date(year, month - 1, day)
  if (Number.isNaN(date.getTime())) return value
  const parts = LONG_DATE.formatToParts(date)
  const weekday = parts.find((part) => part.type === 'weekday')?.value ?? ''
  const rest = parts
    .filter((part) => part.type !== 'weekday' && part.type !== 'literal')
    .map((part) => part.value)
  return `${weekday} · ${rest[0]} ${rest[1]} ${rest[2]}`
}

export function Markdown({
  source,
  variant = 'prose',
  dayHeadings = false,
  omitTitle,
  className,
}: MarkdownProps): React.JSX.Element | null {
  const blocks = useMemo(() => {
    const parsed = parseNote(source)
    const first = parsed[0]
    if (
      omitTitle &&
      first &&
      first.type === 'heading' &&
      first.level === 1 &&
      first.text.trim().toLowerCase() === omitTitle.trim().toLowerCase()
    ) {
      return parsed.slice(1)
    }
    return parsed
  }, [source, omitTitle])

  if (blocks.length === 0) return null

  return (
    <div className={cn('min-w-0', variant === 'prose' ? 'space-y-5' : 'space-y-3', className)}>
      <BlockList blocks={blocks} variant={variant} dayHeadings={dayHeadings} />
    </div>
  )
}

function BlockList({
  blocks,
  variant,
  dayHeadings,
}: {
  blocks: Block[]
  variant: MarkdownVariant
  dayHeadings: boolean
}): React.JSX.Element {
  return (
    <>
      {blocks.map((block, index) => (
        <BlockView key={index} block={block} variant={variant} dayHeadings={dayHeadings} />
      ))}
    </>
  )
}

const PARAGRAPH: Record<MarkdownVariant, string> = {
  prose: 'font-serif text-entry text-lg leading-[1.62]',
  compact: 'font-sans text-ink2 text-sm leading-[1.55]',
}

const HEADING_CLASS: Record<number, string> = {
  1: 'font-display text-hero font-normal tracking-display',
  2: 'font-display text-title font-normal',
  3: 'font-display text-xl font-normal',
  4: 'font-sans text-label tracking-label text-muted uppercase',
  5: 'font-sans text-label tracking-label text-muted uppercase',
  6: 'font-sans text-label tracking-label text-muted uppercase',
}

function BlockView({
  block,
  variant,
  dayHeadings,
}: {
  block: Block
  variant: MarkdownVariant
  dayHeadings: boolean
}): React.JSX.Element | null {
  switch (block.type) {
    case 'heading': {
      if (dayHeadings && block.level === 2 && DAY_HEADING.test(block.text.trim())) {
        return <DayDivider date={block.text.trim()} />
      }
      const Tag = `h${Math.min(block.level + 1, 6)}` as 'h2'
      return (
        <Tag className={cn('pt-2', HEADING_CLASS[block.level] ?? HEADING_CLASS[3])}>
          <InlineList nodes={block.children} />
        </Tag>
      )
    }

    case 'paragraph':
      return (
        <p className={PARAGRAPH[variant]}>
          <InlineList nodes={block.children} />
        </p>
      )

    case 'list':
      return (
        <ul
          className={cn(
            'flex min-w-0 flex-col',
            block.tight ? 'gap-1.5' : 'gap-3',
            variant === 'prose' ? 'font-serif text-entry text-lg leading-[1.55]' : 'font-sans text-ink2 text-sm'
          )}
        >
          {block.items.map((item, index) => (
            <li key={index} className="flex min-w-0 items-baseline gap-3">
              <Marker
                ordered={block.ordered}
                number={block.start + index}
                checked={item.checked}
                variant={variant}
              />
              <div className="min-w-0 flex-1 space-y-2">
                <BlockList blocks={item.children} variant={variant} dayHeadings={false} />
              </div>
            </li>
          ))}
        </ul>
      )

    case 'quote':
      return (
        <blockquote className="border-accent-border border-l-2 pl-5">
          <div
            className={cn(
              'space-y-3',
              variant === 'prose' ? 'font-serif text-ink2 text-lg leading-[1.6] italic' : 'font-sans text-ink2 text-sm italic'
            )}
          >
            <BlockList blocks={block.children} variant={variant} dayHeadings={false} />
          </div>
        </blockquote>
      )

    case 'code':
      return (
        <pre className="bg-fill rounded-block text-ink2 overflow-x-auto px-4 py-3.5 font-mono text-xs leading-[1.6]">
          <code>{block.value}</code>
        </pre>
      )

    case 'hr':
      return <hr className="border-rule border-t" />

    case 'table':
      return (
        <div className="border-line rounded-block overflow-x-auto border">
          {/* Tables are data, so they stay in DM Sans even inside a prose note. */}
          <table className="w-full border-collapse font-sans text-sm">
            <thead>
              <tr>
                {block.header.map((cell, index) => (
                  <th
                    key={index}
                    className="border-rule text-label tracking-label text-muted border-b px-3.5 py-2.5 text-left uppercase"
                    style={{ textAlign: block.align[index] ?? 'left' }}
                  >
                    <InlineList nodes={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className="border-rule text-ink2 border-t px-3.5 py-2.5 align-top"
                      style={{ textAlign: block.align[cellIndex] ?? 'left' }}
                    >
                      <InlineList nodes={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )

    default:
      return null
  }
}

function DayDivider({ date }: { date: string }): React.JSX.Element {
  return (
    <div className="flex items-center gap-4 pt-4 first:pt-0">
      <time
        dateTime={date}
        className="text-label tracking-label text-muted flex-none font-sans uppercase"
      >
        {formatDayHeading(date)}
      </time>
      <span aria-hidden className="bg-rule h-px flex-1" />
    </div>
  )
}

function Marker({
  ordered,
  number,
  checked,
  variant,
}: {
  ordered: boolean
  number: number
  checked: boolean | null
  variant: MarkdownVariant
}): React.JSX.Element {
  if (checked !== null) {
    return (
      <span
        aria-hidden
        className={cn(
          'rounded-check mt-[3px] flex h-3.5 w-3.5 flex-none items-center justify-center border text-[9px]',
          checked ? 'border-accent bg-accent text-on-accent' : 'border-chk'
        )}
      >
        {checked ? '✓' : ''}
      </span>
    )
  }

  if (ordered) {
    return (
      <span className="text-muted flex-none font-sans text-xs tabular-nums">{number}.</span>
    )
  }

  return (
    <span
      aria-hidden
      className={cn(
        'bg-faint rounded-pill flex-none',
        variant === 'prose' ? 'mt-2.5 h-1 w-1' : 'mt-2 h-1 w-1'
      )}
    />
  )
}

function InlineList({ nodes }: { nodes: Inline[] }): React.JSX.Element {
  return (
    <>
      {nodes.map((node, index) => (
        <InlineView key={index} node={node} />
      ))}
    </>
  )
}

function InlineView({ node }: { node: Inline }): ReactNode {
  switch (node.type) {
    case 'text':
      return node.value
    case 'strong':
      return (
        <strong className="font-semibold">
          <InlineList nodes={node.children} />
        </strong>
      )
    case 'em':
      // Italic is always Cormorant — DM Sans has no italic cut in this app.
      return (
        <em className="font-serif italic">
          <InlineList nodes={node.children} />
        </em>
      )
    case 'del':
      return (
        <span className="text-muted line-through">
          <InlineList nodes={node.children} />
        </span>
      )
    case 'mark':
      return (
        <mark className="bg-soft text-ink rounded-[3px] px-1">
          <InlineList nodes={node.children} />
        </mark>
      )
    case 'code':
      return (
        <code className="bg-fill rounded-cell text-ink2 px-1.5 py-0.5 font-mono text-[0.82em]">
          {node.value}
        </code>
      )
    case 'link':
      return (
        <ExternalLink href={node.href}>
          <InlineList nodes={node.children} />
        </ExternalLink>
      )
    case 'wikilink':
      return (
        <WikiLink
          target={node.target}
          heading={node.heading}
          alias={node.alias}
          embed={node.embed}
        />
      )
    default:
      return null
  }
}
