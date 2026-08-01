import { useCallback, useState } from 'react'
import type { LibraryItem, LibraryStatus } from '@shared/types'

import { useToast } from '@/components/Toast'
import { readableMessage } from '@/lib/bridge'
import { openInObsidian, setLibraryArchived, setLibraryStatus } from './data'

/**
 * The three things you can do to a library item, with the copy that goes with them.
 *
 * Every message here says what is still true. "Set aside" is the one that matters most:
 * a note that steps out of the queue has not been lost, so the toast says where it still
 * is. Framing it as removal would defeat the entire mechanic.
 */
export interface LibraryActions {
  isBusy: (path: string) => boolean
  setStatus: (item: LibraryItem, status: LibraryStatus) => void
  setArchived: (item: LibraryItem, archived: boolean) => void
  open: (item: LibraryItem) => void
}

const STATUS_MESSAGE: Record<LibraryStatus, string> = {
  unread: 'Back to unread.',
  reading: 'Marked as reading.',
  done: 'Marked as read.',
}

export function useLibraryActions(): LibraryActions {
  const { toast } = useToast()
  const [busy, setBusy] = useState<Record<string, true>>({})

  const withBusy = useCallback(
    async (path: string, work: () => Promise<void>): Promise<void> => {
      setBusy((current) => ({ ...current, [path]: true }))
      try {
        await work()
      } finally {
        setBusy((current) => {
          const next = { ...current }
          delete next[path]
          return next
        })
      }
    },
    []
  )

  const setStatus = useCallback(
    (item: LibraryItem, status: LibraryStatus): void => {
      void withBusy(item.path, async () => {
        try {
          await setLibraryStatus(item.path, status)
          toast(STATUS_MESSAGE[status], { tone: 'accent' })
        } catch (thrown) {
          toast(`${readableMessage(thrown)} The note is unchanged.`)
        }
      })
    },
    [toast, withBusy]
  )

  const setArchived = useCallback(
    (item: LibraryItem, archived: boolean): void => {
      void withBusy(item.path, async () => {
        try {
          await setLibraryArchived(item.path, archived)
          toast(
            archived
              ? 'Set aside. Still in the vault, still in the graph, still in search.'
              : 'Back in the queue.',
            { tone: 'accent' }
          )
        } catch (thrown) {
          toast(`${readableMessage(thrown)} The note is unchanged.`)
        }
      })
    },
    [toast, withBusy]
  )

  const open = useCallback(
    (item: LibraryItem): void => {
      void (async () => {
        try {
          await openInObsidian(item.path)
        } catch (thrown) {
          toast(`${readableMessage(thrown)} The note is still at ${item.path}.`)
        }
      })()
    },
    [toast]
  )

  return {
    isBusy: (path: string) => busy[path] === true,
    setStatus,
    setArchived,
    open,
  }
}
