import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { isErrnoException } from './errors'

let sequence = 0

/**
 * Write a file atomically: temp file in the *same directory*, fsync, then rename.
 *
 * The vault syncs through iCloud while Obsidian may have the same file open. A plain
 * `writeFile` truncates first and fills after, so a sync daemon (or a crash) that catches
 * the gap sees an empty or half-written file and propagates that loss everywhere. `rename`
 * within a directory is atomic on APFS, so a reader sees either the whole old file or the
 * whole new one, never a torn one.
 *
 * The temp file must share the directory — across filesystems `rename` degrades to a
 * copy, which reintroduces exactly the window this exists to close.
 */
export async function atomicWriteFile(filePath: string, contents: string): Promise<void> {
  const directory = path.dirname(filePath)
  await mkdir(directory, { recursive: true })

  const tempPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}-${++sequence}.tmp`
  )

  let handle: Awaited<ReturnType<typeof open>> | undefined
  try {
    handle = await open(tempPath, 'w')
    await handle.writeFile(contents, 'utf8')
    // Without the fsync the rename can land before the bytes do.
    await handle.sync()
    await handle.close()
    handle = undefined

    await rename(tempPath, filePath)
  } catch (error) {
    if (handle) await handle.close().catch(() => undefined)
    await rm(tempPath, { force: true }).catch(() => undefined)
    throw error
  }
}

/** Read a text file, or `null` when it does not exist. Missing is not an error. */
export async function readTextFileOrNull(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8')
  } catch (error) {
    if (isErrnoException(error) && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
      return null
    }
    throw error
  }
}
