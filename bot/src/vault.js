/**
 * Vault path resolution.
 *
 * A deliberate reimplementation of app/src/shared/vault.ts — the bot is a separate
 * package with no build step and must not import across the boundary. Same priority
 * order, same NFC/NFD tolerance. If that file's rules change, change these too.
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

export const VAULT_DIR_NAME = 'Dès vu'

export const VAULT_SUBDIRS = {
  inbox: 'Inbox',
  attachments: 'Attachments',
}

/**
 * The only directories the bot is allowed to write to.
 *
 * C7: the journal is excluded from Telegram. There is no journal command, and this
 * list is the structural reason a future handler cannot quietly acquire one — every
 * write goes through assertCapturePath().
 */
export const WRITABLE_SUBDIRS = Object.freeze([VAULT_SUBDIRS.inbox, VAULT_SUBDIRS.attachments])

const ICLOUD_OBSIDIAN = path.join(
  homedir(),
  'Library',
  'Mobile Documents',
  'iCloud~md~obsidian',
  'Documents'
)

/** macOS hands the accented name back as NFC from some APIs and NFD from others. */
function sameName(a, b) {
  return a.normalize('NFC') === b.normalize('NFC')
}

function findChild(parent, name) {
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

function isVault(candidate) {
  if (!candidate) return false
  try {
    return statSync(candidate).isDirectory() && existsSync(path.join(candidate, 'data'))
  } catch {
    return false
  }
}

let cached = null

/**
 * Resolve the vault root:
 *   1. DESVU_VAULT
 *   2. ~/Documents/Dès vu (the symlink the user thinks in)
 *   3. the iCloud Obsidian container (where the bytes live)
 *
 * Throws rather than guessing. A successful result is memoized, but the cache is
 * revalidated on every call so an iCloud unmount is noticed and a remount recovers
 * without restarting the bot.
 */
export function resolveVaultPath() {
  if (cached && isVault(cached)) return cached
  cached = null

  const fromEnv = process.env.DESVU_VAULT
  if (fromEnv) {
    const expanded = fromEnv.startsWith('~') ? path.join(homedir(), fromEnv.slice(1)) : fromEnv
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
    `Could not find the "${VAULT_DIR_NAME}" vault. Looked in ~/Documents and the iCloud ` +
      'Obsidian container. If iCloud is not mounted yet, this recovers on its own; ' +
      'otherwise set DESVU_VAULT.'
  )
}

/** Reset the memoized path. Tests only. */
export function clearVaultPathCache() {
  cached = null
}

export function vaultPath(...segments) {
  return path.join(resolveVaultPath(), ...segments)
}

/**
 * C7 guard. Throws unless `target` resolves inside Inbox/ or Attachments/.
 *
 * Nothing the bot receives may land in Journal/ — reflection happens in the app only —
 * and this is enforced on the write path rather than by convention.
 */
export function assertCapturePath(target, root = resolveVaultPath()) {
  const resolvedRoot = path.resolve(root)
  const resolved = path.resolve(target)
  const rel = path.relative(resolvedRoot, resolved)
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Refusing to write outside the vault: ${resolved}`)
  }
  const top = rel.split(path.sep)[0]
  if (!WRITABLE_SUBDIRS.some((dir) => sameName(dir, top))) {
    throw new Error(
      `Refusing to write to "${top}/": the capture bot may only write to ` +
        `${WRITABLE_SUBDIRS.join('/ and ')}/. (C7 — the journal is not reachable from Telegram.)`
    )
  }
  return resolved
}
