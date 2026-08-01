import { existsSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

/**
 * Where the vault lives.
 *
 * The directory name carries an accent ("Dès vu"), and macOS hands the same name
 * back as NFC from some APIs and NFD from others — iCloud in particular. Comparing
 * normalized forms means we match the directory regardless of which encoding the
 * caller or the filesystem happens to produce.
 */
export const VAULT_DIR_NAME = 'Dès vu'

const ICLOUD_OBSIDIAN = path.join(
  homedir(),
  'Library',
  'Mobile Documents',
  'iCloud~md~obsidian',
  'Documents'
)

function sameName(a: string, b: string): boolean {
  return a.normalize('NFC') === b.normalize('NFC')
}

/** Find a child of `parent` whose name matches `name` under Unicode normalization. */
function findChild(parent: string, name: string): string | null {
  if (!existsSync(parent)) return null
  try {
    for (const entry of readdirSync(parent)) {
      if (sameName(entry, name)) return path.join(parent, entry)
    }
  } catch {
    return null
  }
  return null
}

function isVault(candidate: string | null): candidate is string {
  if (!candidate) return false
  try {
    // A real vault has the data directory the schemas describe.
    return statSync(candidate).isDirectory() && existsSync(path.join(candidate, 'data'))
  } catch {
    return false
  }
}

let cached: string | null = null

/**
 * Resolve the vault root, in priority order:
 *   1. DESVU_VAULT environment variable (tests, CI, and anyone relocating the vault)
 *   2. ~/Documents/Dès vu — the symlink, which is the path the user thinks in
 *   3. the iCloud Obsidian container, which is where the bytes actually live
 *
 * Throws rather than guessing: silently writing to the wrong directory would
 * scatter a second copy of the corpus somewhere the user never looks.
 */
export function resolveVaultPath(): string {
  if (cached) return cached

  const fromEnv = process.env.DESVU_VAULT
  if (fromEnv) {
    const expanded = fromEnv.startsWith('~')
      ? path.join(homedir(), fromEnv.slice(1))
      : fromEnv
    if (!isVault(expanded)) {
      throw new Error(
        `DESVU_VAULT is set to "${expanded}" but that is not a vault (no data/ directory).`
      )
    }
    cached = expanded
    return cached
  }

  const candidates = [
    findChild(path.join(homedir(), 'Documents'), VAULT_DIR_NAME),
    findChild(ICLOUD_OBSIDIAN, VAULT_DIR_NAME),
  ]

  for (const candidate of candidates) {
    if (isVault(candidate)) {
      cached = candidate
      return cached
    }
  }

  throw new Error(
    `Could not find the "${VAULT_DIR_NAME}" vault. Looked in ~/Documents and the ` +
      `iCloud Obsidian container. Set DESVU_VAULT to override.`
  )
}

/** Reset the memoized path. Tests only. */
export function clearVaultPathCache(): void {
  cached = null
}

/** Absolute path to a file or directory inside the vault. */
export function vaultPath(...segments: string[]): string {
  return path.join(resolveVaultPath(), ...segments)
}

/** Absolute path to one of the JSON trackers in `data/`. */
export function dataPath(file: string): string {
  return vaultPath('data', file)
}

export const VAULT_SUBDIRS = {
  data: 'data',
  journal: 'Journal',
  brainDump: 'Brain Dump',
  library: 'Library',
  inbox: 'Inbox',
  attachments: 'Attachments',
  synthesis: 'Synthesis',
} as const
