import type { BudgetCategory, CategorySpend, Purchase } from '@shared/types'

import { bridge } from '@/lib/bridge'
import { useVaultQuery, type VaultQuery } from './useVaultQuery'
import { invalidateVault } from './vault'
import { updateSettings } from './settings'

/**
 * Finance reads and writes. Shaped after `store/inbox.ts`: reads are hooks over
 * `useVaultQuery`, writes are plain async functions that call `bridge()` then
 * `invalidateVault()`. Nothing is mirrored into zustand — the vault is the cache.
 */

/** Every purchase, newest first. The log. */
export function usePurchases(): VaultQuery<Purchase[]> {
  return useVaultQuery(() => bridge().finance.list(), [])
}

/** Spent vs limit per category for a `YYYY-MM` period. */
export function useMonthSummary(month: string): VaultQuery<CategorySpend[]> {
  return useVaultQuery(() => bridge().finance.monthSummary(month), [month])
}

export interface PurchaseDraft {
  date: string
  amount: number
  /** Free text. A category absent from settings still logs — taxonomy never blocks capture. */
  category: string
  description: string
}

export async function logPurchase(draft: PurchaseDraft): Promise<Purchase> {
  const purchase = await bridge().finance.create({
    date: draft.date,
    amount: draft.amount,
    category: draft.category.trim(),
    description: draft.description.trim(),
    source: 'app',
  })
  invalidateVault()
  return purchase
}

export async function editPurchase(
  id: string,
  updates: Partial<PurchaseDraft>
): Promise<Purchase> {
  const purchase = await bridge().finance.update(id, {
    ...(updates.date !== undefined ? { date: updates.date } : {}),
    ...(updates.amount !== undefined ? { amount: updates.amount } : {}),
    ...(updates.category !== undefined ? { category: updates.category.trim() } : {}),
    ...(updates.description !== undefined ? { description: updates.description.trim() } : {}),
  })
  invalidateVault()
  return purchase
}

export async function removePurchase(id: string): Promise<void> {
  await bridge().finance.remove(id)
  invalidateVault()
}

/**
 * Budget categories live in `settings.finance.categories` and start empty. They are
 * written whole because arrays replace wholesale — that is what makes a deleted category
 * actually delete instead of being merged back in element-wise.
 */
export async function saveBudgetCategories(categories: BudgetCategory[]): Promise<void> {
  await updateSettings({ finance: { categories } })
}
