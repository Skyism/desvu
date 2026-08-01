#!/usr/bin/env node
/**
 * Seed a throwaway vault so the Today surface can be driven against real data.
 *
 *   node scripts/seed-dev.mjs [--out <dir>] [--now HH:MM]
 *   DESVU_VAULT="$(node scripts/seed-dev.mjs --print-path)" npx electron .
 *
 * THIS NEVER TOUCHES THE REAL VAULT. `~/Documents/Dès vu` holds six months of journal
 * entries and has no git remote to recover from, so the script refuses to write anywhere
 * whose path resolves inside it, and defaults to a directory under `os.tmpdir()`.
 *
 * What it writes, and why each piece is there:
 *
 *   · five calendar events at the comp's clock times, so the rail has real gaps
 *   · nine todos due today, deliberately more than the gaps can hold, so the overflow
 *     tray has something in it at any time of day
 *   · one overdue todo, for the T7 "N days late" treatment
 *   · two recurrence templates (a weekly and a daily), for T10
 *   · twenty-six completed `school` todos with actuals at ~1.5× estimate, which is one
 *     more than the confidence threshold — so `correctionFactors()` returns
 *     `confident: true` for school and false for the other two. That is the only way to
 *     see both halves of the T11 rule: the calibrated figure appears, and the two
 *     unconfident categories stay silent.
 */

import { mkdir, rm, writeFile } from 'node:fs/promises'
import { existsSync, realpathSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'

// ---------------------------------------------------------------------------
// arguments
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
const flag = (name, fallback = null) => {
  const index = args.indexOf(name)
  return index === -1 || index === args.length - 1 ? fallback : args[index + 1]
}

const OUT = path.resolve(flag('--out', path.join(tmpdir(), 'desvu-dev-vault')))
const PRINT_ONLY = args.includes('--print-path')
const KEEP = args.includes('--keep')

// ---------------------------------------------------------------------------
// the guard
// ---------------------------------------------------------------------------

/** Every place the real corpus could be, resolved through symlinks. */
function protectedRoots() {
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
  const roots = []
  for (const candidate of candidates) {
    for (const form of [candidate.normalize('NFC'), candidate.normalize('NFD')]) {
      if (!existsSync(form)) continue
      try {
        roots.push(realpathSync(form))
      } catch {
        roots.push(form)
      }
    }
  }
  return roots
}

function refuseIfReal(target) {
  const resolved = path.resolve(target)
  for (const root of protectedRoots()) {
    const normalizedRoot = root.normalize('NFC')
    const normalizedTarget = resolved.normalize('NFC')
    if (normalizedTarget === normalizedRoot || normalizedTarget.startsWith(normalizedRoot + path.sep)) {
      throw new Error(
        `Refusing to seed into the real vault (${root}). That directory holds live ` +
          `personal data and has no remote to recover from. Pass --out somewhere else.`
      )
    }
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const NOW = new Date()

function dateString(offsetDays = 0) {
  const date = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + offsetDays)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** Local ISO 8601 with the machine's real offset — what a calendar refresh would write. */
function isoAt(minutesSinceMidnight, offsetDays = 0) {
  const date = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + offsetDays)
  date.setHours(Math.floor(minutesSinceMidnight / 60), minutesSinceMidnight % 60, 0, 0)
  const tz = -date.getTimezoneOffset()
  const sign = tz >= 0 ? '+' : '-'
  const pad = (value) => String(Math.floor(Math.abs(value))).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:00` +
    `${sign}${pad(tz / 60)}:${pad(tz % 60)}`
  )
}

let counter = 0
const id = (prefix) => `${prefix}-${String(++counter).padStart(3, '0')}`

const TODAY = dateString(0)
const MIDNIGHT = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate()).getTime()

function todo(overrides) {
  const created = MIDNIGHT - 3_600_000
  return {
    id: id('todo'),
    text: 'Untitled',
    category: 'personal',
    priority: 2,
    estimate_minutes: 30,
    actual_minutes: null,
    due: TODAY,
    status: 'open',
    recurrence: null,
    recurrence_parent: null,
    tags: [],
    notes: '',
    source: 'app',
    created_at: created,
    updated_at: created,
    completed_at: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// the data
// ---------------------------------------------------------------------------

/** The comp's day: lab shift, lecture, research block, career fair, dinner. */
const EVENTS = [
  { title: 'Lab shift', start: 8 * 60, end: 9 * 60 + 30 },
  { title: '15-451 lecture', start: 10 * 60, end: 11 * 60 + 30 },
  { title: 'Research block', start: 12 * 60, end: 15 * 60 + 30 },
  { title: 'Career fair', start: 16 * 60 + 30, end: 18 * 60 + 30 },
  { title: 'Dinner with Priya', start: 19 * 60, end: 22 * 60 },
].map((event, index) => ({
  id: `evt-${index + 1}`,
  title: event.title,
  start: isoAt(event.start),
  end: isoAt(event.end),
  all_day: false,
}))

const OPEN_TODOS = [
  todo({ text: 'Email the Ramp recruiter', category: 'recruiting', priority: 1, estimate_minutes: 15 }),
  todo({ text: 'Finish the Jane Street OA', category: 'recruiting', priority: 0, estimate_minutes: 90 }),
  todo({ text: 'Rewrite resume bullets for infra roles', category: 'recruiting', priority: 2, estimate_minutes: 45 }),
  todo({ text: 'Problem set 3, first pass', category: 'school', priority: 1, estimate_minutes: 75 }),
  todo({ text: 'Skim the consensus chapter', category: 'school', priority: 2, estimate_minutes: 40 }),
  todo({ text: 'Grocery run', category: 'personal', priority: 3, estimate_minutes: 30 }),
  todo({ text: 'Fix the bike brake', category: 'personal', priority: 3, estimate_minutes: 20 }),
  todo({ text: 'Book the flight home', category: 'personal', priority: 2, estimate_minutes: 25 }),
  // Two days late, so the T7 treatment has something to render.
  todo({
    text: 'Send the recommendation-letter reminder',
    category: 'school',
    priority: 1,
    estimate_minutes: 10,
    due: dateString(-2),
  }),
]

/** Templates. `recurrence !== null` is what makes a todo a template. */
const TEMPLATES = [
  todo({
    text: 'Read 15-451 lecture notes',
    category: 'school',
    priority: 2,
    estimate_minutes: 40,
    due: dateString(-14),
    recurrence: { type: 'weekly', interval: 1, days: ['mon', 'wed', 'fri'] },
  }),
  todo({
    text: 'Call mom',
    category: 'personal',
    priority: 2,
    estimate_minutes: 15,
    due: dateString(-30),
    recurrence: { type: 'daily', interval: 1 },
  }),
]

/**
 * 26 completed school todos — one over the 25-sample threshold — with actuals at 1.5×.
 * School therefore reports `confident: true` with a factor near 1.5, and recruiting and
 * personal stay unconfident, which is what proves the UI declines to show them.
 */
const HISTORY = Array.from({ length: 26 }, (_, index) => {
  const estimate = 30 + (index % 4) * 15
  const completedAt = MIDNIGHT - (index + 1) * 86_400_000
  return todo({
    text: `Problem set ${index + 1}, marked up`,
    category: 'school',
    priority: 2,
    estimate_minutes: estimate,
    actual_minutes: Math.round(estimate * 1.5),
    due: dateString(-(index + 1)),
    status: 'done',
    created_at: completedAt - 7_200_000,
    updated_at: completedAt,
    completed_at: completedAt,
  })
})

/** A few completions in the other categories — under the threshold, on purpose. */
const THIN_HISTORY = [
  todo({
    text: 'Coffee chat with the Stripe recruiter',
    category: 'recruiting',
    estimate_minutes: 30,
    actual_minutes: 55,
    due: dateString(-3),
    status: 'done',
    completed_at: MIDNIGHT - 3 * 86_400_000,
  }),
  todo({
    text: 'Laundry',
    category: 'personal',
    estimate_minutes: 45,
    actual_minutes: 40,
    due: dateString(-1),
    status: 'done',
    completed_at: MIDNIGHT - 86_400_000,
  }),
]

const SETTINGS = {
  finance: {
    categories: [
      { name: 'Groceries', limit: 250 },
      { name: 'Coffee', limit: 60 },
    ],
    currency: 'USD',
    month_starts_on: 1,
  },
  nutrition: { calorie_target: null, protein_target_g: null, show_targets: false },
  todos: { default_priority: 2, default_estimate_minutes: 30 },
  library: { auto_archive_days: 30 },
  synthesis: { journal_access: 'full' },
}

const INBOX = [
  '- [ ] 07:42 · telegram · read later: raft paper follow-up thread',
  '- [ ] 08:15 · telegram · spent 12 lunch',
  '- [ ] 09:03 · telegram · todo fix the bike brake p3 20m personal',
].join('\n')

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  refuseIfReal(OUT)

  if (PRINT_ONLY) {
    process.stdout.write(OUT)
    return
  }

  if (!KEEP && existsSync(OUT)) await rm(OUT, { recursive: true, force: true })
  await mkdir(path.join(OUT, 'data'), { recursive: true })
  await mkdir(path.join(OUT, 'Inbox'), { recursive: true })

  const todos = [...OPEN_TODOS, ...TEMPLATES, ...HISTORY, ...THIN_HISTORY]

  const write = (relative, value) =>
    writeFile(path.join(OUT, relative), `${JSON.stringify(value, null, 2)}\n`, 'utf8')

  await write('data/todos.json', todos)
  await write('data/calendar.json', { events: EVENTS, last_refresh: Date.now() })
  await write('data/settings.json', SETTINGS)
  await writeFile(path.join(OUT, 'Inbox', `${TODAY}.md`), `${INBOX}\n`, 'utf8')

  const openCount = OPEN_TODOS.length
  const committed = EVENTS.reduce((total, event) => {
    const start = new Date(event.start)
    const end = new Date(event.end)
    return total + (end - start) / 60000
  }, 0)

  console.log(`seeded ${OUT}`)
  console.log(
    `  ${todos.length} todos (${openCount} due today, ${TEMPLATES.length} templates, ` +
      `${HISTORY.length + THIN_HISTORY.length} completed)`
  )
  console.log(`  ${EVENTS.length} calendar events · ${committed} committed minutes`)
  console.log(`  school correction factor is confident (${HISTORY.length} samples ≥ 25)`)
  console.log('')
  console.log(`  DESVU_VAULT="${OUT}" npx electron .`)
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
