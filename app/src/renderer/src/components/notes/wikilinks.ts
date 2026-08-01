/**
 * Resolving `[[wikilinks]]` the way Obsidian does, against the notes this app can see.
 *
 * THE RULE THAT MATTERS: a link to a note that does not exist is **not an error**. In
 * Obsidian an unresolved link is a deliberate act — it marks something worth writing
 * later, and the graph shows it as a hollow node. So an unresolved link renders as plain
 * text here. No red, no strikethrough, no warning icon, no "broken link" copy.
 *
 * Matching follows Obsidian: the link text is a **file stem**, not a title. That is also
 * exactly what the sort skill's scanner emits into `context.link_targets`
 * (`link_targets.append(note.stem)`), so the two agree by construction. A full vault
 * path (`Brain Dump/School/malloc-lab`) resolves too, and `.md` is optional.
 */

export interface NoteRef {
  /** Vault-relative path, e.g. `Brain Dump/School/malloc-lab.md`. */
  path: string
  /** Human title — frontmatter `title`, an H1, or the file stem. */
  title: string
  /** Which surface, if any, can show this note without leaving the app. */
  kind: 'brain-dump' | 'library' | 'synthesis' | 'note'
}

export interface NoteIndex {
  /** Every note, keyed by a normalized lookup key (stem and full path both map here). */
  byKey: Map<string, NoteRef[]>
  all: NoteRef[]
}

/** Lower-cased, NFC, `.md` dropped, backslashes folded — the comparison form. */
export function linkKey(value: string): string {
  return value
    .normalize('NFC')
    .replace(/\\/g, '/')
    .replace(/\.md$/i, '')
    .trim()
    .toLowerCase()
}

function stemOf(path: string): string {
  const name = path.split('/').pop() ?? path
  return name.replace(/\.md$/i, '')
}

export const EMPTY_NOTE_INDEX: NoteIndex = { byKey: new Map(), all: [] }

export function buildNoteIndex(refs: readonly NoteRef[]): NoteIndex {
  const byKey = new Map<string, NoteRef[]>()

  const add = (key: string, ref: NoteRef): void => {
    const normalized = linkKey(key)
    if (normalized === '') return
    const existing = byKey.get(normalized)
    if (existing) {
      if (!existing.some((candidate) => candidate.path === ref.path)) existing.push(ref)
    } else {
      byKey.set(normalized, [ref])
    }
  }

  for (const ref of refs) {
    add(stemOf(ref.path), ref)
    add(ref.path, ref)
  }

  return { byKey, all: [...refs] }
}

/**
 * Resolve a link target to a note, or null.
 *
 * Ambiguity (two notes with the same stem in different folders) is settled the way
 * Obsidian settles it — the shortest path wins, ties broken alphabetically — so the
 * choice is stable across sessions rather than depending on directory read order.
 */
export function resolveWikilink(target: string, index: NoteIndex): NoteRef | null {
  const key = linkKey(target)
  if (key === '') return null

  const matches = index.byKey.get(key)
  if (!matches || matches.length === 0) return null
  if (matches.length === 1) return matches[0] as NoteRef

  return [...matches].sort(
    (a, b) => a.path.split('/').length - b.path.split('/').length || a.path.localeCompare(b.path)
  )[0] as NoteRef
}

/** What the link shows. Obsidian prefers the alias, then `Note › Heading`, then the note. */
export function wikilinkLabel(link: {
  target: string
  heading: string | null
  alias: string | null
}): string {
  if (link.alias) return link.alias
  if (link.target === '') return link.heading ?? ''
  return link.heading ? `${link.target} › ${link.heading}` : link.target
}

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|svg|avif|heic)$/i
const MEDIA_EXTENSIONS = /\.(mp3|m4a|wav|ogg|opus|mp4|mov|webm|pdf)$/i

/** An `![[…]]` embed pointing at a file rather than a note. */
export function isAttachmentTarget(target: string): boolean {
  return IMAGE_EXTENSIONS.test(target) || MEDIA_EXTENSIONS.test(target)
}

/**
 * Where an attachment actually lives. The bot writes `[[Attachments/<file>]]`, but a
 * bare filename is legal in Obsidian too, so both forms find the same file.
 */
export function attachmentPath(target: string): string {
  const cleaned = target.replace(/\\/g, '/').replace(/^\.?\//, '')
  return cleaned.includes('/') ? cleaned : `Attachments/${cleaned}`
}
