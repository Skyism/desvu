/**
 * Attachment download.
 *
 * Telegram file URLs embed the bot token, so the URL is built here and never
 * logged, returned, or stored. Only the resulting filename leaves this module.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { assertCapturePath, resolveVaultPath, VAULT_SUBDIRS } from './vault.js'
import { withVaultLock } from './vault-lock.js'

const EXT_BY_KIND = {
  voice: '.ogg',
  audio: '.mp3',
  photo: '.jpg',
  video: '.mp4',
  video_note: '.mp4',
  animation: '.mp4',
  sticker: '.webp',
  document: '.bin',
}

const pad2 = (n) => String(n).padStart(2, '0')

/** Strip anything that would be awkward in a filename or an Obsidian wikilink. */
export function sanitizeFilenamePart(value, { max = 48 } = {}) {
  return String(value ?? '')
    .normalize('NFC')
    .replace(/[\\/:*?"<>|[\]#^]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, max)
}

/**
 * Stable, sortable, collision-resistant attachment name:
 *   2026-08-01-143205-voice-AgADkQADbcs.ogg
 */
export function attachmentName({ at, kind, uniqueId, filePath, originalName }) {
  const stamp =
    `${at.getFullYear()}-${pad2(at.getMonth() + 1)}-${pad2(at.getDate())}` +
    `-${pad2(at.getHours())}${pad2(at.getMinutes())}${pad2(at.getSeconds())}`

  let ext = filePath ? path.extname(filePath) : ''
  if (!ext && originalName) ext = path.extname(originalName)
  if (!ext) ext = EXT_BY_KIND[kind] ?? '.bin'
  ext = ext.toLowerCase().replace(/[^a-z0-9.]/g, '').slice(0, 12) || '.bin'

  const id = sanitizeFilenamePart(uniqueId, { max: 24 }) || 'file'
  const label =
    kind === 'document' && originalName
      ? sanitizeFilenamePart(path.basename(originalName, path.extname(originalName)), { max: 32 })
      : ''

  return [stamp, kind, id, label].filter(Boolean).join('-') + ext
}

/**
 * Download a Telegram file into the vault's Attachments/ directory.
 *
 * @param {object} opts
 * @param {string} opts.token      bot token — used to build the URL, never logged
 * @param {string} opts.filePath   `file_path` from getFile()
 * @param {string} opts.name       destination filename inside Attachments/
 * @param {string} [opts.root]     vault root
 * @param {string} [opts.apiRoot]  override the Bot API host (tests, or a self-hosted Bot API server)
 * @returns {Promise<{name: string, path: string, bytes: number}>}
 */
export const DEFAULT_API_ROOT = 'https://api.telegram.org'

export async function downloadAttachment({
  token,
  filePath,
  name,
  root,
  timeout = 120_000,
  apiRoot = process.env.DESVU_TELEGRAM_API_ROOT || DEFAULT_API_ROOT,
  lock = {},
}) {
  const vaultRoot = root ?? resolveVaultPath()
  const dir = path.join(vaultRoot, VAULT_SUBDIRS.attachments)
  const dest = path.join(dir, name)
  assertCapturePath(dest, vaultRoot)

  const url = `${apiRoot}/file/bot${token}/${filePath}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  let bytes
  try {
    const res = await fetch(url, { signal: controller.signal })
    if (!res.ok) {
      // Deliberately does not include the URL: it contains the token.
      throw new Error(`Telegram file download failed with HTTP ${res.status}`)
    }
    bytes = Buffer.from(await res.arrayBuffer())
  } finally {
    clearTimeout(timer)
  }

  // The download stays *outside* the lock on purpose: a slow file would otherwise hold a
  // 10s-timeout lock long enough to block the app and the sort skill, and could even age
  // past the staleness window while legitimately held. Only the write is serialized.
  await withVaultLock(
    async () => {
      await mkdir(dir, { recursive: true })
      await writeFile(dest, bytes)
    },
    { root: vaultRoot, ...lock }
  )
  return { name, path: dest, bytes: bytes.length }
}
