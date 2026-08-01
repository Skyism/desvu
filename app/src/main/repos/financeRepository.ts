import type { CategorySpend, DateString, FinanceFile, Purchase, Source } from '@shared/types'
import { dataPath } from '@shared/vault'
import { addDays, addMonthsClamped, isMonthKey } from '../lib/dates'
import { NotFoundError, ValidationError } from '../lib/errors'
import { newId } from '../lib/ids'
import { createJsonStore, expectObject } from '../lib/json-store'
import { Issues, checkDate, checkFiniteNumber, checkSource } from '../lib/validate'
import { settingsRepository } from './settingsRepository'

/** Where a purchase with a blank category is filed. Taxonomy never blocks capture (F4). */
import { UNCATEGORISED } from '@shared/types'
export { UNCATEGORISED }

const store = createJsonStore<FinanceFile>(
  () => dataPath('finance.json'),
  () => ({ purchases: [] }),
  (parsed, filePath) => {
    const file = expectObject<Partial<FinanceFile>>(parsed, filePath)
    return { purchases: Array.isArray(file.purchases) ? file.purchases : [] }
  }
)

function normalize(raw: Partial<Purchase>): Purchase {
  const created = typeof raw.created_at === 'number' ? raw.created_at : Date.now()
  return {
    id: typeof raw.id === 'string' && raw.id !== '' ? raw.id : newId(),
    date: typeof raw.date === 'string' ? raw.date : '1970-01-01',
    amount: typeof raw.amount === 'number' && Number.isFinite(raw.amount) ? raw.amount : 0,
    category: typeof raw.category === 'string' ? raw.category.trim() : '',
    description: typeof raw.description === 'string' ? raw.description : '',
    source: (['app', 'telegram', 'import'] as string[]).includes(raw.source as string)
      ? (raw.source as Source)
      : 'app',
    created_at: created,
  }
}

async function readAll(): Promise<Purchase[]> {
  return (await store.read()).purchases.map(normalize)
}

type PurchaseInput = Omit<Purchase, 'id' | 'created_at'>

function validate(input: Partial<PurchaseInput>, { partial }: { partial: boolean }): void {
  const issues = new Issues()

  if (!partial || input.date !== undefined) checkDate(issues, 'date', input.date)
  if (!partial || input.amount !== undefined) checkFiniteNumber(issues, 'amount', input.amount)
  if (input.source !== undefined) checkSource(issues, 'source', input.source)
  if (input.category !== undefined && typeof input.category !== 'string') {
    issues.add('category must be text')
  }
  if (input.description !== undefined && typeof input.description !== 'string') {
    issues.add('description must be text')
  }

  issues.throwIfAny()
}

/**
 * The budget period containing `monthKey`, honouring `finance.month_starts_on` so a user
 * whose money arrives on the 15th sees a period that matches their actual month.
 */
function periodFor(monthKey: string, startsOn: number): { from: DateString; to: DateString } {
  const from = addMonthsClamped(`${monthKey}-01`, 0, startsOn)
  const nextStart = addMonthsClamped(from, 1, startsOn)
  return { from, to: addDays(nextStart, -1) }
}

export const financeRepository = {
  async list(): Promise<Purchase[]> {
    return (await readAll()).sort(
      (a, b) => b.date.localeCompare(a.date) || b.created_at - a.created_at
    )
  },

  async create(input: PurchaseInput): Promise<Purchase> {
    validate(input, { partial: false })
    const now = Date.now()

    return store.mutate((current) => {
      const purchase: Purchase = {
        id: newId(),
        date: input.date,
        amount: input.amount,
        // Deliberately not checked against `settings.finance.categories`: a purchase in
        // an unknown category still logs and shows as uncategorised (PRD F4).
        category: (input.category ?? '').trim(),
        description: input.description ?? '',
        source: input.source ?? 'app',
        created_at: now,
      }
      const purchases = current.purchases.map(normalize)
      purchases.push(purchase)
      return { data: { purchases }, result: purchase }
    })
  },

  async update(id: string, updates: Partial<PurchaseInput>): Promise<Purchase> {
    validate(updates, { partial: true })

    return store.mutate((current) => {
      const purchases = current.purchases.map(normalize)
      const index = purchases.findIndex((purchase) => purchase.id === id)
      if (index === -1) throw new NotFoundError(`No purchase with id ${id}`)

      const patch = Object.fromEntries(
        Object.entries(updates).filter(([, value]) => value !== undefined)
      ) as Partial<PurchaseInput>

      const next: Purchase = { ...(purchases[index] as Purchase), ...patch }
      purchases[index] = next
      return { data: { purchases }, result: next }
    })
  },

  async remove(id: string): Promise<void> {
    await store.mutate((current) => {
      const purchases = current.purchases.map(normalize)
      const index = purchases.findIndex((purchase) => purchase.id === id)
      if (index === -1) throw new NotFoundError(`No purchase with id ${id}`)
      purchases.splice(index, 1)
      return { data: { purchases }, result: undefined }
    })
  },

  /**
   * Spent vs limit per category for the given `YYYY-MM` period (PRD F3). Every configured
   * budget category appears even at zero spend, and every spent-in category appears even
   * when it is not configured — otherwise money would go missing from the total.
   */
  async monthSummary(month: string): Promise<CategorySpend[]> {
    if (!isMonthKey(month)) {
      throw new ValidationError(`month must be YYYY-MM (got "${month}")`)
    }

    const [purchases, settings] = await Promise.all([readAll(), settingsRepository.get()])
    const { from, to } = periodFor(month, settings.finance.month_starts_on)

    const spendByCategory = new Map<string, number>()
    for (const category of settings.finance.categories) {
      spendByCategory.set(category.name, 0)
    }

    for (const purchase of purchases) {
      if (purchase.date < from || purchase.date > to) continue
      const key = purchase.category.trim() === '' ? UNCATEGORISED : purchase.category.trim()
      spendByCategory.set(key, (spendByCategory.get(key) ?? 0) + purchase.amount)
    }

    const limits = new Map(
      settings.finance.categories.map((category) => [category.name, category.limit])
    )

    return [...spendByCategory.entries()]
      .map(([category, spentRaw]) => {
        const spent = Number(spentRaw.toFixed(2))
        const limit = limits.get(category) ?? null
        return {
          category,
          spent,
          limit,
          configured: limits.has(category),
          fraction: limit !== null && limit > 0 ? Number((spent / limit).toFixed(4)) : null,
        }
      })
      .sort((a, b) => b.spent - a.spent || a.category.localeCompare(b.category))
  },

  /** Not on `DesvuApi` — search needs the raw rows. */
  async listAll(): Promise<Purchase[]> {
    return readAll()
  },
}

export type FinanceRepository = typeof financeRepository
