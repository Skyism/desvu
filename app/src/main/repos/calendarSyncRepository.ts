import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type { CalendarRefreshResult, CalendarStatus } from '@shared/types'
import { resolveVaultPath } from '@shared/vault'
import { calendarRepository } from './calendarRepository'

const run = promisify(execFile)

/**
 * Pulling Google Calendar into `data/calendar.json`.
 *
 * The fetch lives in `scripts/refresh-calendar.mjs` rather than here so the same code
 * serves the app, a terminal, `/sort-inbox` and any future cron job. `data/SCHEMAS.md`
 * describes `calendar.json` as written by a refresh script and read-only to the app; this
 * keeps that true rather than quietly moving the writer inside the app.
 */

const CONFIG_DIR = path.join(homedir(), '.config', 'desvu')
const CLIENT_FILE = path.join(CONFIG_DIR, 'google-client.json')
const TOKEN_FILE = path.join(CONFIG_DIR, 'google-token.json')

/**
 * Electron's binary *is* Node, so this runs scripts without depending on a system node
 * being installed or on a GUI app inheriting a login shell's PATH.
 */
function nodeExecutable(): { command: string; env: NodeJS.ProcessEnv } {
  return {
    command: process.execPath,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  }
}

function scriptPath(appRoot: string, name: string): string {
  return path.join(appRoot, 'scripts', name)
}

export function createCalendarSyncRepository(appRoot: string) {
  return {
    async status(): Promise<CalendarStatus> {
      // `configured` and `connected` are different failures with different fixes, so the
      // UI is told which one it is rather than being left to say "calendar unavailable".
      const configured = existsSync(CLIENT_FILE)
      let connected = false
      if (existsSync(TOKEN_FILE)) {
        try {
          const stored = JSON.parse(await readFile(TOKEN_FILE, 'utf8')) as {
            refresh_token?: string
          }
          connected = Boolean(stored.refresh_token)
        } catch {
          connected = false
        }
      }
      return { configured, connected, last_refresh: await calendarRepository.lastRefresh() }
    },

    async refresh(): Promise<CalendarRefreshResult> {
      const script = scriptPath(appRoot, 'refresh-calendar.mjs')
      if (!existsSync(script)) {
        return { ok: false, events: 0, error: `Missing ${script}` }
      }

      const { command, env } = nodeExecutable()
      try {
        await run(command, [script, '--quiet'], {
          env: { ...env, DESVU_VAULT: resolveVaultPath() },
          timeout: 60_000,
        })
      } catch (error) {
        // The script writes a human-readable reason to stderr; pass it through rather
        // than an exit code, because the fixes differ ("reconnect" vs "enable the API").
        const stderr = (error as { stderr?: string }).stderr?.trim()
        const message = (error as Error).message
        return { ok: false, events: 0, error: stderr || message }
      }

      const events = await calendarRepository.forDate(new Date().toISOString().slice(0, 10))
      return { ok: true, events: events.length }
    },
  }
}

export type CalendarSyncRepository = ReturnType<typeof createCalendarSyncRepository>
