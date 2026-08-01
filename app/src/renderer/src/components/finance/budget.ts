import { UNCATEGORISED } from '@shared/types'
import type { CategorySpend, DateString, Purchase } from '@shared/types'

/**
 * Finance display logic. Deliberately React-free so it can be tested directly
 * (`test/finance-ui-*.test.ts` runs in the node environment).
 *
 * THE RULE THIS FILE EXISTS TO HOLD: over budget is GOLD, never red. Red in this app
 * means "this action destroys something". Spending more than you planned is a fact about
 * the month, not damage, and nothing here may return an alarming token.
 */

/** Re-exported so finance components have one import for display concerns. */
export { UNCATEGORISED }

export function isUncategorised(category: string): boolean {
  return category.trim().toLowerCase() === UNCATEGORISED
}

// ---------------------------------------------------------------------------
// months
// ---------------------------------------------------------------------------

/** `YYYY-MM` for a local date. Never derived from `toISOString()`. */
export function monthKeyOf(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/** The `YYYY-MM` a `YYYY-MM-DD` falls in. */
export function monthKeyOfDate(date: DateString): string {
  return date.slice(0, 7)
}

export function isMonthKey(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}

/** Step a `YYYY-MM` by whole months. */
export function shiftMonth(month: string, delta: number): string {
  const year = Number(month.slice(0, 4))
  const index = Number(month.slice(5, 7)) - 1 + delta
  const shifted = new Date(year, index, 1)
  return monthKeyOf(shifted)
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

/** `August` in the current year, `August 2025` otherwise. */
export function monthLabel(month: string, now: Date = new Date()): string {
  const year = Number(month.slice(0, 4))
  const name = MONTH_NAMES[Number(month.slice(5, 7)) - 1] ?? month
  return year === now.getFullYear() ? name : `${name} ${year}`
}

/** The card meta line from the comp: "August, so far" for the current month. */
export function monthMeta(month: string, now: Date = new Date()): string {
  return month === monthKeyOf(now) ? `${monthLabel(month, now)}, so far` : monthLabel(month, now)
}

// ---------------------------------------------------------------------------
// money
// ---------------------------------------------------------------------------

const formatterCache = new Map<string, Intl.NumberFormat>()

function currencyFormatter(currency: string, fractionDigits: number): Intl.NumberFormat | null {
  const key = `${currency}:${fractionDigits}`
  const cached = formatterCache.get(key)
  if (cached) return cached
  try {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    })
    formatterCache.set(key, formatter)
    return formatter
  } catch {
    // A hand-edited `settings.finance.currency` of "dollars" must not white-screen
    // the surface. Fall back to a plain number below.
    return null
  }
}

/**
 * `$184`, `$12.40`, `−$50.00`.
 *
 * Whole amounts drop the cents, matching the comp's `$184 / 250`. Anything with cents
 * keeps both digits. The sign uses a real minus (U+2212), not a hyphen, because income
 * and refunds are negative amounts and they sit in a column of numerals.
 */
export function formatMoney(amount: number, currency = 'USD'): string {
  const rounded = Number(amount.toFixed(2))
  const digits = Number.isInteger(rounded) ? 0 : 2
  const formatter = currencyFormatter(currency, digits)
  const text = formatter
    ? formatter.format(Math.abs(rounded))
    : `${currency} ${Math.abs(rounded).toFixed(digits)}`
  return rounded < 0 ? `−${text}` : text
}

/** The bare limit, as the comp writes it — `$184 / 250`, no second currency symbol. */
export function formatLimit(limit: number): string {
  const rounded = Number(limit.toFixed(2))
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2)
}

/** The right-hand figure on a budget row. */
export function formatSpendMeta(row: CategorySpend, currency = 'USD'): string {
  if (row.limit === null) return formatMoney(row.spent, currency)
  return `${formatMoney(row.spent, currency)} / ${formatLimit(row.limit)}`
}

// ---------------------------------------------------------------------------
// bars
// ---------------------------------------------------------------------------

/**
 * How much of the track to fill, 0–1.
 *
 * Clamped at both ends. A net-refunded category (negative spend) reads as empty rather
 * than as a bar running backwards, and an over-limit category fills the track exactly
 * once — the overage is stated in words beside it instead of overflowing the row.
 */
export function barFraction(row: CategorySpend): number {
  if (row.limit === null || row.limit <= 0) return 0
  const fraction = row.fraction ?? row.spent / row.limit
  if (!Number.isFinite(fraction)) return 0
  return Math.min(1, Math.max(0, fraction))
}

/** True when a limit exists and has been passed. Gold, never red. */
export function isOverLimit(row: CategorySpend): boolean {
  return row.limit !== null && row.limit > 0 && row.spent > row.limit
}

/** Dollars past the limit, or 0. */
export function overageOf(row: CategorySpend): number {
  if (!isOverLimit(row) || row.limit === null) return 0
  return Number((row.spent - row.limit).toFixed(2))
}

/**
 * The one line of copy an over-limit row adds. Factual, past tense, no exclamation, no
 * verb telling the user what to do about it.
 */
export function overageNote(row: CategorySpend, currency = 'USD'): string | null {
  const over = overageOf(row)
  return over > 0 ? `${formatMoney(over, currency)} over` : null
}

/** Percent for the aria-valuenow / screen-reader text. Uncapped, so "124%" is sayable. */
export function spentPercent(row: CategorySpend): number | null {
  if (row.limit === null || row.limit <= 0) return null
  return Math.round((row.spent / row.limit) * 100)
}

// ---------------------------------------------------------------------------
// grouping
// ---------------------------------------------------------------------------

export interface SpendGroups {
  /** In settings, with a limit — the rows that get progress bars. */
  budgeted: CategorySpend[]
  /** In settings, no limit — tracked on purpose, but uncapped. Amount only. */
  uncapped: CategorySpend[]
  /** Spent in a category settings has never heard of. Amount only, below the rule. */
  offBudget: CategorySpend[]
  /** The `uncategorised` line, if any money landed there. Always last. */
  uncategorised: CategorySpend | null
  /** Every row, including income and off-budget. This is net, not gross. */
  totalSpent: number
  /**
   * Spend in the capped categories only — the number that is actually comparable to
   * `totalLimit`. Summing everything against the planned total would compare a month's
   * net cash flow to three grocery limits, which is not a real comparison.
   */
  budgetedSpent: number
  /** Sum of the limits that exist, or null when nothing is capped yet. */
  totalLimit: number | null
  overCount: number
  /** True when any category nets negative — income or a refund landed this month. */
  hasIncome: boolean
}

/**
 * Split `finance.monthSummary()` into the shape the card draws.
 *
 * `categoryNames` is what is actually in `settings.finance.categories`. It is the only
 * way to tell a deliberately-uncapped category from one the user has never defined —
 * `CategorySpend.limit` is null for both.
 */
export function groupSpend(
  rows: readonly CategorySpend[],
  categoryNames: readonly string[]
): SpendGroups {
  const known = new Set(categoryNames.map((name) => name.trim().toLowerCase()))

  const budgeted: CategorySpend[] = []
  const uncapped: CategorySpend[] = []
  const offBudget: CategorySpend[] = []
  let uncategorised: CategorySpend | null = null
  let totalSpent = 0
  let budgetedSpent = 0
  let limitTotal = 0
  let anyLimit = false
  let overCount = 0
  let hasIncome = false

  for (const row of rows) {
    totalSpent += row.spent
    if (row.spent < 0) hasIncome = true
    if (row.limit !== null) {
      limitTotal += row.limit
      budgetedSpent += row.spent
      anyLimit = true
    }
    if (isOverLimit(row)) overCount += 1

    if (isUncategorised(row.category) && !known.has(UNCATEGORISED)) {
      uncategorised = row
    } else if (row.limit !== null) {
      budgeted.push(row)
    } else if (known.has(row.category.trim().toLowerCase())) {
      uncapped.push(row)
    } else {
      offBudget.push(row)
    }
  }

  return {
    budgeted,
    uncapped,
    offBudget,
    uncategorised,
    totalSpent: Number(totalSpent.toFixed(2)),
    budgetedSpent: Number(budgetedSpent.toFixed(2)),
    totalLimit: anyLimit ? Number(limitTotal.toFixed(2)) : null,
    overCount,
    hasIncome,
  }
}

/** True when there is nothing at all to draw — no categories AND no spend. */
export function isFirstRun(rows: readonly CategorySpend[], categoryNames: readonly string[]): boolean {
  return categoryNames.length === 0 && rows.length === 0
}

// ---------------------------------------------------------------------------
// category names
// ---------------------------------------------------------------------------

/**
 * Display a user-defined category name. Only the first character is touched, so
 * "Coffee & tea" and "CMU dining" survive exactly as typed.
 */
export function categoryLabel(name: string): string {
  const trimmed = name.trim()
  if (trimmed === '') return 'Uncategorised'
  if (isUncategorised(trimmed)) return 'Uncategorised'
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

/** Case-insensitive duplicate check for the category editor. */
export function nameIsTaken(
  name: string,
  existing: readonly { name: string }[],
  ignoreIndex = -1
): boolean {
  const needle = name.trim().toLowerCase()
  return existing.some(
    (entry, index) => index !== ignoreIndex && entry.name.trim().toLowerCase() === needle
  )
}

// ---------------------------------------------------------------------------
// the purchase log
// ---------------------------------------------------------------------------

export interface PurchaseGroup {
  date: DateString
  purchases: Purchase[]
  /** Net for the day. Negative when refunds outweigh spending. */
  total: number
}

/** Newest day first; within a day, newest capture first. */
export function groupPurchasesByDate(purchases: readonly Purchase[]): PurchaseGroup[] {
  const byDate = new Map<DateString, Purchase[]>()
  for (const purchase of purchases) {
    const bucket = byDate.get(purchase.date)
    if (bucket) bucket.push(purchase)
    else byDate.set(purchase.date, [purchase])
  }

  return [...byDate.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, rows]) => ({
      date,
      purchases: [...rows].sort((a, b) => b.created_at - a.created_at),
      total: Number(rows.reduce((sum, row) => sum + row.amount, 0).toFixed(2)),
    }))
}

export function purchasesInMonth(purchases: readonly Purchase[], month: string): Purchase[] {
  return purchases.filter((purchase) => monthKeyOfDate(purchase.date) === month)
}

/**
 * Parse what the user typed into the amount field. Accepts `12`, `12.40`, `$12.40`,
 * `1,240`, and a leading `-` or `−` for income and refunds.
 *
 * Returns null for anything unparseable so the caller can decline to save without
 * inventing a number.
 */
export function parseAmount(input: string): number | null {
  const cleaned = input.trim().replace(/[\s,$ ]/g, '').replace(/−/g, '-')
  if (cleaned === '' || cleaned === '-') return null
  if (!/^-?\d*\.?\d+$/.test(cleaned)) return null
  const value = Number(cleaned)
  return Number.isFinite(value) ? Number(value.toFixed(2)) : null
}
