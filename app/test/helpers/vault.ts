import { mkdtemp, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { clearVaultPathCache } from '@shared/vault'

/**
 * A throwaway vault in `os.tmpdir()`.
 *
 * Nothing in this suite is allowed anywhere near `~/Documents/Dès vu` — the real vault
 * holds the only copy of six months of journal entries and it has no git remote to
 * recover from. `DESVU_VAULT` is repointed before any repository module resolves a path.
 */
export interface TempVault {
  root: string
  dispose(): Promise<void>
  /** Absolute path inside the vault. */
  at(...segments: string[]): string
  /** Write a file, creating parent directories. */
  write(relativePath: string, contents: string): Promise<void>
  writeJson(relativePath: string, value: unknown): Promise<void>
  /** Names of everything directly inside a vault-relative directory. */
  ls(relativePath: string): Promise<string[]>
}

export async function createTempVault(label = 'desvu'): Promise<TempVault> {
  const root = await mkdtemp(path.join(tmpdir(), `${label}-vault-`))
  await mkdir(path.join(root, 'data'), { recursive: true })

  process.env.DESVU_VAULT = root
  clearVaultPathCache()

  async function write(relativePath: string, contents: string): Promise<void> {
    const absolute = path.join(root, relativePath)
    await mkdir(path.dirname(absolute), { recursive: true })
    await writeFile(absolute, contents, 'utf8')
  }

  return {
    root,
    write,

    at(...segments: string[]): string {
      return path.join(root, ...segments)
    },

    async writeJson(relativePath: string, value: unknown): Promise<void> {
      await write(relativePath, `${JSON.stringify(value, null, 2)}\n`)
    },

    async ls(relativePath: string): Promise<string[]> {
      try {
        return (await readdir(path.join(root, relativePath))).sort()
      } catch {
        return []
      }
    },

    async dispose(): Promise<void> {
      delete process.env.DESVU_VAULT
      clearVaultPathCache()
      await rm(root, { recursive: true, force: true })
    },
  }
}

/** Days offset from today, as a local `YYYY-MM-DD`. */
export function dayOffset(days: number, from: Date = new Date()): string {
  const date = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}
