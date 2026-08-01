/**
 * Where Google credentials live, and how they are written.
 *
 * Same posture as the Telegram bot token: outside the vault, outside iCloud, outside every
 * git repo, mode 600. A vault that syncs to iCloud and a repo that gets shared are both
 * places a refresh token must never be.
 */
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

export const CONFIG_DIR = path.join(homedir(), '.config', 'desvu')
export const CLIENT_FILE = path.join(CONFIG_DIR, 'google-client.json')
export const TOKEN_FILE = path.join(CONFIG_DIR, 'google-token.json')

/** Read-only. The app never writes to a calendar, so it never asks to. */
export const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly']

export async function writeSecret(file, value) {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 })
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  await chmod(file, 0o600)
}

export async function readJsonOrNull(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return null
  }
}

/**
 * Accepts the credentials file exactly as downloaded from Google Cloud, which wraps the
 * fields in an `installed` key — asking someone to unwrap JSON by hand is a step that
 * gets done wrong.
 */
export async function loadClientConfig() {
  const raw = await readJsonOrNull(CLIENT_FILE)
  if (!raw) {
    throw new Error(
      `No Google client credentials at ${CLIENT_FILE}.\n` +
        `  Create a Desktop app OAuth client in the Google Cloud console, download the\n` +
        `  JSON, and save it there. See ${CONFIG_DIR}/README.md for the exact steps.`
    )
  }
  const client = raw.installed ?? raw.web ?? raw
  if (!client.client_id || !client.client_secret) {
    throw new Error(
      `${CLIENT_FILE} does not look like a Google OAuth client file ` +
        `(no client_id / client_secret).`
    )
  }
  if (raw.web) {
    throw new Error(
      `${CLIENT_FILE} is a "Web application" client. Create a "Desktop app" client ` +
        `instead — a web client rejects the loopback redirect this flow uses.`
    )
  }
  return client
}

/** Exchange the stored refresh token for a short-lived access token. */
export async function getAccessToken() {
  const [client, stored] = await Promise.all([loadClientConfig(), readJsonOrNull(TOKEN_FILE)])
  if (!stored?.refresh_token) {
    throw new Error(`Not connected yet. Run: node scripts/google-auth.mjs`)
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: client.client_id,
      client_secret: client.client_secret,
      refresh_token: stored.refresh_token,
      grant_type: 'refresh_token',
    }),
  })
  const token = await res.json()
  if (!res.ok) {
    // A revoked or expired grant is the common case and has a specific fix, so say it.
    if (token.error === 'invalid_grant') {
      throw new Error(
        'Google rejected the saved token — access was revoked, or it expired from disuse. ' +
          'Reconnect with: node scripts/google-auth.mjs'
      )
    }
    throw new Error(`Could not refresh access: ${token.error_description ?? token.error}`)
  }
  return token.access_token
}

export async function isConnected() {
  const stored = await readJsonOrNull(TOKEN_FILE)
  return Boolean(stored?.refresh_token)
}
