import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { CategorySpend } from '@shared/types'

import { UNCATEGORISED as REPO_UNCATEGORISED, financeRepository } from '../src/main/repos/financeRepository'
import { settingsRepository } from '../src/main/repos/settingsRepository'
import {
  UNCATEGORISED,
  barFraction,
  categoryLabel,
  formatLimit,
  formatMoney,
  formatSpendMeta,
  groupPurchasesByDate,
  groupSpend,
  isFirstRun,
  isOverLimit,
  isUncategorised,
  monthKeyOf,
  monthLabel,
  monthMeta,
  nameIsTaken,
  overageNote,
  overageOf,
  parseAmount,
  shiftMonth,
  spentPercent,
} from '../src/renderer/src/components/finance/budget'
import { createTempVault, type TempVault } from './helpers/vault'

const row = (
  category: string,
  spent: number,
  limit: number | null
): CategorySpend => ({
  category,
  spent,
  limit,
  configured: category !== UNCATEGORISED,
  fraction: limit !== null && limit > 0 ? Number((spent / limit).toFixed(4)) : null,
})

// ---------------------------------------------------------------------------
// The rule this whole surface exists to hold.
// ---------------------------------------------------------------------------

describe('over budget is gold, never red', () => {
  const financeDir = path.resolve(import.meta.dirname, '../src/renderer/src/components/finance')
  const healthDir = path.resolve(import.meta.dirname, '../src/renderer/src/components/health')

  const sources = (dir: string): { file: string; text: string }[] =>
    readdirSync(dir)
      .filter((file) => file.endsWith('.ts') || file.endsWith('.tsx'))
      .map((file) => ({ file, text: readFileSync(path.join(dir, file), 'utf8') }))

  /**
   * Strip block comments and line comments. The rule is *documented* at length in these
   * files; what must not appear is the token being USED.
   */
  const code = (text: string): string =>
    text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it('never renders a danger token anywhere on either surface', () => {
    for (const dir of [financeDir, healthDir]) {
      for (const { file, text } of sources(dir)) {
        const body = code(text)
        expect.soft(body, `${file} must not use text-danger`).not.toMatch(/text-danger/)
        expect.soft(body, `${file} must not use bg-danger`).not.toMatch(/bg-danger/)
        expect.soft(body, `${file} must not use border-danger`).not.toMatch(/border-danger/)
        expect.soft(body, `${file} must not use Badge tone="danger"`).not.toMatch(
          /tone=["']danger["']/
        )
      }
    }
  })

  it('uses variant="destructive" only on controls that delete a record', () => {
    const uses: string[] = []
    for (const dir of [financeDir, healthDir]) {
      for (const { file, text } of sources(dir)) {
        if (/variant=["']destructive["']/.test(code(text))) uses.push(file)
      }
    }
    // Exactly the three dialogs with a Delete button, and nothing else.
    expect(uses.sort()).toEqual(['MealDialog.tsx', 'PurchaseDialog.tsx', 'WorkoutDialog.tsx'])
  })

  it('paints an over-limit row in accent, and states the overage without alarm', () => {
    const over = row('groceries', 312, 250)
    expect(isOverLimit(over)).toBe(true)
    // The bar fills exactly once. It does not overflow and it does not change hue.
    expect(barFraction(over)).toBe(1)
    expect(overageOf(over)).toBe(62)
    expect(overageNote(over)).toBe('$62 over')
    // No verb, no exclamation, no instruction.
    expect(overageNote(over)).not.toMatch(/[!]|you|reduce|stop|cut/i)
  })

  it('reports a percentage past 100 truthfully for assistive tech', () => {
    expect(spentPercent(row('groceries', 312, 250))).toBe(125)
    expect(spentPercent(row('coffee', 41, null))).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// bars
// ---------------------------------------------------------------------------

describe('barFraction', () => {
  it('clamps above the limit so the bar never overflows its track', () => {
    expect(barFraction(row('a', 500, 250))).toBe(1)
  })

  it('clamps a net refund to empty rather than drawing backwards', () => {
    expect(barFraction(row('a', -40, 250))).toBe(0)
  })

  it('is zero when there is no limit to measure against', () => {
    expect(barFraction(row('a', 90, null))).toBe(0)
    expect(barFraction(row('a', 90, 0))).toBe(0)
  })

  it('survives a fraction that is not finite', () => {
    expect(
      barFraction({ category: 'a', spent: 10, limit: 5, configured: true, fraction: Number.NaN })
    ).toBe(0)
  })
})

describe('isOverLimit', () => {
  it('is false at exactly the limit', () => {
    expect(isOverLimit(row('a', 250, 250))).toBe(false)
  })
  it('is false without a limit — there is nothing to be over', () => {
    expect(isOverLimit(row('a', 9000, null))).toBe(false)
  })
  it('is true past the limit', () => {
    expect(isOverLimit(row('a', 250.01, 250))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// money
// ---------------------------------------------------------------------------

describe('formatMoney', () => {
  it('drops cents on a whole amount, as the comp does', () => {
    expect(formatMoney(184)).toBe('$184')
  })
  it('keeps both digits when there are cents', () => {
    expect(formatMoney(12.4)).toBe('$12.40')
  })
  it('writes income and refunds with a real minus sign', () => {
    expect(formatMoney(-50)).toBe('−$50')
    expect(formatMoney(-12.5)).toBe('−$12.50')
  })
  it('honours a non-USD currency', () => {
    expect(formatMoney(184, 'EUR')).toBe('€184')
    expect(formatMoney(184, 'GBP')).toBe('£184')
  })
  it('falls back rather than throwing on a hand-edited currency', () => {
    expect(formatMoney(184, 'dollars')).toBe('dollars 184')
  })
  it('formats zero', () => {
    expect(formatMoney(0)).toBe('$0')
  })
})

describe('formatSpendMeta', () => {
  it('matches the comp: "$184 / 250"', () => {
    expect(formatSpendMeta(row('groceries', 184, 250))).toBe('$184 / 250')
  })
  it('shows only the amount when nothing caps it', () => {
    expect(formatSpendMeta(row('books', 67, null))).toBe('$67')
  })
  it('keeps cents on a fractional limit', () => {
    expect(formatLimit(60.5)).toBe('60.50')
  })
})

describe('parseAmount', () => {
  it.each([
    ['12', 12],
    ['12.40', 12.4],
    ['$12.40', 12.4],
    ['1,240', 1240],
    ['-40', -40],
    ['−40', -40],
    ['  8.5 ', 8.5],
  ])('parses %s', (input, expected) => {
    expect(parseAmount(input)).toBe(expected)
  })

  it.each(['', '   ', 'abc', '-', '1.2.3', '12x'])('declines %s rather than inventing a number', (input) => {
    expect(parseAmount(input)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// grouping
// ---------------------------------------------------------------------------

describe('groupSpend', () => {
  it('puts capped categories on bars and uncapped ones on plain lines', () => {
    const groups = groupSpend(
      [row('groceries', 184, 250), row('coffee', 41, null)],
      ['groceries', 'coffee']
    )
    expect(groups.budgeted.map((entry) => entry.category)).toEqual(['groceries'])
    expect(groups.uncapped.map((entry) => entry.category)).toEqual(['coffee'])
    expect(groups.offBudget).toHaveLength(0)
  })

  it('gives a category settings has never heard of its own off-budget line (F4)', () => {
    const groups = groupSpend([row('groceries', 184, 250), row('vinyl', 28, null)], ['groceries'])
    expect(groups.offBudget.map((entry) => entry.category)).toEqual(['vinyl'])
    // And the money is still in the total. Nothing goes missing for want of a category.
    expect(groups.totalSpent).toBe(212)
  })

  it('gives uncategorised its own line, separate from off-budget categories', () => {
    const groups = groupSpend(
      [row('groceries', 184, 250), row('vinyl', 28, null), row(UNCATEGORISED, 67, null)],
      ['groceries']
    )
    expect(groups.uncategorised?.spent).toBe(67)
    expect(groups.offBudget.map((entry) => entry.category)).toEqual(['vinyl'])
    expect(groups.totalSpent).toBe(279)
  })

  it('treats a user-defined category literally called "uncategorised" as theirs', () => {
    const groups = groupSpend([row(UNCATEGORISED, 67, 100)], [UNCATEGORISED])
    expect(groups.uncategorised).toBeNull()
    expect(groups.budgeted).toHaveLength(1)
  })

  it('counts how many categories are over', () => {
    const groups = groupSpend(
      [row('groceries', 312, 250), row('coffee', 41, 60), row('transit', 55, 40)],
      ['groceries', 'coffee', 'transit']
    )
    expect(groups.overCount).toBe(2)
    expect(groups.totalLimit).toBe(350)
  })

  it('reports no total limit when nothing is capped', () => {
    expect(groupSpend([row('a', 10, null)], ['a']).totalLimit).toBeNull()
  })

  it('sums cleanly with negatives (income and refunds)', () => {
    const groups = groupSpend([row('salary', -800, null), row('groceries', 184, 250)], [])
    expect(groups.totalSpent).toBe(-616)
    expect(groups.hasIncome).toBe(true)
  })

  it('compares only budgeted spend to the planned total', () => {
    // Comparing the month's NET — income and off-budget included — to three grocery
    // limits would read as "−$331 of $350 planned", which is not a real comparison.
    const groups = groupSpend(
      [
        row('groceries', 312, 250),
        row('coffee', 41, 60),
        row('income', -820, null),
        row('vinyl', 28, null),
        row(UNCATEGORISED, 67, null),
      ],
      ['groceries', 'coffee']
    )
    expect(groups.budgetedSpent).toBe(353)
    expect(groups.totalLimit).toBe(310)
    expect(groups.totalSpent).toBe(-372)
    expect(groups.hasIncome).toBe(true)
  })

  it('says "total" rather than "net" when no money came in', () => {
    const groups = groupSpend([row('groceries', 184, 250)], ['groceries'])
    expect(groups.hasIncome).toBe(false)
    expect(groups.budgetedSpent).toBe(184)
  })
})

describe('isFirstRun', () => {
  it('is true with no categories and no spend — the day-one state', () => {
    expect(isFirstRun([], [])).toBe(true)
  })
  it('is false once anything has been logged, even uncategorised', () => {
    expect(isFirstRun([row(UNCATEGORISED, 12, null)], [])).toBe(false)
  })
  it('is false once a category exists, even with no spend', () => {
    expect(isFirstRun([], ['groceries'])).toBe(false)
  })
})

describe('categoryLabel', () => {
  it('capitalises only the first character, leaving user text alone', () => {
    expect(categoryLabel('groceries')).toBe('Groceries')
    expect(categoryLabel('Coffee & tea')).toBe('Coffee & tea')
    expect(categoryLabel('CMU dining')).toBe('CMU dining')
  })
  it('names the blank and the uncategorised case the same way', () => {
    expect(categoryLabel('')).toBe('Uncategorised')
    expect(categoryLabel(UNCATEGORISED)).toBe('Uncategorised')
  })
})

describe('nameIsTaken', () => {
  it('is case-insensitive', () => {
    expect(nameIsTaken('Groceries', [{ name: 'groceries' }])).toBe(true)
  })
  it('ignores the row being edited', () => {
    expect(nameIsTaken('groceries', [{ name: 'groceries' }], 0)).toBe(false)
  })
})

describe('isUncategorised', () => {
  it('matches the repository constant, case and whitespace insensitively', () => {
    expect(isUncategorised('  Uncategorised ')).toBe(true)
    expect(isUncategorised('groceries')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// months
// ---------------------------------------------------------------------------

describe('month helpers', () => {
  it('derives the key from local time, not UTC', () => {
    // 1 Jan 00:30 local is still December in UTC in a western timezone; keying on
    // toISOString() would misfile it.
    expect(monthKeyOf(new Date(2026, 0, 1, 0, 30))).toBe('2026-01')
    expect(monthKeyOf(new Date(2026, 11, 31, 23, 30))).toBe('2026-12')
  })

  it('steps across a year boundary in both directions', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2025-12', 1)).toBe('2026-01')
    expect(shiftMonth('2026-08', -8)).toBe('2025-12')
  })

  it('names the month, adding the year only when it is not this one', () => {
    const now = new Date(2026, 7, 1)
    expect(monthLabel('2026-08', now)).toBe('August')
    expect(monthLabel('2025-08', now)).toBe('August 2025')
  })

  it('writes the comp’s meta line for the current month', () => {
    const now = new Date(2026, 7, 1)
    expect(monthMeta('2026-08', now)).toBe('August, so far')
    expect(monthMeta('2026-07', now)).toBe('July')
  })
})

describe('groupPurchasesByDate', () => {
  const purchase = (id: string, date: string, amount: number, created: number) => ({
    id,
    date,
    amount,
    category: 'x',
    description: id,
    source: 'app' as const,
    created_at: created,
  })

  it('groups newest day first and newest capture first within a day', () => {
    const groups = groupPurchasesByDate([
      purchase('a', '2026-08-01', 10, 1),
      purchase('b', '2026-08-02', 20, 2),
      purchase('c', '2026-08-01', 5, 3),
    ])
    expect(groups.map((group) => group.date)).toEqual(['2026-08-02', '2026-08-01'])
    expect(groups[1]?.purchases.map((entry) => entry.id)).toEqual(['c', 'a'])
    expect(groups[1]?.total).toBe(15)
  })

  it('nets a refund against the day it lands on', () => {
    const groups = groupPurchasesByDate([
      purchase('a', '2026-08-01', 40, 1),
      purchase('b', '2026-08-01', -15, 2),
    ])
    expect(groups[0]?.total).toBe(25)
  })
})

// ---------------------------------------------------------------------------
// against the real repository — the UI's assumptions, checked on real output
// ---------------------------------------------------------------------------

describe('against financeRepository on a temp vault', () => {
  let vault: TempVault

  beforeEach(async () => {
    vault = await createTempVault('finance-ui')
  })

  afterEach(async () => {
    await vault.dispose()
  })

  const today = (): string => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  }

  it('agrees with the repository on where a blank category is filed', () => {
    // The renderer cannot import from the main process, so the constant is mirrored.
    // This is the assertion that stops the two drifting.
    expect(UNCATEGORISED).toBe(REPO_UNCATEGORISED)
  })

  it('day one: no categories, no purchases, nothing to draw', async () => {
    const settings = await settingsRepository.get()
    expect(settings.finance.categories).toEqual([])

    const summary = await financeRepository.monthSummary(monthKeyOf())
    expect(summary).toEqual([])
    expect(isFirstRun(summary, settings.finance.categories.map((entry) => entry.name))).toBe(true)
  })

  it('logs a purchase in an unknown category and shows it off-budget', async () => {
    await settingsRepository.update({
      finance: { categories: [{ name: 'groceries', limit: 250 }] },
    })
    await financeRepository.create({
      date: today(),
      amount: 28,
      category: 'vinyl',
      description: 'record shop',
      source: 'app',
    })

    const settings = await settingsRepository.get()
    const summary = await financeRepository.monthSummary(monthKeyOf())
    const groups = groupSpend(summary, settings.finance.categories.map((entry) => entry.name))

    expect(groups.offBudget.map((entry) => entry.category)).toEqual(['vinyl'])
    expect(groups.budgeted.map((entry) => entry.category)).toEqual(['groceries'])
    expect(groups.totalSpent).toBe(28)
  })

  it('logs a purchase with no category at all onto the uncategorised line', async () => {
    await financeRepository.create({
      date: today(),
      amount: 67,
      category: '',
      description: 'something',
      source: 'app',
    })

    const summary = await financeRepository.monthSummary(monthKeyOf())
    const groups = groupSpend(summary, [])
    expect(groups.uncategorised?.category).toBe(UNCATEGORISED)
    expect(groups.uncategorised?.spent).toBe(67)
  })

  it('renders a real over-limit category in gold, with the overage stated', async () => {
    await settingsRepository.update({
      finance: { categories: [{ name: 'groceries', limit: 250 }] },
    })
    await financeRepository.create({
      date: today(),
      amount: 312,
      category: 'groceries',
      description: 'a big shop',
      source: 'app',
    })

    const summary = await financeRepository.monthSummary(monthKeyOf())
    const groceries = summary.find((entry) => entry.category === 'groceries')
    expect(groceries).toBeDefined()
    expect(isOverLimit(groceries!)).toBe(true)
    expect(barFraction(groceries!)).toBe(1)
    expect(formatSpendMeta(groceries!)).toBe('$312 / 250')
    expect(overageNote(groceries!)).toBe('$62 over')
  })

  it('keeps a category with a null limit as tracked-but-uncapped, not off-budget', async () => {
    await settingsRepository.update({
      finance: { categories: [{ name: 'books', limit: null }] },
    })
    await financeRepository.create({
      date: today(),
      amount: 19,
      category: 'books',
      description: 'ddia',
      source: 'app',
    })

    const settings = await settingsRepository.get()
    const summary = await financeRepository.monthSummary(monthKeyOf())
    const groups = groupSpend(summary, settings.finance.categories.map((entry) => entry.name))

    expect(groups.uncapped.map((entry) => entry.category)).toEqual(['books'])
    expect(groups.offBudget).toHaveLength(0)
    expect(groups.budgeted).toHaveLength(0)
  })

  it('round-trips an in-app category edit through settings.json', async () => {
    await settingsRepository.update({
      finance: { categories: [{ name: 'coffee', limit: 60 }] },
    })
    expect((await settingsRepository.get()).finance.categories).toEqual([
      { name: 'coffee', limit: 60 },
    ])

    // Arrays replace wholesale — a removed category has to actually go.
    await settingsRepository.update({ finance: { categories: [] } })
    expect((await settingsRepository.get()).finance.categories).toEqual([])
  })
})
