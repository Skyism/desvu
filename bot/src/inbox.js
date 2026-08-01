/**
 * The Inbox line format — a shared contract with the app. Do not drift from it.
 *
 *   - [ ] 14:32 · telegram · the raw text exactly as sent
 *
 * Attachment captures end with ` → [[Attachments/<filename>]]`.
 *
 * The bot does no parsing, no classification, no NLP. It writes the line and stops;
 * `/sort-inbox` does every bit of routing later.
 */
import { appendFile, mkdir, open } from 'node:fs/promises'
import path from 'node:path'
import { assertCapturePath, resolveVaultPath, VAULT_SUBDIRS } from './vault.js'
import { withVaultLock } from './vault-lock.js'

/** Middle dot with surrounding spaces. Matches the app's parser. */
export const FIELD_SEP = ' · '
export const ATTACHMENT_ARROW = ' → '

const pad2 = (n) => String(n).padStart(2, '0')

/** Local YYYY-MM-DD. */
export function formatDay(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** Local HH:MM. */
export function formatTime(date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

/**
 * Fold a message onto one physical line.
 *
 * One capture per line is the contract, and Telegram messages can contain newlines,
 * so line breaks collapse to a single space. This is the only normalization applied
 * to captured text — no words are added, removed, or reordered.
 */
export function foldText(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t ]/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .join(' ')
    .replace(/ {2,}/g, ' ')
    .trim()
}

/**
 * Build one Inbox line.
 *
 * @param {object} opts
 * @param {string} opts.text        body of the capture, already folded or foldable
 * @param {Date}   opts.at          when the user sent it (local time is used)
 * @param {string} [opts.source]    'telegram'
 * @param {string} [opts.attachment] bare filename inside Attachments/
 */
export function formatInboxLine({ text, at, source = 'telegram', attachment = null }) {
  const body = foldText(text)
  const parts = ['- [ ] ', formatTime(at), FIELD_SEP, source, FIELD_SEP, body]
  let line = parts.join('')
  if (attachment) {
    const name = String(attachment).split('/').pop()
    line += `${ATTACHMENT_ARROW}[[${VAULT_SUBDIRS.attachments}/${name}]]`
  }
  return line
}

/** Absolute path of the day file for `date`. */
export function inboxFilePath(date, root = resolveVaultPath()) {
  return path.join(root, VAULT_SUBDIRS.inbox, `${formatDay(date)}.md`)
}

/**
 * Create the day file with its `# YYYY-MM-DD` heading if it does not exist.
 *
 * Uses O_CREAT|O_EXCL so two concurrent captures cannot both write the heading;
 * the loser sees EEXIST and moves straight to appending.
 */
async function ensureDayFile(file, date) {
  await mkdir(path.dirname(file), { recursive: true })
  let handle
  try {
    handle = await open(file, 'wx')
  } catch (err) {
    if (err.code === 'EEXIST') return false
    throw err
  }
  try {
    await handle.writeFile(`# ${formatDay(date)}\n\n`, 'utf8')
  } finally {
    await handle.close()
  }
  return true
}

/**
 * Append one already-formatted line to the day file.
 *
 * Two independent guarantees, and both are needed:
 *
 *  - The append itself is a single O_APPEND write of one complete line, so concurrent
 *    appenders can never interleave mid-line.
 *  - The cross-process vault lock is held around it, because the app and `/sort-inbox`
 *    read-modify-*rewrite* this same file. An atomic append is no defence against another
 *    process reading the file, and writing its version back over ours.
 *
 * @returns {Promise<{file: string, created: boolean}>}
 */
export async function appendInboxLine(line, { at = new Date(), root, lock = {} } = {}) {
  const vaultRoot = root ?? resolveVaultPath()
  const file = inboxFilePath(at, vaultRoot)
  assertCapturePath(file, vaultRoot)

  return withVaultLock(
    async () => {
      const created = await ensureDayFile(file, at)
      await appendFile(file, `${line}\n`, { encoding: 'utf8', flag: 'a' })
      return { file, created }
    },
    { root: vaultRoot, ...lock }
  )
}

/**
 * Format and append in one step. Returns the line that was written.
 */
export async function captureToInbox({ text, at = new Date(), source = 'telegram', attachment = null, root, lock }) {
  const line = formatInboxLine({ text, at, source, attachment })
  const result = await appendInboxLine(line, { at, root, lock })
  return { line, ...result }
}
