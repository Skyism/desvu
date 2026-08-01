import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { brainDumpRepository } from '../src/main/repos/brainDumpRepository'
import { parseNote } from '../src/renderer/src/components/notes/parse'
import { createTempVault, dayOffset, type TempVault } from './helpers/vault'

/**
 * TWO WRITERS, ONE FILE FORMAT.
 *
 * `/sort-inbox` (`scripts/inbox_commit.py::apply_braindump`) and the app
 * (`brainDumpRepository.appendToThread`) both append dated blocks to the same thread
 * files. If they disagree about the shape, a thread starts alternating between two
 * layouts and the sort skill's same-day-merge stops finding the heading it wrote.
 *
 * These tests pin the app's output byte for byte, and — when python3 and the skill's own
 * scripts are on this machine — run the real script against an identical vault and diff
 * the two results rather than trusting a reading of the source.
 */

let vault: TempVault

beforeEach(async () => {
  vault = await createTempVault('braindump-append')
})

afterEach(async () => {
  await vault.dispose()
})

const THREAD = 'Brain Dump/School/malloc-lab.md'

/** Exactly what `apply_braindump` writes when it creates a thread. */
const PYTHON_CREATED = [
  '---',
  'topic: School',
  'created: 2026-07-14',
  'updated: 2026-07-14',
  'tags: [malloc, systems]',
  '---',
  '',
  '# Malloc lab',
  '',
  '## 2026-07-14',
  'The implicit free list is fine until you measure it.',
  '',
].join('\n')

const ADDITION = 'Segregated fits, then. Related: [[Systems design]].'

function read(relativePath: string): string {
  return readFileSync(vault.at(relativePath), 'utf8')
}

// ---------------------------------------------------------------------------
// the app's own output
// ---------------------------------------------------------------------------

describe('appending from the app', () => {
  it('adds a dated block to the existing file rather than making a new one', async () => {
    await vault.write(THREAD, PYTHON_CREATED)
    await brainDumpRepository.appendToThread(THREAD, ADDITION)

    // B1: one subject, one file. A file per day is the failure this feature exists to avoid.
    expect(await vault.ls('Brain Dump/School')).toEqual(['malloc-lab.md'])

    const today = dayOffset(0)
    expect(read(THREAD)).toBe(
      [
        '---',
        'topic: School',
        'created: 2026-07-14',
        `updated: ${today}`,
        'tags: [malloc, systems]',
        'title: Malloc lab',
        '---',
        '',
        '# Malloc lab',
        '',
        '## 2026-07-14',
        'The implicit free list is fine until you measure it.',
        '',
        `## ${today}`,
        ADDITION,
        '',
      ].join('\n')
    )
  })

  it('writes a shape Obsidian can render — fence, blank line, then the body', async () => {
    await vault.write(THREAD, PYTHON_CREATED)
    await brainDumpRepository.appendToThread(THREAD, ADDITION)
    const raw = read(THREAD)

    expect(raw.startsWith('---\n')).toBe(true)
    expect(raw).toMatch(/\n---\n\n/) // closing fence, then exactly one blank line
    expect(raw.endsWith('\n')).toBe(true)
    expect(raw).not.toMatch(/\n{3}/) // never three newlines in a row
    expect(raw).not.toMatch(/[ \t]+\n/) // no trailing whitespace on any line
  })

  it('joins a second same-day thought to that day rather than repeating the heading', async () => {
    await vault.write(THREAD, PYTHON_CREATED)
    await brainDumpRepository.appendToThread(THREAD, 'First today.')
    await brainDumpRepository.appendToThread(THREAD, 'Second today.')

    const today = dayOffset(0)
    const raw = read(THREAD)
    expect(raw.split(`## ${today}`)).toHaveLength(2)
    expect(raw).toContain('First today.\n\nSecond today.\n')
  })

  it('keeps the file parseable by this app’s own reader', async () => {
    await vault.write(THREAD, PYTHON_CREATED)
    await brainDumpRepository.appendToThread(THREAD, ADDITION)

    const thread = await brainDumpRepository.readThread(THREAD)
    expect(thread?.updated).toBe(dayOffset(0))

    const blocks = parseNote(read(THREAD))
    const headings = blocks.filter((block) => block.type === 'heading')
    expect(headings.map((block) => (block as { text: string }).text)).toEqual([
      'Malloc lab',
      '2026-07-14',
      dayOffset(0),
    ])
  })
})

// ---------------------------------------------------------------------------
// the real /sort-inbox script, side by side
// ---------------------------------------------------------------------------

function findSortInboxScripts(): string | null {
  const candidates = [
    path.join(homedir(), 'Documents', 'Dès vu'),
    path.join(
      homedir(),
      'Library',
      'Mobile Documents',
      'iCloud~md~obsidian',
      'Documents',
      'Dès vu'
    ),
  ]
  for (const root of candidates) {
    for (const form of [root, root.normalize('NFD')]) {
      const scripts = path.join(form, '.claude', 'skills', 'sort-inbox', 'scripts')
      if (existsSync(path.join(scripts, 'inbox_commit.py'))) return scripts
    }
  }
  return null
}

function hasPython(): boolean {
  try {
    execFileSync('python3', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const scripts = findSortInboxScripts()
const available = scripts !== null && hasPython()

/** `inbox_scan.fingerprint` — sha1 of the NFC, right-stripped raw line, first 12 hex. */
function fingerprint(rawLine: string): string {
  return createHash('sha1')
    .update(rawLine.replace(/\s+$/, '').normalize('NFC'), 'utf8')
    .digest('hex')
    .slice(0, 12)
}

describe.skipIf(!available)('byte compatibility with /sort-inbox', () => {
  /**
   * Run the real commit script against a vault, filing one thought into a thread. The
   * Inbox line is written here so the line and its fingerprint can never disagree — the
   * script's interlock rejects a plan whose line moved since the scan, correctly.
   */
  async function runSortInbox(
    target: TempVault,
    date: string,
    time: string,
    body: string
  ): Promise<void> {
    const line = `- [ ] ${time} · telegram · ${body}`
    await target.write(`Inbox/${date}.md`, `${line}\n`)
    const plan = {
      actions: [
        {
          file: `Inbox/${date}.md`,
          line: 1,
          fingerprint: fingerprint(line),
          created_at: new Date(`${date}T${time}:00`).getTime(),
          date,
          source: 'telegram',
          target: 'braindump',
          fields: {
            topic: 'School',
            thread: 'malloc-lab',
            title: 'Malloc lab',
            body,
          },
        },
      ],
    }

    execFileSync(
      'python3',
      [path.join(scripts as string, 'inbox_commit.py'), '--vault', target.root],
      { input: JSON.stringify(plan), stdio: ['pipe', 'pipe', 'pipe'] }
    )
  }

  it('produces the same file the sort skill would, modulo one frontmatter key', async () => {
    const today = dayOffset(0)

    // The app's append.
    await vault.write(THREAD, PYTHON_CREATED)
    await brainDumpRepository.appendToThread(THREAD, ADDITION)
    const fromApp = read(THREAD)

    // The sort skill's append, on an identical starting file.
    const python = await createTempVault('braindump-python')
    try {
      await python.write(THREAD, PYTHON_CREATED)
      await runSortInbox(python, today, '14:32', ADDITION)
      const fromSkill = readFileSync(python.at(THREAD), 'utf8')

      // Everything below the front matter is identical, byte for byte.
      const body = (raw: string): string => raw.slice(raw.indexOf('\n---\n', 3) + 5)
      expect(body(fromApp)).toBe(body(fromSkill))

      // KNOWN DIVERGENCE, reported to the orchestrator in
      // `.progress/braindump-synthesis.md`: `brainDumpRepository.toFrontmatter` always
      // writes `title:`, which `apply_braindump` never does. The skill preserves the key
      // once it exists, so the two converge after one app write — but the first app append
      // to a skill-created thread is not byte-identical. Fixing it is one line in
      // `src/main/repos/brainDumpRepository.ts`, which this workstream does not own.
      const lines = (raw: string): string[] => raw.split('\n')
      const extra = lines(fromApp).filter((line) => !lines(fromSkill).includes(line))
      expect(extra).toEqual(['title: Malloc lab'])
    } finally {
      await python.dispose()
      // The helper repoints DESVU_VAULT globally; put it back for the outer vault.
      process.env['DESVU_VAULT'] = vault.root
    }
  })

  it('lets the sort skill extend a file the app wrote, without reshaping it', async () => {
    const today = dayOffset(0)

    await vault.write(THREAD, PYTHON_CREATED)
    await brainDumpRepository.appendToThread(THREAD, ADDITION)
    const afterApp = read(THREAD)

    await runSortInbox(vault, today, '16:05', 'One more, later.')
    const afterSkill = read(THREAD)

    // The skill found the app's `## <today>` heading and extended that day's section
    // rather than starting a second one.
    expect(afterSkill.split(`## ${today}`)).toHaveLength(2)
    expect(afterSkill).toContain('One more, later.')

    // Nothing the app wrote was reshaped: the whole prefix survives verbatim, including
    // the `title:` key, and the file still ends cleanly.
    expect(afterSkill).toContain('title: Malloc lab')
    expect(afterSkill.startsWith(afterApp.slice(0, afterApp.indexOf('## 2026-07-14')))).toBe(true)
    expect(afterSkill.endsWith('\n')).toBe(true)
    expect(afterSkill).not.toMatch(/\n{3}/)

    // And the app still reads it as one thread with three dated blocks.
    const thread = await brainDumpRepository.readThread(THREAD)
    expect(thread?.title).toBe('Malloc lab')
    expect(thread?.updated).toBe(today)
  })

  it('round-trips: the app can append again on top of the skill’s work', async () => {
    const today = dayOffset(0)

    await vault.write(THREAD, PYTHON_CREATED)
    await runSortInbox(vault, today, '09:00', 'Skill first.')
    await brainDumpRepository.appendToThread(THREAD, 'App second.')

    const raw = read(THREAD)
    expect(raw.split(`## ${today}`)).toHaveLength(2)
    expect(raw.indexOf('Skill first.')).toBeLessThan(raw.indexOf('App second.'))
    expect(raw).not.toMatch(/\n{3}/)

    const blocks = parseNote(raw)
    expect(
      blocks
        .filter((block) => block.type === 'heading' && block.level === 2)
        .map((block) => (block as { text: string }).text)
    ).toEqual(['2026-07-14', today])
  })
})
