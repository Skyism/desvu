/**
 * Markdown rendering, `[[wikilink]]` resolution and the thread UI.
 *
 * Everything here reads notes; nothing here reaches the filesystem. Reads and writes go
 * through `store/brainDump.ts` and the IPC bridge like every other surface's data.
 */

export { Markdown } from './Markdown'
export type { MarkdownProps, MarkdownVariant } from './Markdown'

export { ExternalLink, NoteLinkProvider, useNoteLinks, WikiLink } from './NoteLink'
export type { WikiLinkProps } from './NoteLink'

export { NewThreadDialog } from './NewThreadDialog'
export type { NewThreadDialogProps } from './NewThreadDialog'

export { ThreadList } from './ThreadList'
export type { ThreadListProps } from './ThreadList'

export { ThreadReader } from './ThreadReader'
export type { ThreadReaderProps } from './ThreadReader'

export {
  citedTargets,
  collectWikilinks,
  inlineText,
  parseBlocks,
  parseInline,
  parseNote,
  parseWikilinkTarget,
} from './parse'
export type { Block, Inline, ListItem } from './parse'

export {
  attachmentPath,
  buildNoteIndex,
  EMPTY_NOTE_INDEX,
  isAttachmentTarget,
  linkKey,
  resolveWikilink,
  wikilinkLabel,
} from './wikilinks'
export type { NoteIndex, NoteRef } from './wikilinks'

export {
  formatWeekLabel,
  isoWeekOf,
  isoWeekRange,
  parseDateString,
  previewOf,
  relativeDay,
} from './format'
