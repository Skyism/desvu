import type { Dirent } from 'node:fs'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { resolveVaultPath } from '@shared/vault'
import { isErrnoException, ValidationError } from './errors'

/**
 * Turn a vault-relative path into an absolute one, refusing anything that escapes the
 * vault. Every markdown-backed repository takes a path straight from the renderer, and
 * `../../.ssh/id_rsa` must not be a valid library item.
 */
export function resolveInVault(relativePath: string, mustBeUnder?: string): string {
  if (typeof relativePath !== 'string' || relativePath.trim() === '') {
    throw new ValidationError('path is required')
  }
  if (path.isAbsolute(relativePath)) {
    throw new ValidationError(`path must be vault-relative, not absolute ("${relativePath}")`)
  }

  const root = resolveVaultPath()
  const absolute = path.resolve(root, relativePath)
  const boundary = mustBeUnder ? path.resolve(root, mustBeUnder) : root

  if (absolute !== boundary && !absolute.startsWith(`${boundary}${path.sep}`)) {
    throw new ValidationError(
      `path "${relativePath}" is outside ${mustBeUnder ?? 'the vault'} and was refused`
    )
  }

  return absolute
}

/** Vault-relative, POSIX-separated, NFC-normalised — the form every record stores. */
export function toVaultRelative(absolutePath: string): string {
  const relative = path.relative(resolveVaultPath(), absolutePath)
  return relative.split(path.sep).join('/').normalize('NFC')
}

/** `readdir` that treats a missing directory as an empty one — nothing captured yet. */
export async function listDirectory(absolutePath: string): Promise<string[]> {
  try {
    return await readdir(absolutePath)
  } catch (error) {
    if (isErrnoException(error) && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
      return []
    }
    throw error
  }
}

export async function listDirents(absolutePath: string): Promise<Dirent[]> {
  try {
    return await readdir(absolutePath, { withFileTypes: true })
  } catch (error) {
    if (isErrnoException(error) && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) {
      return []
    }
    throw error
  }
}

const COMBINING_MARKS = /[̀-ͯ]/g

/** `Designing Data-Intensive Applications, ch.5` -> `designing-data-intensive-applications-ch5` */
export function slugify(value: string, maxLength = 60): string {
  const slug = value
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '')

  return slug === '' ? 'untitled' : slug
}

/** Append `-2`, `-3`, ... until the name is free. */
export function uniqueName(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base}-${suffix}`
    if (!taken.has(candidate)) return candidate
  }
  return `${base}-${Date.now()}`
}
