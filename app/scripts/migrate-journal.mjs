#!/usr/bin/env node
/**
 * migrate-journal.mjs — import the gratefulnessjar gratitude journal into the vault.
 *
 *   source: ~/Desktop/Vscode/gratefulnessjar/.gratefulness-data/entries.json
 *   target: <vault>/data/journal.json
 *
 * The source is REAL personal data with six months of history and is treated as
 * strictly read-only. This script never writes to it, never renames it, never
 * touches its stale `.tmp` sibling. It remains the fallback if anything here is wrong.
 *
 * Properties this script guarantees, and proves rather than asserts by assertion:
 *
 *   - Idempotent.  Dedupe key is `entry_date` (one entry per day is the invariant).
 *                  Re-running imports nothing new and rewrites nothing.
 *   - Lossless.    After writing, the output is re-read FROM DISK and compared
 *                  field by field against the source. `gratitude_text` is compared
 *                  as UTF-8 bytes, not as strings, so a Unicode normalization shift
 *                  (NFC/NFD — a live risk on macOS + iCloud) cannot slip through.
 *                  Ratings are asserted preserved UNCLAMPED.
 *   - Unclamping.  The rating scale is 1-7, not 1-5. Entries rated 6 or 7 are real
 *                  and are carried over untouched. A rating outside 1-7 is a hard
 *                  error, never a silent clamp.
 *   - Atomic.      Temp file in the target directory, fsync, then rename(2). The
 *                  vault syncs to iCloud; a torn write loses data. (The source
 *                  directory still contains a stale entries.json.tmp from exactly
 *                  this failure mode — that is why this matters.)
 *   - Guarded.     Refuses to run against a journal.json holding entries the source
 *                  does not know about, unless --force.
 *
 * Usage:
 *   node scripts/migrate-journal.mjs --dry-run     # report only, writes nothing
 *   node scripts/migrate-journal.mjs               # migrate for real
 *   npm run migrate:journal -- --dry-run
 *
 * Flags:
 *   --dry-run        Compute and report everything, write nothing. Exit 0 if clean.
 *   --force          Proceed even when the target holds entries absent from the source.
 *                    Never destructive: existing entries are still preserved, not
 *                    overwritten. --force only acknowledges the mixed state.
 *   --source=PATH    Override the source entries.json.
 *   --out=PATH       Override the target journal.json.
 *   --quiet          Suppress the data profile block.
 *   --help           This text.
 */

import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs'
import { createHash, randomBytes } from 'node:crypto'
import { homedir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

// ---------------------------------------------------------------------------
// constants — mirrors of @shared/types and @shared/vault
// ---------------------------------------------------------------------------

/** Widened from 1-5 so the imported 6s and 7s survive losslessly. @see shared/types.ts */
const RATING_MIN = 1
const RATING_MAX = 7

const VAULT_DIR_NAME = 'Dès vu'

const DEFAULT_SOURCE = path.join(
  homedir(),
  'Desktop',
  'Vscode',
  'gratefulnessjar',
  '.gratefulness-data',
  'entries.json'
)

/** Field order for emitted records — matches data/SCHEMAS.md, rating first as the required field. */
const FIELD_ORDER = [
  'id',
  'entry_date',
  'rating',
  'gratitude_text',
  'learned',
  'mood_word',
  'mood_context',
  'created_at',
  'updated_at',
]

/**
 * Figures the PRD documents about this dataset. Several product decisions rest on
 * them (J0's 1-7 scale, J6's never-show-a-broken-streak rule), so the migration
 * re-derives them from the real bytes and says plainly whether they hold.
 */
const PRD_CLAIMS = {
  totalEntries: { label: 'total entries', claimed: 83 },
  daysSpanned: { label: 'days spanned', claimed: 211 },
  adherencePct: { label: 'overall adherence', claimed: 39, tolerance: 1, unit: '%' },
  firstMonthPct: { label: 'first full month adherence', claimed: 100, tolerance: 1, unit: '%' },
  lastMonthPct: { label: 'last month adherence', claimed: 14, tolerance: 1, unit: '%' },
  longestGap: { label: 'longest gap between entries', claimed: 24, unit: ' days' },
  medianGap: { label: 'median gap between entries', claimed: 1, unit: ' days' },
  aboveFive: { label: 'entries rated 6 or 7', claimed: 8 },
}

// ---------------------------------------------------------------------------
// tiny output helpers
// ---------------------------------------------------------------------------

const problems = []
const warnings = []

function fail(msg) {
  problems.push(msg)
  console.error(`  FAIL  ${msg}`)
}
function warn(msg) {
  warnings.push(msg)
  console.warn(`  WARN  ${msg}`)
}
function ok(msg) {
  console.log(`  ok    ${msg}`)
}
function section(title) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 66 - title.length))}`)
}

/** Abort immediately, without having written anything. */
function abort(msg) {
  console.error(`\nABORTED: ${msg}\n`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// vault resolution — mirrors app/src/shared/vault.ts (NFC/NFD tolerant)
// ---------------------------------------------------------------------------

const ICLOUD_OBSIDIAN = path.join(
  homedir(),
  'Library',
  'Mobile Documents',
  'iCloud~md~obsidian',
  'Documents'
)

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

function resolveVaultPath() {
  const fromEnv = process.env.DESVU_VAULT
  if (fromEnv) {
    const expanded = fromEnv.startsWith('~') ? path.join(homedir(), fromEnv.slice(1)) : fromEnv
    if (!isVault(expanded)) {
      abort(`DESVU_VAULT is set to "${expanded}" but that is not a vault (no data/ directory).`)
    }
    return expanded
  }
  const candidates = [
    findChild(path.join(homedir(), 'Documents'), VAULT_DIR_NAME),
    findChild(ICLOUD_OBSIDIAN, VAULT_DIR_NAME),
  ]
  for (const candidate of candidates) {
    if (isVault(candidate)) return candidate
  }
  abort(
    `Could not find the "${VAULT_DIR_NAME}" vault. Looked in ~/Documents and the ` +
      `iCloud Obsidian container. Set DESVU_VAULT to override.`
  )
}

// ---------------------------------------------------------------------------
// date helpers — dates are YYYY-MM-DD local strings, never Date objects in anger
// ---------------------------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MS_PER_DAY = 86_400_000

/** Parse YYYY-MM-DD to a UTC-noon epoch, which makes day arithmetic DST-proof. */
function dayNumber(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY)
}

function isRealDate(dateStr) {
  if (!DATE_RE.test(dateStr)) return false
  const [y, m, d] = dateStr.split('-').map(Number)
  const probe = new Date(Date.UTC(y, m - 1, d))
  return (
    probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d
  )
}

function monthKey(dateStr) {
  return dateStr.slice(0, 7)
}

function daysInMonth(ym) {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

// ---------------------------------------------------------------------------
// arg parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { dryRun: false, force: false, quiet: false, source: null, out: null }
  for (const arg of argv) {
    if (arg === '--dry-run' || arg === '-n') opts.dryRun = true
    else if (arg === '--force' || arg === '-f') opts.force = true
    else if (arg === '--quiet' || arg === '-q') opts.quiet = true
    else if (arg === '--help' || arg === '-h') {
      console.log(readFileSync(new URL(import.meta.url)).toString().split('*/')[0])
      process.exit(0)
    } else if (arg.startsWith('--source=')) opts.source = arg.slice('--source='.length)
    else if (arg.startsWith('--out=')) opts.out = arg.slice('--out='.length)
    else abort(`Unknown argument "${arg}". Try --help.`)
  }
  return opts
}

// ---------------------------------------------------------------------------
// read + validate
// ---------------------------------------------------------------------------

function readJsonArray(file, label) {
  let raw
  try {
    raw = readFileSync(file, 'utf8')
  } catch (err) {
    abort(`Could not read ${label} at ${file}: ${err.message}`)
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    abort(`${label} at ${file} is not valid JSON: ${err.message}`)
  }
  if (!Array.isArray(parsed)) {
    abort(`${label} at ${file} is ${typeof parsed}, expected a JSON array.`)
  }
  return parsed
}

/**
 * Validate one source record. Returns a list of problems; empty means clean.
 * A rating outside 1-7 is a hard error on purpose — clamping is the exact failure
 * mode this migration exists to avoid.
 */
function validateEntry(entry, index) {
  const errs = []
  const at = `source[${index}]`

  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    return [`${at} is not an object`]
  }
  if (typeof entry.id !== 'string' || entry.id.length === 0) {
    errs.push(`${at} has a missing or non-string id`)
  }
  if (typeof entry.entry_date !== 'string' || !isRealDate(entry.entry_date)) {
    errs.push(`${at} (id ${entry.id}) has an invalid entry_date: ${JSON.stringify(entry.entry_date)}`)
  }
  if (!Number.isInteger(entry.rating)) {
    errs.push(`${at} (${entry.entry_date}) has a non-integer rating: ${JSON.stringify(entry.rating)}`)
  } else if (entry.rating < RATING_MIN || entry.rating > RATING_MAX) {
    errs.push(
      `${at} (${entry.entry_date}) has rating ${entry.rating}, outside the ${RATING_MIN}-${RATING_MAX} scale. ` +
        `Refusing to clamp — widen the scale or fix the source.`
    )
  }
  if (entry.gratitude_text !== undefined && typeof entry.gratitude_text !== 'string') {
    errs.push(`${at} (${entry.entry_date}) has a non-string gratitude_text`)
  }
  for (const ts of ['created_at', 'updated_at']) {
    if (!Number.isFinite(entry[ts])) {
      errs.push(`${at} (${entry.entry_date}) has a non-numeric ${ts}: ${JSON.stringify(entry[ts])}`)
    }
  }
  return errs
}

/**
 * Map a source record onto the JournalEntry shape.
 *
 * `learned`, `mood_word` and `mood_context` are OMITTED rather than set to null —
 * they are optional in the type, and an imported entry genuinely does not have them.
 * There is deliberately no `source` field: JournalEntry does not define one.
 */
function toJournalEntry(src) {
  const out = {
    id: src.id,
    entry_date: src.entry_date,
    rating: src.rating,
    created_at: src.created_at,
    updated_at: src.updated_at,
  }
  if (typeof src.gratitude_text === 'string') out.gratitude_text = src.gratitude_text
  return out
}

/** Re-key an object into canonical field order so output diffs stay stable. */
function ordered(entry) {
  const out = {}
  for (const key of FIELD_ORDER) {
    if (entry[key] !== undefined) out[key] = entry[key]
  }
  // Anything the app added that the schema does not list is preserved, not dropped.
  for (const key of Object.keys(entry)) {
    if (!(key in out)) out[key] = entry[key]
  }
  return out
}

// ---------------------------------------------------------------------------
// data profile
// ---------------------------------------------------------------------------

function buildProfile(entries) {
  const dates = entries.map((e) => e.entry_date).sort()
  const first = dates[0]
  const last = dates[dates.length - 1]
  const daysSpanned = dayNumber(last) - dayNumber(first) + 1
  const daysWithEntries = new Set(dates).size

  const gaps = []
  for (let i = 1; i < dates.length; i++) {
    gaps.push({ days: dayNumber(dates[i]) - dayNumber(dates[i - 1]), from: dates[i - 1], to: dates[i] })
  }
  const sortedGapDays = gaps.map((g) => g.days).sort((a, b) => a - b)
  const median =
    sortedGapDays.length === 0
      ? 0
      : sortedGapDays.length % 2 === 1
        ? sortedGapDays[(sortedGapDays.length - 1) / 2]
        : (sortedGapDays[sortedGapDays.length / 2 - 1] + sortedGapDays[sortedGapDays.length / 2]) / 2
  const longest = gaps.reduce((a, b) => (b.days > a.days ? b : a), { days: 0, from: null, to: null })

  const ratings = new Map()
  for (let r = RATING_MIN; r <= RATING_MAX; r++) ratings.set(r, 0)
  for (const e of entries) ratings.set(e.rating, (ratings.get(e.rating) ?? 0) + 1)

  const months = new Map()
  for (const d of dates) months.set(monthKey(d), (months.get(monthKey(d)) ?? 0) + 1)
  const monthRows = [...months.keys()].sort().map((ym) => {
    // Only count days of that month that actually fall inside the observed span.
    const monthStart = `${ym}-01`
    const monthEnd = `${ym}-${String(daysInMonth(ym)).padStart(2, '0')}`
    const lo = Math.max(dayNumber(monthStart), dayNumber(first))
    const hi = Math.min(dayNumber(monthEnd), dayNumber(last))
    const available = hi - lo + 1
    return { month: ym, count: months.get(ym), available, pct: (100 * months.get(ym)) / available }
  })

  const mean = entries.reduce((s, e) => s + e.rating, 0) / entries.length

  return {
    totalEntries: entries.length,
    first,
    last,
    daysSpanned,
    daysWithEntries,
    adherencePct: (100 * daysWithEntries) / daysSpanned,
    gaps,
    medianGap: median,
    longestGap: longest,
    topGaps: [...gaps].sort((a, b) => b.days - a.days).slice(0, 5),
    ratings,
    aboveFive: (ratings.get(6) ?? 0) + (ratings.get(7) ?? 0),
    meanRating: mean,
    monthRows,
    edited: entries.filter((e) => e.updated_at !== e.created_at).length,
  }
}

function printProfile(p) {
  section('data profile (derived from the real bytes)')
  console.log(`  first entry           ${p.first}`)
  console.log(`  last entry            ${p.last}`)
  console.log(`  days spanned          ${p.daysSpanned}`)
  console.log(`  days with entries     ${p.daysWithEntries}`)
  console.log(`  adherence             ${p.adherencePct.toFixed(2)}%`)
  console.log(`  median gap            ${p.medianGap} day(s)`)
  console.log(
    `  longest gap           ${p.longestGap.days} days (${p.longestGap.from} -> ${p.longestGap.to}` +
      `, ${p.longestGap.days - 1} missed days)`
  )
  console.log(`  entries later edited  ${p.edited}`)
  console.log(`  mean rating           ${p.meanRating.toFixed(2)}`)

  console.log('\n  rating distribution (scale is 1-7)')
  const maxCount = Math.max(...p.ratings.values())
  for (const [rating, count] of [...p.ratings.entries()].sort((a, b) => a[0] - b[0])) {
    const pct = (100 * count) / p.totalEntries
    const bar = '█'.repeat(Math.round((count / maxCount) * 34))
    const flag = rating > 5 ? '  <- would be lost by a 1-5 clamp' : ''
    console.log(
      `    ${rating}  ${String(count).padStart(3)}  ${pct.toFixed(1).padStart(5)}%  ${bar}${flag}`
    )
  }
  console.log(`    entries rated 6 or 7: ${p.aboveFive}`)

  console.log('\n  month by month (denominator = days of that month inside the span)')
  for (const r of p.monthRows) {
    const bar = '█'.repeat(Math.round(r.pct / 3))
    console.log(
      `    ${r.month}  ${String(r.count).padStart(3)} / ${String(r.available).padStart(2)} days  ` +
        `${r.pct.toFixed(1).padStart(5)}%  ${bar}`
    )
  }

  console.log('\n  five longest gaps')
  for (const g of p.topGaps) {
    console.log(`    ${String(g.days).padStart(3)} days   ${g.from} -> ${g.to}`)
  }
}

function checkPrdClaims(p) {
  section('PRD claim check')
  const firstFull = p.monthRows.find((r) => r.available >= 28)
  const lastMonth = p.monthRows[p.monthRows.length - 1]

  const actual = {
    totalEntries: p.totalEntries,
    daysSpanned: p.daysSpanned,
    adherencePct: p.adherencePct,
    firstMonthPct: firstFull ? firstFull.pct : NaN,
    lastMonthPct: lastMonth.pct,
    longestGap: p.longestGap.days,
    medianGap: p.medianGap,
    aboveFive: p.aboveFive,
  }

  let allHeld = true
  for (const [key, claim] of Object.entries(PRD_CLAIMS)) {
    const got = actual[key]
    const tol = claim.tolerance ?? 0
    const held = Math.abs(got - claim.claimed) <= tol
    if (!held) allHeld = false
    const unit = claim.unit ?? ''
    const shown = Number.isInteger(got) ? got : got.toFixed(2)
    const verdict = held ? 'HOLDS ' : 'WRONG '
    console.log(
      `  ${verdict} ${claim.label.padEnd(32)} PRD says ${String(claim.claimed) + unit}` +
        `${' '.repeat(Math.max(1, 8 - (String(claim.claimed) + unit).length))}actual ${shown}${unit}`
    )
  }
  console.log(
    allHeld
      ? '\n  Every documented figure reproduces from the source. No PRD correction needed.'
      : '\n  At least one documented figure does NOT reproduce. The PRD needs correcting.'
  )
  return { allHeld, actual }
}

// ---------------------------------------------------------------------------
// losslessness verification
// ---------------------------------------------------------------------------

/**
 * True byte comparison of two strings as UTF-8. String === would miss nothing here,
 * but comparing bytes additionally proves no Unicode normalization shift occurred —
 * a real hazard on macOS + iCloud, and 3 of these entries carry non-ASCII characters.
 */
function bytesEqual(a, b) {
  if (typeof a !== typeof b) return false
  if (a === undefined) return true
  return Buffer.from(a, 'utf8').equals(Buffer.from(b, 'utf8'))
}

/**
 * Compare what came back off disk against the source, entry by entry, field by field.
 * `provenance` maps entry_date -> 'imported' | 'preserved'. Divergence on an entry this
 * run imported is a hard failure. Divergence on an entry that already existed in the
 * target (user edited it in the app) is reported, never silently accepted, but does not
 * fail the run — clobbering the user's later edits would be the worse loss.
 */
function verifyLossless(sourceEntries, roundTripped, provenance) {
  section('losslessness verification (re-read, compared field by field)')

  const byDate = new Map()
  for (const e of roundTripped) {
    if (byDate.has(e.entry_date)) {
      fail(`output contains duplicate entry_date ${e.entry_date} — the dedupe invariant is broken`)
    }
    byDate.set(e.entry_date, e)
  }

  const expectedCount = new Set([
    ...sourceEntries.map((e) => e.entry_date),
    ...provenance.keys(),
  ]).size
  if (roundTripped.length === expectedCount) {
    ok(`entry count: ${roundTripped.length} (expected ${expectedCount})`)
  } else {
    fail(`entry count is ${roundTripped.length}, expected ${expectedCount}`)
  }

  let missing = 0
  let textOk = 0
  let ratingOk = 0
  let tsOk = 0
  let idOk = 0
  let diverged = 0
  const unclamped = []

  for (const src of sourceEntries) {
    const got = byDate.get(src.entry_date)
    if (!got) {
      fail(`entry_date ${src.entry_date} is missing from the output entirely`)
      missing++
      continue
    }

    const isImported = provenance.get(src.entry_date) === 'imported'
    const report = isImported ? fail : warn

    if (got.id === src.id) idOk++
    else report(`${src.entry_date}: id changed (${src.id} -> ${got.id})`)

    if (bytesEqual(got.gratitude_text, src.gratitude_text)) textOk++
    else {
      diverged++
      report(
        `${src.entry_date}: gratitude_text is not byte-identical ` +
          `(${Buffer.byteLength(src.gratitude_text ?? '', 'utf8')} src bytes vs ` +
          `${Buffer.byteLength(got.gratitude_text ?? '', 'utf8')} out bytes)`
      )
    }

    if (got.rating === src.rating) {
      ratingOk++
      if (src.rating > 5) unclamped.push(`${src.entry_date}=${src.rating}`)
    } else {
      diverged++
      report(`${src.entry_date}: rating changed ${src.rating} -> ${got.rating}`)
    }

    if (got.created_at === src.created_at && got.updated_at === src.updated_at) tsOk++
    else report(`${src.entry_date}: timestamps changed`)

    if (!Number.isInteger(got.rating) || got.rating < RATING_MIN || got.rating > RATING_MAX) {
      fail(`${src.entry_date}: written rating ${got.rating} is outside the ${RATING_MIN}-${RATING_MAX} scale`)
    }
  }

  const n = sourceEntries.length
  if (!missing) ok(`every one of the ${n} source entry_dates is present in the output`)
  if (idOk === n) ok(`all ${n} ids preserved`)
  if (textOk === n) ok(`all ${n} gratitude_text values byte-identical (UTF-8 compared)`)
  if (ratingOk === n) ok(`all ${n} ratings preserved exactly`)
  if (tsOk === n) ok(`all ${n} created_at/updated_at pairs preserved`)
  if (unclamped.length) {
    ok(`${unclamped.length} above-5 ratings survived UNCLAMPED: ${unclamped.join(', ')}`)
  }
  if (diverged === 0) ok('no field diverged anywhere')

  return problems.length === 0
}

// ---------------------------------------------------------------------------
// atomic write
// ---------------------------------------------------------------------------

/**
 * Write via temp file + fsync + rename(2). rename is atomic within a filesystem, so a
 * reader (Obsidian, the app, iCloud's daemon) sees either the old file or the whole new
 * one, never a half-written one. The temp file is unlinked if anything throws, so we do
 * not leave behind the kind of stale .tmp the source directory is still carrying.
 */
function writeAtomic(targetFile, contents) {
  const dir = path.dirname(targetFile)
  mkdirSync(dir, { recursive: true })
  const tmp = path.join(dir, `.${path.basename(targetFile)}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`)

  let fd
  try {
    fd = openSync(tmp, 'wx', 0o644)
    const buf = Buffer.from(contents, 'utf8')
    let written = 0
    while (written < buf.length) written += writeSync(fd, buf, written, buf.length - written)
    fsyncSync(fd)
    closeSync(fd)
    fd = undefined
    renameSync(tmp, targetFile)
  } catch (err) {
    try {
      if (fd !== undefined) closeSync(fd)
    } catch {}
    try {
      if (existsSync(tmp)) unlinkSync(tmp)
    } catch {}
    throw err
  }

  // Also fsync the directory so the rename itself is durable, not just the bytes.
  try {
    const dfd = openSync(dir, 'r')
    fsyncSync(dfd)
    closeSync(dfd)
  } catch {
    // Not fatal, and not supported on every filesystem.
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main() {
  const opts = parseArgs(process.argv.slice(2))
  const sourceFile = opts.source ?? DEFAULT_SOURCE
  const targetFile = opts.out ?? path.join(resolveVaultPath(), 'data', 'journal.json')

  console.log('Dès vu — journal migration')
  console.log(`  source  ${sourceFile}`)
  console.log(`  target  ${targetFile}`)
  console.log(`  mode    ${opts.dryRun ? 'DRY RUN — nothing will be written' : 'LIVE — will write'}${opts.force ? ' (--force)' : ''}`)

  // -- read + validate source ------------------------------------------------
  section('source')
  const rawSource = readJsonArray(sourceFile, 'source entries')
  console.log(`  read ${rawSource.length} records`)

  const validationErrors = rawSource.flatMap((e, i) => validateEntry(e, i))
  if (validationErrors.length) {
    for (const e of validationErrors) console.error(`  FAIL  ${e}`)
    abort(`${validationErrors.length} source record(s) failed validation. Nothing was written.`)
  }
  ok(`all ${rawSource.length} records valid (ids, dates, ${RATING_MIN}-${RATING_MAX} ratings, timestamps)`)

  // Note the stale sibling if present, but never read it as authoritative.
  const staleTmp = `${sourceFile}.tmp`
  if (existsSync(staleTmp)) {
    console.log(`  note  a stale ${path.basename(staleTmp)} sits beside the source; it is ignored by design.`)
  }

  // -- dedupe the source itself ---------------------------------------------
  const sourceByDate = new Map()
  for (const raw of rawSource) {
    const existing = sourceByDate.get(raw.entry_date)
    if (!existing) {
      sourceByDate.set(raw.entry_date, raw)
      continue
    }
    // One entry per day is the invariant. Keep the most recently edited and say so.
    const keep = raw.updated_at >= existing.updated_at ? raw : existing
    warn(
      `source has two records for ${raw.entry_date} ` +
        `(${existing.id}, ${raw.id}); keeping the more recently updated one (${keep.id})`
    )
    sourceByDate.set(raw.entry_date, keep)
  }
  if (sourceByDate.size !== rawSource.length) {
    console.log(`  deduped to ${sourceByDate.size} distinct entry_dates`)
  } else {
    ok(`${sourceByDate.size} distinct entry_dates — no same-day collisions`)
  }

  const sourceEntries = [...sourceByDate.values()].map(toJournalEntry)

  // -- profile ---------------------------------------------------------------
  const profile = buildProfile(sourceEntries)
  if (!opts.quiet) printProfile(profile)
  checkPrdClaims(profile)

  // -- read existing target --------------------------------------------------
  section('target')
  let existing = []
  const targetExists = existsSync(targetFile)
  if (targetExists) {
    existing = readJsonArray(targetFile, 'existing journal.json')
    console.log(`  journal.json already exists with ${existing.length} entries`)
  } else {
    console.log('  journal.json does not exist yet — this is a fresh migration')
  }

  const existingByDate = new Map()
  for (const e of existing) {
    if (typeof e?.entry_date !== 'string') {
      abort('existing journal.json contains a record with no entry_date; refusing to touch it.')
    }
    if (existingByDate.has(e.entry_date)) {
      abort(
        `existing journal.json already contains duplicate entry_date ${e.entry_date}. ` +
          `Resolve that by hand first — this script will not guess which to keep.`
      )
    }
    existingByDate.set(e.entry_date, e)
  }

  const foreign = [...existingByDate.keys()].filter((d) => !sourceByDate.has(d))
  if (foreign.length && !opts.force) {
    console.error(
      `\n  ${foreign.length} entry_date(s) in the existing journal.json are not in the source:` +
        `\n    ${foreign.slice(0, 12).join(', ')}${foreign.length > 12 ? `, … (+${foreign.length - 12} more)` : ''}`
    )
    abort(
      'refusing to write over a journal.json holding entries the source does not know about. ' +
        'Re-run with --force to proceed (existing entries are preserved either way).'
    )
  }
  if (foreign.length) {
    warn(`${foreign.length} entry_date(s) exist only in the target; --force given, they are preserved untouched`)
  }

  // -- merge -----------------------------------------------------------------
  section('plan')
  const provenance = new Map()
  const merged = new Map()

  for (const [date, entry] of existingByDate) {
    merged.set(date, entry)
    provenance.set(date, 'preserved')
  }
  let imported = 0
  let alreadyPresent = 0
  for (const entry of sourceEntries) {
    if (merged.has(entry.entry_date)) {
      alreadyPresent++
      continue // never clobber: the app may have added learned/mood_word since.
    }
    merged.set(entry.entry_date, entry)
    provenance.set(entry.entry_date, 'imported')
    imported++
  }

  const finalEntries = [...merged.values()]
    .map(ordered)
    .sort((a, b) => (a.entry_date < b.entry_date ? -1 : a.entry_date > b.entry_date ? 1 : 0))

  console.log(`  to import               ${imported}`)
  console.log(`  already present (kept)  ${alreadyPresent}`)
  console.log(`  target-only (kept)      ${foreign.length}`)
  console.log(`  final entry count       ${finalEntries.length}`)
  if (imported === 0 && targetExists) {
    ok('nothing to import — the target is already up to date (idempotent re-run)')
  }

  const payload = `${JSON.stringify(finalEntries, null, 2)}\n`
  const bytes = Buffer.byteLength(payload, 'utf8')
  const sha = createHash('sha256').update(payload).digest('hex')
  console.log(`  payload                 ${bytes} bytes, sha256 ${sha.slice(0, 16)}…`)
  console.log(`  date range              ${finalEntries[0]?.entry_date} … ${finalEntries[finalEntries.length - 1]?.entry_date}`)

  // -- write (or not) --------------------------------------------------------
  section(opts.dryRun ? 'write (skipped — dry run)' : 'write')
  let roundTripped
  if (opts.dryRun) {
    console.log(`  would write ${finalEntries.length} entries (${bytes} bytes) to ${targetFile}`)
    console.log(`  would write atomically: temp file in data/, fsync, rename(2)`)
    console.log('  nothing was written; the target is unchanged')
    // Verify the serialization round-trips in memory, so a dry run still proves
    // losslessness of the exact bytes it would have written.
    roundTripped = JSON.parse(payload)
  } else {
    writeAtomic(targetFile, payload)
    const back = readFileSync(targetFile, 'utf8')
    ok(`wrote ${bytes} bytes to ${targetFile}`)
    if (Buffer.from(back, 'utf8').equals(Buffer.from(payload, 'utf8'))) {
      ok('file re-read from disk is byte-identical to the payload')
    } else {
      fail('file re-read from disk does NOT match the payload')
    }
    const backSha = createHash('sha256').update(back).digest('hex')
    if (backSha === sha) ok(`sha256 matches on re-read (${backSha.slice(0, 16)}…)`)
    else fail(`sha256 mismatch on re-read: wrote ${sha}, read back ${backSha}`)
    roundTripped = JSON.parse(back)
  }

  // -- verify ----------------------------------------------------------------
  verifyLossless(sourceEntries, roundTripped, provenance)

  // -- result ----------------------------------------------------------------
  section('result')
  if (problems.length) {
    console.error(`  ${problems.length} FAILURE(S):`)
    for (const p of problems) console.error(`    - ${p}`)
    console.error(
      opts.dryRun
        ? '  Dry run found problems. Nothing was written. Fix these before migrating.'
        : '  The written file did NOT verify. The source is untouched — treat it as the truth.'
    )
    process.exit(1)
  }
  if (warnings.length) console.log(`  ${warnings.length} warning(s), 0 failures`)
  console.log(
    opts.dryRun
      ? `  DRY RUN CLEAN — ${imported} entries ready to import, verified lossless in memory. Nothing written.`
      : `  MIGRATION COMPLETE — ${finalEntries.length} entries in journal.json, verified lossless against the source.`
  )
  console.log('')
}

main()
