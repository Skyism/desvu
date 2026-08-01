/**
 * Credentials and startup validation.
 *
 * The token lives at ~/.config/desvu/bot.env — outside the vault and outside any
 * git repo (C3). Nothing here ever writes a credential anywhere, and `redact()`
 * is the only sanctioned way for a value derived from the token to reach a log.
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

export const DEFAULT_ENV_PATH = path.join(homedir(), '.config', 'desvu', 'bot.env')

/**
 * Minimal dotenv parser. Deliberately not a dependency: the file is three lines
 * and we would rather own the parse than audit a package for it.
 */
export function parseEnvFile(text) {
  const out = Object.create(null)
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    if (key === '') continue
    let value = line.slice(eq + 1).trim()
    const quoted =
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    if (quoted) value = value.slice(1, -1)
    out[key] = value
  }
  return out
}

/**
 * C2 is a hard fail: an unparseable or absent allow-list id must stop the process,
 * never fall back to "allow everyone". Parsed strictly — `parseInt` would happily
 * turn "123abc" or "" into a plausible-looking id, so require all digits.
 */
export function parseAllowedUserId(raw) {
  if (raw === undefined || raw === null) {
    throw new Error(
      'TELEGRAM_ALLOWED_USER_ID is not set. Refusing to start: an open capture bot ' +
        'would write anyone\'s messages into the vault.'
    )
  }
  const value = String(raw).trim()
  if (!/^\d+$/.test(value)) {
    throw new Error(
      `TELEGRAM_ALLOWED_USER_ID must be a positive integer Telegram user id, got "${value}". ` +
        'Refusing to start rather than running without a whitelist.'
    )
  }
  const id = Number(value)
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error(
      `TELEGRAM_ALLOWED_USER_ID "${value}" is out of range for a Telegram user id. Refusing to start.`
    )
  }
  return id
}

function parseToken(raw) {
  const value = String(raw ?? '').trim()
  if (value === '') {
    throw new Error('TELEGRAM_BOT_TOKEN is missing from the credentials file. Refusing to start.')
  }
  // Telegram tokens are "<bot_id>:<secret>". Shape-check only; the real proof is getMe().
  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(value)) {
    throw new Error(
      'TELEGRAM_BOT_TOKEN does not look like a Telegram bot token (expected "<digits>:<secret>"). ' +
        'Refusing to start. (The value is not echoed here on purpose.)'
    )
  }
  return value
}

/**
 * Load and validate config.
 *
 * Values come from the credentials file; anything absent there falls back to the
 * ambient environment, which is what lets tests inject without touching the real file.
 */
export function loadConfig({ envPath = DEFAULT_ENV_PATH, env = process.env, required = true } = {}) {
  let fileVars = Object.create(null)
  let fileError = null
  try {
    fileVars = parseEnvFile(readFileSync(envPath, 'utf8'))
  } catch (err) {
    fileError = err
  }

  const pick = (key) => (key in fileVars && fileVars[key] !== '' ? fileVars[key] : env[key])

  const rawToken = pick('TELEGRAM_BOT_TOKEN')
  const rawAllowed = pick('TELEGRAM_ALLOWED_USER_ID')

  if (required && rawToken === undefined && fileError) {
    throw new Error(
      `Could not read credentials from ${envPath}: ${fileError.code ?? fileError.message}. ` +
        'Expected TELEGRAM_BOT_TOKEN and TELEGRAM_ALLOWED_USER_ID there (mode 600).'
    )
  }

  const allowedUserId = parseAllowedUserId(rawAllowed)
  const token = required ? parseToken(rawToken) : String(rawToken ?? '')

  return {
    token,
    allowedUserId,
    botUsername: pick('TELEGRAM_BOT_USERNAME') ?? null,
    envPath,
  }
}

/** A config summary that is safe to print. The token never appears. */
export function describeConfig(config) {
  return {
    envPath: config.envPath,
    botUsername: config.botUsername,
    allowedUserId: config.allowedUserId,
    token: config.token ? `<redacted:${config.token.split(':')[0]}:…>` : '<missing>',
  }
}
