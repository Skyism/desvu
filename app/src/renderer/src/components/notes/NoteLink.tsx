import { createContext, useContext, useMemo, type ReactNode } from 'react'

import { cn } from '@/lib/cn'
import {
  attachmentPath,
  EMPTY_NOTE_INDEX,
  isAttachmentTarget,
  resolveWikilink,
  wikilinkLabel,
  type NoteIndex,
  type NoteRef,
} from './wikilinks'

interface NoteLinkContextValue {
  index: NoteIndex
  /** Follow a link to a note that exists. */
  openNote: (ref: NoteRef) => void
  /** Follow a link to a file that is not a note — an attachment, usually. */
  openPath: (vaultRelativePath: string) => void
  /**
   * The tooltip for a resolved link.
   *
   * This lives with `openNote` and not inside `<WikiLink>` on purpose: only the surface
   * knows where its own `openNote` goes. Synthesis reads a cited week in place while Brain
   * dump hands the same note to Obsidian, so a tooltip derived from `ref.kind` alone would
   * promise the wrong thing on one of them.
   */
  describeNote: (ref: NoteRef) => string
}

const openInObsidian = (ref: NoteRef): string => `Open ${ref.path} in Obsidian`

const NoteLinkContext = createContext<NoteLinkContextValue>({
  index: EMPTY_NOTE_INDEX,
  openNote: () => {},
  openPath: () => {},
  describeNote: openInObsidian,
})

export function NoteLinkProvider({
  index,
  openNote,
  openPath,
  describeNote = openInObsidian,
  children,
}: Omit<NoteLinkContextValue, 'describeNote'> & {
  describeNote?: (ref: NoteRef) => string
  children: ReactNode
}): React.JSX.Element {
  const value = useMemo(
    () => ({ index, openNote, openPath, describeNote }),
    [index, openNote, openPath, describeNote]
  )
  return <NoteLinkContext.Provider value={value}>{children}</NoteLinkContext.Provider>
}

export function useNoteLinks(): NoteLinkContextValue {
  return useContext(NoteLinkContext)
}

export interface WikiLinkProps {
  target: string
  heading: string | null
  alias: string | null
  embed: boolean
}

const RESOLVED_CLASS = cn(
  'transition-quiet text-accent-text decoration-accent-border underline underline-offset-[3px]',
  'hover:decoration-accent rounded-[3px] text-left'
)

/**
 * A `[[wikilink]]`.
 *
 * Resolved, it navigates. Unresolved, it renders as **plain text** — not as an error and
 * not as a broken link. Obsidian's own convention is that a link to a note that does not
 * exist yet is a deliberate act: it marks something worth writing later. Styling it as
 * damage would be both wrong and, in a corpus that is mostly forward references, noisy.
 */
export function WikiLink({ target, heading, alias, embed }: WikiLinkProps): React.JSX.Element {
  const { index, openNote, openPath, describeNote } = useNoteLinks()
  const label = wikilinkLabel({ target, heading, alias })

  // `![[photo.jpg]]` — the bot writes these for every attachment. Vault files cannot be
  // loaded into the renderer (the CSP is `default-src 'self'` by design), so it becomes a
  // chip that opens the real file rather than a frame that fails to load.
  if (embed && isAttachmentTarget(target)) {
    const path = attachmentPath(target)
    return (
      <button
        type="button"
        onClick={() => openPath(path)}
        title={`Open ${path} in Obsidian`}
        className={cn(
          'transition-quiet rounded-pill border-line bg-fill text-ink2 hover:text-ink hover:bg-hover-strong',
          'font-sans inline-flex items-center gap-1.5 border px-2.5 py-[3px] align-middle text-xs'
        )}
      >
        <span aria-hidden className="bg-faint rounded-marker h-2 w-2 flex-none" />
        {label || path.split('/').pop()}
      </button>
    )
  }

  const ref = target === '' ? null : resolveWikilink(target, index)

  if (ref === null) {
    return (
      // Plain text, in the body's own colour. Not dimmed, not underlined, not marked:
      // the only affordance is a tooltip that explains rather than warns.
      <span title={`${label} — no note by that name yet`}>{label}</span>
    )
  }

  return (
    <button
      type="button"
      onClick={() => openNote(ref)}
      title={describeNote(ref)}
      className={RESOLVED_CLASS}
    >
      {embed && (
        <span aria-hidden className="text-muted mr-1 text-xs">
          ↳
        </span>
      )}
      {label}
    </button>
  )
}

/**
 * A normal markdown link. Every navigation in this window is denied by the main process
 * and handed to the system browser, so this opens outside the app by construction.
 */
export function ExternalLink({
  href,
  children,
}: {
  href: string
  children: ReactNode
}): React.JSX.Element {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={href}
      className={RESOLVED_CLASS}
    >
      {children}
    </a>
  )
}
