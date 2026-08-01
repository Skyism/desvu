import { spawn, type ChildProcess } from 'node:child_process'
import { accessSync, constants, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import type { SortInboxProgress, SortInboxResult } from '@shared/types'
import { resolveVaultPath } from '@shared/vault'
import { inboxRepository } from './inboxRepository'

/**
 * Runs `/sort-inbox` by spawning the Claude CLI in the vault.
 *
 * The Telegram bot is a dumb receiver on purpose — it appends raw lines and never
 * classifies — so this is where a capture becomes a record. It is a genuinely separate
 * process writing the same `data/*.json` the app writes, which is what the cross-process
 * lock in `lib/vault-lock` exists for.
 */

/** A cold run took 114s in testing; a warm one 39s. Generous, but not unbounded. */
const RUN_TIMEOUT_MS = 10 * 60 * 1000

/**
 * Exactly the tools `.claude/commands/sort-inbox.md` declares, and nothing wider.
 *
 * Headless has no permission prompt, so anything not listed here is denied. Omitting the
 * flag entirely is the dangerous-looking-safe option: the run *appears* to succeed while
 * every script call is silently refused and nothing is actually scanned.
 *
 * `--dangerously-skip-permissions` is deliberately not used. A convenience button is not
 * worth giving a background process unrestricted tool access to the machine.
 */
const ALLOWED_TOOLS = ['Skill', 'Read', 'Glob', 'Grep', 'WebFetch', 'Bash(python3:*)'].join(',')

/**
 * GUI-launched Electron apps do not inherit a login shell's PATH — an app opened from
 * Finder sees little more than `/usr/bin:/bin`. `claude` is typically under nvm or
 * Homebrew, so it has to be found explicitly rather than trusted to be on PATH.
 */
function findClaudeBinary(): string | null {
  const candidates: string[] = []

  for (const dir of (process.env['PATH'] ?? '').split(path.delimiter)) {
    if (dir) candidates.push(path.join(dir, 'claude'))
  }
  candidates.push(
    path.join(homedir(), '.claude', 'local', 'claude'),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude'
  )
  // nvm installs land under a version directory, so enumerate rather than guess.
  const nvm = path.join(homedir(), '.nvm', 'versions', 'node')
  try {
    for (const version of readdirSync(nvm)) {
      candidates.push(path.join(nvm, version, 'bin', 'claude'))
    }
  } catch {
    /* no nvm on this machine */
  }

  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK)
      return candidate
    } catch {
      /* keep looking */
    }
  }
  return null
}

/** Map a tool call to something worth showing a human waiting two minutes. */
function phaseFor(toolName: string, input: string): SortInboxProgress {
  if (toolName === 'Skill') return { phase: 'starting', note: 'loading the sort skill' }
  if (input.includes('inbox_scan')) return { phase: 'scanning', note: 'reading the inbox' }
  if (input.includes('inbox_commit')) return { phase: 'writing', note: 'filing captures' }
  if (toolName === 'WebFetch') return { phase: 'routing', note: 'fetching a saved link' }
  if (toolName === 'Read' || toolName === 'Glob' || toolName === 'Grep') {
    return { phase: 'routing', note: 'reading the vault for context' }
  }
  return { phase: 'routing', note: 'deciding where things belong' }
}

let active: ChildProcess | null = null

export function createSortInboxRepository(onProgress: (p: SortInboxProgress) => void) {
  return {
    /** False when the CLI is absent — the control hides rather than failing on click. */
    async available(): Promise<boolean> {
      return findClaudeBinary() !== null
    },

    async cancel(): Promise<void> {
      active?.kill('SIGTERM')
    },

    async sort(options: { dryRun?: boolean } = {}): Promise<SortInboxResult> {
      if (active) throw new Error('A sort is already running.')

      const binary = findClaudeBinary()
      if (!binary) {
        throw new Error(
          'Could not find the `claude` command. Install Claude Code, or run /sort-inbox ' +
            'from a terminal in the vault instead.'
        )
      }

      const vault = resolveVaultPath()
      const before = await inboxRepository.count()
      const started = Date.now()

      const args = [
        '-p',
        options.dryRun ? '/sort-inbox --dry-run' : '/sort-inbox',
        '--output-format',
        'stream-json',
        '--verbose',
        '--allowedTools',
        ALLOWED_TOOLS,
      ]

      const result = await new Promise<{ summary: string; denials: number; failed: string | null }>(
        (resolve) => {
          const child = spawn(binary, args, {
            cwd: vault,
            // Pin the vault so the spawned session and the app cannot disagree about which
            // directory is the vault — the ~/Documents symlink made exactly that mistake.
            env: { ...process.env, DESVU_VAULT: vault },
            stdio: ['ignore', 'pipe', 'pipe'],
          })
          active = child

          let buffer = ''
          let summary = ''
          let denials = 0
          let failed: string | null = null

          const timer = setTimeout(() => {
            failed = 'The sort took too long and was stopped. Nothing partial was left behind.'
            child.kill('SIGTERM')
          }, RUN_TIMEOUT_MS)

          child.stdout?.on('data', (chunk: Buffer) => {
            buffer += chunk.toString('utf8')
            const lines = buffer.split('\n')
            buffer = lines.pop() ?? ''

            for (const line of lines) {
              if (!line.trim()) continue
              let event: Record<string, unknown>
              try {
                event = JSON.parse(line) as Record<string, unknown>
              } catch {
                continue // partial or non-JSON noise; the next chunk completes it
              }

              if (event['type'] === 'assistant') {
                const message = event['message'] as { content?: unknown[] } | undefined
                for (const block of message?.content ?? []) {
                  const b = block as { type?: string; name?: string; input?: unknown }
                  if (b.type === 'tool_use' && b.name) {
                    onProgress(phaseFor(b.name, JSON.stringify(b.input ?? {})))
                  }
                }
              }

              if (event['type'] === 'result') {
                summary = String(event['result'] ?? '')
                const list = event['permission_denials']
                denials = Array.isArray(list) ? list.length : 0
                if (event['is_error']) failed = summary || 'The sort did not finish.'
              }
            }
          })

          child.stderr?.on('data', () => {
            /* the CLI reports its own errors through the result event */
          })

          child.on('error', (error) => {
            failed = error.message
          })

          child.on('close', () => {
            clearTimeout(timer)
            active = null
            resolve({ summary, denials, failed })
          })
        }
      )

      const after = await inboxRepository.count()

      // Counted from the Inbox, not parsed from the summary. A model that says it filed
      // five things cannot make that true, and this is a number the user acts on.
      const filed = Math.max(0, before - after)

      const degraded: string[] = []
      if (result.failed) degraded.push(result.failed)
      if (result.denials > 0) {
        degraded.push(
          `${result.denials} tool call${result.denials === 1 ? ' was' : 's were'} denied, so ` +
            `some captures may not have been examined.`
        )
      }

      return {
        ok: result.failed === null,
        cancelled: result.failed === null && filed === 0 && after === before && !result.summary,
        filed,
        needsYou: after,
        summary: result.summary || 'The sort produced no summary.',
        duration_ms: Date.now() - started,
        ...(degraded.length > 0 ? { degraded: degraded.join(' ') } : {}),
      }
    },
  }
}

export type SortInboxRepository = ReturnType<typeof createSortInboxRepository>
